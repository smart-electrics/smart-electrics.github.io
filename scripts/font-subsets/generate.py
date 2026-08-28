#!/usr/bin/env python3
"""Generate Manrope webfont subsets from the production public HTML corpus."""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from html.parser import HTMLParser
from pathlib import Path

from fontTools.ttLib import TTFont


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIRECTORY = Path(__file__).resolve().parent / "source"
FONT_PAIRS = (
    (SOURCE_DIRECTORY / "manrope-cyrillic.woff2", REPOSITORY_ROOT / "assets/fonts/manrope-cyrillic.woff2"),
    (SOURCE_DIRECTORY / "manrope-latin.woff2", REPOSITORY_ROOT / "assets/fonts/manrope-latin.woff2"),
)


class PublicTextParser(HTMLParser):
    """Collect rendered-document text while excluding executable and stylesheet source."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.characters: set[int] = set()
        self._excluded_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() in {"script", "style"}:
            self._excluded_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in {"script", "style"} and self._excluded_depth:
            self._excluded_depth -= 1

    def handle_data(self, data: str) -> None:
        if not self._excluded_depth:
            self.characters.update(map(ord, data))


def public_html_codepoints(site_directory: Path) -> set[int]:
    parser = PublicTextParser()
    for html_path in sorted(site_directory.rglob("*.html")):
        parser.feed(html_path.read_text(encoding="utf-8"))
    parser.close()
    return parser.characters


def font_codepoints(font_path: Path) -> set[int]:
    font = TTFont(font_path, lazy=True)
    try:
        return set(font.getBestCmap())
    finally:
        font.close()


def build_public_site(site_directory: Path) -> None:
    environment = {**os.environ, "JEKYLL_ENV": "production"}
    subprocess.run(
        ["bundle", "exec", "jekyll", "build", "--destination", str(site_directory), "--trace"],
        cwd=REPOSITORY_ROOT,
        env=environment,
        check=True,
    )


def subset_font(source: Path, destination: Path, codepoints: set[int]) -> None:
    selected = sorted(font_codepoints(source) & codepoints)
    if not selected:
        raise RuntimeError(f"No public source-supported codepoints selected from {source}")

    temporary_output = destination.with_suffix(".tmp.woff2")
    unicode_argument = ",".join(f"U+{codepoint:04X}" for codepoint in selected)
    subprocess.run(
        [
            sys.executable,
            "-m",
            "fontTools.subset",
            str(source),
            f"--unicodes={unicode_argument}",
            "--flavor=woff2",
            "--layout-features=*",
            "--output-file=" + str(temporary_output),
        ],
        cwd=REPOSITORY_ROOT,
        check=True,
    )
    temporary_output.replace(destination)


def main() -> None:
    for source, _ in FONT_PAIRS:
        if not source.is_file():
            raise FileNotFoundError(f"Preserved source font is missing: {source}")

    with tempfile.TemporaryDirectory(prefix="smart-electrics-font-subsets-") as temporary_directory:
        site_directory = Path(temporary_directory) / "site"
        build_public_site(site_directory)
        codepoints = public_html_codepoints(site_directory)
        for source, destination in FONT_PAIRS:
            subset_font(source, destination, codepoints)


if __name__ == "__main__":
    main()
