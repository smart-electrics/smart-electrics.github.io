import assert from "node:assert/strict";
import test from "node:test";

import {
  boundedRouteVector,
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
    defaultPrevented: false,
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
    request({ href: "/services/", target: "_self" }),
    request({ href: "/services/", target: "" }),
    request({ href: "/services/", defaultPrevented: true }),
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

test("bounds a causal source-to-destination vector and permits a neutral self-source handoff", () => {
  const bounded = boundedRouteVector(
    { left: 0, top: 0, width: 100, height: 100 },
    { left: 900, top: -200, width: 100, height: 100 }
  );
  assert.equal(bounded.x, 72);
  assert.equal(bounded.y, -54);
  assert.ok(Math.abs(bounded.midX - 34.56) < 0.001);
  assert.ok(Math.abs(bounded.midY + 25.92) < 0.001);
  assert.deepEqual(
    boundedRouteVector(
      { left: 10, top: 20, width: 40, height: 40 },
      { left: 10, top: 20, width: 40, height: 40 }
    ),
    { x: 0, y: 0, midX: 0, midY: 0 }
  );
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

test("lifecycle completes a visibility handoff with one native location assignment", () => {
  const navigations = [];
  const cleanups = [];
  const lifecycle = createCinematicRouteLifecycle({
    navigate: (href) => navigations.push(href),
    cleanup: (reason) => cleanups.push(reason)
  });

  const token = lifecycle.begin(`${origin}/services/`);
  assert.equal(lifecycle.finish(token, "visibility"), true);
  assert.equal(lifecycle.finish(token, "pagehide"), false);
  assert.deepEqual(navigations, [`${origin}/services/`]);
  assert.deepEqual(cleanups, ["visibility"]);
});

test("lifecycle can clear a pagehide handoff without overriding native navigation", () => {
  const navigations = [];
  const cleanups = [];
  const lifecycle = createCinematicRouteLifecycle({
    navigate: (href) => navigations.push(href),
    cleanup: (reason) => cleanups.push(reason)
  });

  const token = lifecycle.begin(`${origin}/solutions/`);
  assert.equal(lifecycle.cancel(token, "pagehide"), true);
  assert.equal(lifecycle.finish(token), false);
  assert.deepEqual(navigations, []);
  assert.deepEqual(cleanups, ["pagehide"]);
});
