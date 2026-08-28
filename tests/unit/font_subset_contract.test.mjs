import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as fontkit from "fontkit";
import test from "node:test";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const sourceFontDirectory = join(repositoryRoot, "scripts", "font-subsets", "source");
const fontPairs = [
  {
    source: join(sourceFontDirectory, "manrope-cyrillic.woff2"),
    subset: join(repositoryRoot, "assets", "fonts", "manrope-cyrillic.woff2")
  },
  {
    source: join(sourceFontDirectory, "manrope-latin.woff2"),
    subset: join(repositoryRoot, "assets", "fonts", "manrope-latin.woff2")
  }
];

function decodeHtmlEntities(value) {
  return value
    .replace(/&#x([\da-f]+);/giu, (_, hexadecimal) => String.fromCodePoint(Number.parseInt(hexadecimal, 16)))
    .replace(/&#(\d+);/gu, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&(amp|apos|copy|gt|lt|nbsp|quot);/gu, (_, entity) => ({
      amp: "&",
      apos: "'",
      copy: "©",
      gt: ">",
      lt: "<",
      nbsp: "\u00a0",
      quot: "\""
    })[entity]);
}

function publicHtmlCharacters(siteDirectory) {
  return readdirSync(siteDirectory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .flatMap((entry) => {
      const html = readFileSync(join(entry.parentPath, entry.name), "utf8")
        .replace(/<!--[\s\S]*?-->/gu, " ")
        .replace(/<(script|style)\b[\s\S]*?<\/\1>/giu, " ")
        .replace(/<[^>]*>/gu, " ");
      return [...decodeHtmlEntities(html)];
    });
}

function readFont(fontPath) {
  const font = fontkit.openSync(fontPath);
  const weight = font.variationAxes.wght;

  assert.deepEqual(
    { min: weight?.min, max: weight?.max },
    { min: 200, max: 800 },
    `${fontPath} keeps the Manrope variable wght axis from 200 through 800`
  );

  return {
    characterSet: new Set(font.characterSet),
    fileSize: font.stream.length
  };
}

test("Manrope subsets cover the source-supported public HTML corpus and retain the variable weight axis", () => {
  const siteDirectory = mkdtempSync(join(tmpdir(), "smart-electrics-font-contract-"));

  try {
    execFileSync(
      "bundle",
      ["exec", "jekyll", "build", "--destination", siteDirectory, "--trace"],
      { cwd: repositoryRoot, env: { ...process.env, JEKYLL_ENV: "production" }, stdio: "pipe" }
    );

    const corpus = publicHtmlCharacters(siteDirectory);
    assert.equal(corpus.includes("В"), true, "the built Ukrainian public corpus is the contract input");
    assert.equal(corpus.includes("S"), true, "the built Latin public corpus is the contract input");

    const sourceFonts = fontPairs.map(({ source }) => readFont(source));
    const subsetFonts = fontPairs.map(({ subset }) => readFont(subset));
    const sourceCoverage = new Set(sourceFonts.flatMap(({ characterSet }) => [...characterSet]));
    const subsetCoverage = new Set(subsetFonts.flatMap(({ characterSet }) => [...characterSet]));
    const missingCharacters = [...new Set(corpus)]
      .filter((character) => sourceCoverage.has(character.codePointAt(0)))
      .filter((character) => !subsetCoverage.has(character.codePointAt(0)));

    assert.deepEqual(
      missingCharacters,
      [],
      `subsets must cover every source-supported character from built public HTML: ${missingCharacters.join("")}`
    );
    for (const [index, subsetFont] of subsetFonts.entries()) {
      assert.ok(
        subsetFont.fileSize < sourceFonts[index].fileSize,
        "each public WOFF2 is smaller than its preserved source font"
      );
    }
  } finally {
    rmSync(siteDirectory, { recursive: true, force: true });
  }
});
