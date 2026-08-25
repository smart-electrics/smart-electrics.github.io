const HTTP_PROTOCOLS = new Set(["http:", "https:"]);
const primaryButton = 0;
const boundedDelay = 420;
const vectorLimits = Object.freeze({ x: 72, y: 54 });
const minimumVisibleSurface = 0.5;

const isString = (value) => typeof value === "string" && value.trim().length > 0;

export function qualifyCinematicRoute(request) {
  if (request === null || typeof request !== "object" || request.optedIn !== true) return null;
  if (
    request.defaultPrevented === true || request.button !== primaryButton || request.altKey || request.ctrlKey || request.metaKey || request.shiftKey ||
    request.download === true || request.target !== null
  ) return null;

  try {
    const current = new URL(request.currentURL);
    const destination = new URL(request.href, current);
    if (
      !isString(request.origin) || current.origin !== request.origin || destination.origin !== request.origin ||
      !HTTP_PROTOCOLS.has(destination.protocol) ||
      (destination.pathname === current.pathname && destination.search === current.search)
    ) return null;
    return destination.href;
  } catch (_) {
    return null;
  }
}

export function createCinematicRouteLifecycle({ navigate, cleanup }) {
  if (typeof navigate !== "function" || typeof cleanup !== "function") throw new TypeError("A lifecycle needs navigation and cleanup functions");

  let active = null;
  let nextId = 0;

  const close = (token, reason, shouldNavigate) => {
    if (active !== token) return false;
    active = null;
    cleanup(reason);
    if (shouldNavigate) navigate(token.href);
    return true;
  };

  return Object.freeze({
    begin(href) {
      if (!isString(href)) throw new TypeError("A route handoff needs a destination");
      if (active) close(active, "replacement", false);
      active = Object.freeze({ id: ++nextId, href });
      return active;
    },
    finish(token, reason = "complete") {
      return close(token, reason, true);
    },
    cancel(token, reason = "cancel") {
      return close(token, reason, false);
    }
  });
}

const boundedNumber = (value, limit) => Math.max(-limit, Math.min(limit, value));

export function boundedRouteVector(sourceGeometry, destinationGeometry) {
  const hasGeometry = (geometry) => geometry && [geometry.left, geometry.top, geometry.width, geometry.height]
    .every((value) => Number.isFinite(value));
  if (!hasGeometry(sourceGeometry) || !hasGeometry(destinationGeometry)) {
    return Object.freeze({ x: 0, y: 0, midX: 0, midY: 0 });
  }
  const sourceCenterX = sourceGeometry.left + sourceGeometry.width / 2;
  const sourceCenterY = sourceGeometry.top + sourceGeometry.height / 2;
  const destinationCenterX = destinationGeometry.left + destinationGeometry.width / 2;
  const destinationCenterY = destinationGeometry.top + destinationGeometry.height / 2;
  const x = boundedNumber(destinationCenterX - sourceCenterX, vectorLimits.x);
  const y = boundedNumber(destinationCenterY - sourceCenterY, vectorLimits.y);
  return Object.freeze({ x, y, midX: x * 0.48, midY: y * 0.48 });
}

const exactlyOne = (root, selector) => {
  const matches = root.querySelectorAll(selector);
  return matches.length === 1 ? matches[0] : null;
};

function sourceMap(root) {
  const sources = [...root.querySelectorAll("[data-cinematic-route-source]")];
  const known = new Map();
  for (const source of sources) {
    const id = source.dataset.cinematicRouteSource?.trim();
    if (!id || known.has(id)) return null;
    known.set(id, source);
  }
  return known;
}

function anchorContract(anchor, sources) {
  if (!(anchor instanceof HTMLAnchorElement) || !anchor.hasAttribute("href")) return null;
  const sourceRef = anchor.dataset.cinematicRouteSourceRef?.trim();
  return sourceRef && sources.get(sourceRef) ? sources.get(sourceRef) : null;
}

function validInitialContract(root, sources) {
  if (!root || !sources || document.querySelectorAll("[data-cinematic-route-snapshot]").length !== 0) return false;
  return [...root.querySelectorAll("[data-cinematic-route]")].every((anchor) => anchorContract(anchor, sources));
}

function geometryFor(element) {
  const bounds = element.getBoundingClientRect();
  return bounds.width > 0 && bounds.height > 0 ? bounds : null;
}

function viewportIntersectionRatio(bounds) {
  if (!bounds || window.innerWidth <= 0 || window.innerHeight <= 0) return 0;
  const left = Math.max(bounds.left, 0);
  const top = Math.max(bounds.top, 0);
  const right = Math.min(bounds.right, window.innerWidth);
  const bottom = Math.min(bounds.bottom, window.innerHeight);
  const visibleArea = Math.max(0, right - left) * Math.max(0, bottom - top);
  return visibleArea / (bounds.width * bounds.height);
}

function isMeaningfullyVisible(bounds) {
  return viewportIntersectionRatio(bounds) >= minimumVisibleSurface;
}

function visualFor(source) {
  const candidates = source instanceof HTMLImageElement
    ? [source]
    : [...source.querySelectorAll("img")];
  const image = candidates.find((candidate) => geometryFor(candidate) && isString(candidate.currentSrc || candidate.src));
  if (!image) return { image: null, unusable: false };
  return {
    image: image.complete && image.naturalWidth > 0 && image.naturalHeight > 0 ? image : null,
    unusable: !(image.complete && image.naturalWidth > 0 && image.naturalHeight > 0)
  };
}

