function pointAt(bounds, bias) {
  return {
    x: bounds.left + bounds.width * bias.x,
    y: bounds.top + bounds.height * bias.y
  };
}

function rounded(value) {
  return Math.round(value * 10) / 10;
}

/** Positions an inert SVG path between the selected control and the active
 * visual/panel. The geometry is intentionally derived from rendered boxes so
 * a connector follows the responsive composition instead of a fixed rail. */
export function positionCinematicRelationshipConnector({
  connector,
  container,
  source,
  target,
  state,
  edgeRoute = false,
  sourceBias = { x: 0.5, y: 0.5 },
  targetBias = { x: 0.5, y: 0.5 }
}) {
  const path = connector?.querySelector("path[pathLength='1']");
  const start = connector?.querySelector("[data-cinematic-relationship-connector-source]");
  const end = connector?.querySelector("[data-cinematic-relationship-connector-target]");
  if (!(connector instanceof SVGElement) || !path || !start || !end || !container || !source || !target || !state) {
    connector?.setAttribute("hidden", "");
    return false;
  }

  const frame = container.getBoundingClientRect();
  const sourcePoint = pointAt(source.getBoundingClientRect(), sourceBias);
  const targetPoint = pointAt(target.getBoundingClientRect(), targetBias);
  if (!(frame.width > 0 && frame.height > 0 && sourcePoint.x && sourcePoint.y && targetPoint.x && targetPoint.y)) {
    connector.setAttribute("hidden", "");
    return false;
  }

  const from = { x: rounded(sourcePoint.x - frame.left), y: rounded(sourcePoint.y - frame.top) };
  const to = { x: rounded(targetPoint.x - frame.left), y: rounded(targetPoint.y - frame.top) };
  const controlX = edgeRoute
    ? rounded(frame.width - 2)
    : rounded(from.x + (to.x - from.x) * 0.42);
  const controlY = edgeRoute
    ? to.y
    : rounded(to.y - Math.max(16, Math.abs(to.y - from.y) * 0.18));
  connector.setAttribute("viewBox", `0 0 ${rounded(frame.width)} ${rounded(frame.height)}`);
  const pathData = edgeRoute === "perimeter"
    ? `M ${from.x} ${from.y} L ${from.x} ${rounded(frame.height - 2)} L ${controlX} ${rounded(frame.height - 2)} L ${controlX} ${to.y} L ${to.x} ${to.y}`
    : edgeRoute === "top-right-perimeter"
      ? `M ${from.x} ${from.y} L ${controlX} ${from.y} L ${controlX} ${rounded(frame.height - 2)} L ${to.x} ${rounded(frame.height - 2)} L ${to.x} ${to.y}`
    : edgeRoute
      ? `M ${from.x} ${from.y} L ${controlX} ${from.y} L ${controlX} ${to.y} L ${to.x} ${to.y}`
      : `M ${from.x} ${from.y} C ${controlX} ${from.y}, ${controlX} ${controlY}, ${to.x} ${to.y}`;
  path.setAttribute("d", pathData);
  start.setAttribute("cx", String(from.x));
  start.setAttribute("cy", String(from.y));
  end.setAttribute("cx", String(to.x));
  end.setAttribute("cy", String(to.y));
  connector.dataset.cinematicRelationshipConnectorState = state;
  connector.removeAttribute("hidden");
  return true;
}
