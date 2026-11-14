/** Pure geometry shared by scrolling, keyboard navigation and the progress rail. */

const finite = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const panelCount = (value) => Math.max(1, Math.floor(finite(value, 1)));
const nonNegative = (value) => Math.max(0, finite(value));

/** NaN resolves to the lower bound; reversed or non-finite bounds are safe. */
export function clamp(value, min = 0, max = 1) {
  const a = finite(min, 0);
  const b = finite(max, 1);
  const lower = Math.min(a, b);
  const upper = Math.max(a, b);
  const number = Number(value);
  return Number.isNaN(number) ? lower : Math.min(upper, Math.max(lower, number));
}

/** Native vertical scroll converted to a bounded journey progress. */
export function scrollProgress(scrollY, start, distance) {
  const origin = finite(start);
  const span = nonNegative(distance);
  if (!span) return 0;
  return clamp((finite(scrollY, origin) - origin) / span);
}

/** Nearest screen, so keyboard focus changes only after crossing its midpoint. */
export function activePanel(progress, count) {
  return Math.round(clamp(progress) * (panelCount(count) - 1));
}

/** Absolute native scroll target for a screen index. */
export function scrollForPanel(index, count, start, distance) {
  const last = panelCount(count) - 1;
  const origin = finite(start);
  if (!last) return origin;
  const screen = Math.round(clamp(finite(index), 0, last));
  return origin + (screen / last) * nonNegative(distance);
}

/** Geometry does not depend on the current panel, so resize preserves progress. */
export function scrollMetrics(width, height, count) {
  const viewportWidth = nonNegative(width);
  const viewportHeight = nonNegative(height);
  const screens = panelCount(count) - 1;
  const travel = screens * viewportWidth;
  const scrollDistance = screens * Math.max(viewportHeight * 0.95, 320);
  return { travel, scrollDistance, stageHeight: viewportHeight + scrollDistance };
}