function createSnapshot(source, destination) {
  if (document.querySelectorAll("[data-cinematic-route-snapshot]").length !== 0) return null;
  const sourceGeometry = geometryFor(source);
  const destinationGeometry = geometryFor(destination);
  const visual = visualFor(source);
  if (!sourceGeometry || !destinationGeometry || visual.unusable) return null;

  const sourceVisible = isMeaningfullyVisible(sourceGeometry);
  const surface = sourceVisible ? source : destination;
  const surfaceGeometry = sourceVisible ? sourceGeometry : destinationGeometry;
  if (!isMeaningfullyVisible(surfaceGeometry)) return null;

  const image = sourceVisible ? visual.image : null;
  const imageGeometry = image && geometryFor(image);
  if (image && !imageGeometry) return null;

  const snapshot = document.createElement("div");
  snapshot.className = "cinematic-route-snapshot";
  snapshot.dataset.cinematicRouteSnapshot = "";
  snapshot.setAttribute("aria-hidden", "true");
  const vector = boundedRouteVector(surfaceGeometry, destinationGeometry);
  snapshot.style.setProperty("--cinematic-route-vector-mid-x", `${vector.midX}px`);
  snapshot.style.setProperty("--cinematic-route-vector-mid-y", `${vector.midY}px`);
  snapshot.style.setProperty("--cinematic-route-vector-x", `${vector.x}px`);
  snapshot.style.setProperty("--cinematic-route-vector-y", `${vector.y}px`);
  Object.assign(snapshot.style, {
    borderRadius: window.getComputedStyle(surface).borderRadius,
    height: `${surfaceGeometry.height}px`,
    left: `${surfaceGeometry.left}px`,
    top: `${surfaceGeometry.top}px`,
    width: `${surfaceGeometry.width}px`
  });

  if (image) {
    const visual = document.createElement("img");
    const style = window.getComputedStyle(image);
    visual.src = image.currentSrc || image.src;
    visual.alt = "";
    visual.setAttribute("aria-hidden", "true");
    Object.assign(visual.style, {
      filter: style.filter,
      height: `${imageGeometry.height}px`,
      left: `${imageGeometry.left - surfaceGeometry.left}px`,
      objectFit: style.objectFit,
      objectPosition: style.objectPosition,
      position: "absolute",
      top: `${imageGeometry.top - surfaceGeometry.top}px`,
      transformOrigin: style.transformOrigin,
      width: `${imageGeometry.width}px`
    });
    snapshot.append(visual);
  } else {
    snapshot.classList.add("cinematic-route-snapshot--geometry");
  }

  document.body.append(snapshot);
  return snapshot;
}

function install(root) {
  const sources = sourceMap(root);
  if (!validInitialContract(root, sources)) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let timer = null;
  let activeSnapshot = null;

  const clearSnapshot = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    activeSnapshot?.remove();
    activeSnapshot = null;
    root.removeAttribute("data-cinematic-route-active");
  };
  const lifecycle = createCinematicRouteLifecycle({
    cleanup: clearSnapshot,
    navigate: (href) => window.location.assign(href)
  });
  let activeToken = null;

  const complete = (token, reason) => {
    if (!token || activeToken !== token) return false;
    activeToken = null;
    return lifecycle.finish(token, reason);
  };

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("a[data-cinematic-route]") : null;
    if (event.defaultPrevented || !target || !root.contains(target) || reducedMotion.matches) return;
    const source = anchorContract(target, sources);
    const href = source && qualifyCinematicRoute({
      optedIn: true,
      href: target.href,
      currentURL: window.location.href,
      defaultPrevented: event.defaultPrevented,
      origin: window.location.origin,
      target: target.getAttribute("target"),
      download: target.hasAttribute("download"),
      button: event.button,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey
    });
    if (!href) return;

    const token = lifecycle.begin(href);
    activeToken = token;
    const snapshot = createSnapshot(source, target);
    if (!snapshot) {
      activeToken = null;
      lifecycle.cancel(token, "snapshot-unavailable");
      return;
    }
    event.preventDefault();
    activeSnapshot = snapshot;
    root.dataset.cinematicRouteActive = "true";
    const end = (reason) => complete(token, reason);
    snapshot.addEventListener("animationend", () => end("animationend"), { once: true });
    snapshot.addEventListener("animationcancel", () => {
      if (document.visibilityState === "hidden") {
        if (activeToken === token) activeToken = null;
        lifecycle.cancel(token, "animationcancel-unload");
        return;
      }
      end("animationcancel");
    }, { once: true });
    timer = window.setTimeout(() => end("timeout"), boundedDelay);
  });

  reducedMotion.addEventListener("change", (event) => {
    if (event.matches) complete(activeToken, "reduced-motion");
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) complete(activeToken, "visibility");
  });
  window.addEventListener("pagehide", () => {
    if (!activeToken) return;
    const token = activeToken;
    activeToken = null;
    lifecycle.cancel(token, "pagehide");
  }, { once: false });
}

if (typeof document !== "undefined") {
  const root = exactlyOne(document, "[data-cinematic-route-root]");
  if (root) install(root);
}
