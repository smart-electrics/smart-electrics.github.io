import assert from "node:assert/strict";
import test from "node:test";

import {
  createCinematicRouteLifecycle,
  qualifyCinematicRoute
} from "../../assets/js/cinematic-route-transition.js";

const origin = "https://smart-electrics.test";
const currentURL = `${origin}/`;

function request(overrides = {}) {
  return {
    optedIn: true,
    href: "/services/",
    currentURL,
    origin,
    target: null,
    download: false,
    button: 0,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...overrides
  };
}

test("qualifies only an opted-in unmodified primary same-origin path or query navigation", () => {
  assert.equal(qualifyCinematicRoute(request()), `${origin}/services/`);
  assert.equal(
    qualifyCinematicRoute(request({ href: "/?view=systems" })),
    `${origin}/?view=systems`
  );
  assert.equal(
    qualifyCinematicRoute(request({ href: "/services/#lighting" })),
    `${origin}/services/#lighting`
  );
});

test("leaves utility, modified, external, fragment-only, target, and malformed links native", () => {
  const rejected = [
    request({ optedIn: false }),
    request({ href: "#main-content" }),
    request({ href: "/" }),
    request({ href: "/#main-content" }),
    request({ href: "mailto:hello@example.test" }),
    request({ href: "tel:+380000000000" }),
    request({ href: "javascript:void(0)" }),
    request({ href: "https://example.test/services/" }),
    request({ href: "/services/", target: "_blank" }),
    request({ href: "/services/", download: true }),
    request({ href: "/services/", button: 1 }),
    request({ href: "/services/", ctrlKey: true }),
    request({ href: "/services/", metaKey: true }),
    request({ href: "/services/", shiftKey: true }),
    request({ href: "/services/", altKey: true }),
    request({ href: "http://[not-a-url" })
  ];

  rejected.forEach((candidate) => assert.equal(qualifyCinematicRoute(candidate), null));
});

test("lifecycle accepts one completion, replaces an unfinished handoff, and never navigates twice", () => {
  const navigations = [];
  const cleanups = [];
  const lifecycle = createCinematicRouteLifecycle({
    navigate: (href) => navigations.push(href),
    cleanup: (reason) => cleanups.push(reason)
  });

  const first = lifecycle.begin(`${origin}/services/`);
  const second = lifecycle.begin(`${origin}/solutions/`);

  assert.equal(lifecycle.finish(first), false);
  assert.equal(lifecycle.finish(second), true);
  assert.equal(lifecycle.finish(second), false);
  assert.deepEqual(navigations, [`${origin}/solutions/`]);
  assert.deepEqual(cleanups, ["replacement", "complete"]);
});

test("lifecycle cancels an active handoff without assigning location", () => {
  const navigations = [];
  const cleanups = [];
  const lifecycle = createCinematicRouteLifecycle({
    navigate: (href) => navigations.push(href),
    cleanup: (reason) => cleanups.push(reason)
  });

  const token = lifecycle.begin(`${origin}/services/`);
  assert.equal(lifecycle.cancel(token, "visibility"), true);
  assert.equal(lifecycle.cancel(token, "pagehide"), false);
  assert.deepEqual(navigations, []);
  assert.deepEqual(cleanups, ["visibility"]);
});
