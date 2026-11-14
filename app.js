import {
  clamp,
  scrollProgress,
  activePanel,
  scrollForPanel,
  scrollMetrics,
} from "./scroll-model.mjs";

const root = document.documentElement;
const app = document.querySelector("#app");
const stage = document.querySelector("#journey");
const track = document.querySelector("#track");
const viewport = document.querySelector("#viewport");
const panels = [...document.querySelectorAll(".panel")];
const navLinks = [...document.querySelectorAll(".screen-nav [data-goto]")];
const previous = document.querySelector("#previous");
const next = document.querySelector("#next");
const viewToggle = document.querySelector("#view-toggle");
const number = document.querySelector("#current-number");
const label = document.querySelector("#current-label");
const progressBar = document.querySelector("#journey-progress");
const announcement = document.querySelector("#screen-announcement");
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const loader = document.querySelector("#loader");
let index = 0;
let metrics = scrollMetrics(innerWidth, innerHeight, panels.length);
let stageTop = 0;
let frame = 0;
let listPreference = null;
let isHorizontal = false;
let previousWidth = innerWidth;
let previousHeight = innerHeight;
let announceTimer = 0;
let loaderFinished = false;
let snapTimer = 0;
let settledTop = 0;
let settledIndex = 0;
let pendingTarget = null;

const interactive = (element) =>
  element instanceof Element &&
  !!element.closest('input,textarea,select,[contenteditable="true"]');
const heading = (panel) => panel.querySelector("h1,h2");
const measuredHeight = () =>
  window.visualViewport
    ? Math.round(window.visualViewport.height)
    : innerHeight;

function setPanel(nextIndex, announce = false) {
  if (nextIndex === index && panels[index].classList.contains("is-active"))
    return;
  const old = panels[index];
  const focusInsideOld = old?.contains(document.activeElement);
  index = nextIndex;
  panels.forEach((panel, i) => {
    const active = i === index;
    panel.classList.toggle("is-active", active);
    panel.inert = isHorizontal && !active;
    if (isHorizontal && !active) panel.setAttribute("aria-hidden", "true");
    else panel.removeAttribute("aria-hidden");
  });
  navLinks.forEach((link, i) => {
    if (i === index) link.setAttribute("aria-current", "step");
    else link.removeAttribute("aria-current");
  });
  number.textContent = String(index + 1).padStart(2, "0");
  label.textContent = panels[index].dataset.label;
  previous.disabled = index === 0;
  next.disabled = index === panels.length - 1;
  if (focusInsideOld && old !== panels[index] && isHorizontal) {
    (navLinks[index].offsetParent
      ? navLinks[index]
      : next.disabled
        ? previous
        : next
    ).focus({ preventScroll: true });
  }
  clearTimeout(announceTimer);
  if (announce)
    announceTimer = setTimeout(() => {
      announcement.textContent = `${index + 1} из ${panels.length}: ${panels[index].dataset.label}`;
    }, 180);
}

function render() {
  frame = 0;
  if (viewport.scrollLeft) viewport.scrollLeft = 0;
  if (isHorizontal) {
    const progress = scrollProgress(scrollY, stageTop, metrics.scrollDistance);
    track.style.transform = `translate3d(${-progress * metrics.travel}px,0,0)`;
    progressBar.style.transform = `scaleX(${progress})`;
    setPanel(activePanel(progress, panels.length), true);
    if (
      pendingTarget !== null &&
      Math.abs(progress * (panels.length - 1) - pendingTarget) < 0.002
    )
      pendingTarget = null;
  } else {
    const middle = scrollY + innerHeight * 0.42;
    let current = 0;
    panels.forEach((panel, i) => {
      if (panel.offsetTop <= middle) current = i;
    });
    setPanel(current, false);
    if (
      pendingTarget !== null &&
      Math.abs(scrollY - panels[pendingTarget].offsetTop) < 2
    )
      pendingTarget = null;
    progressBar.style.transform = `scaleX(${current / (panels.length - 1)})`;
  }
}
function schedule() {
  if (!frame) frame = requestAnimationFrame(render);
  clearTimeout(snapTimer);
  if (isHorizontal && loaderFinished)
    snapTimer = setTimeout(() => {
      const progress = scrollProgress(
        scrollY,
        stageTop,
        metrics.scrollDistance,
      );
      let target = activePanel(progress, panels.length);
      const delta = scrollY - settledTop;
      const step = metrics.scrollDistance / (panels.length - 1);
      if (Math.abs(delta) > 40 && Math.abs(delta) < step * 0.45) {
        target = Math.round(
          clamp(settledIndex + Math.sign(delta), 0, panels.length - 1),
        );
      }
      const top = scrollForPanel(
        target,
        panels.length,
        stageTop,
        metrics.scrollDistance,
      );
      settledTop = top;
      settledIndex = target;
      if (Math.abs(scrollY - top) > 1)
        window.scrollTo({
          top,
          behavior: reduced.matches ? "instant" : "smooth",
        });
    }, 240);
}

function setup({ preserve = true, keepProgress = false } = {}) {
  clearTimeout(snapTimer);
  const active = pendingTarget ?? index;
  const oldProgress = isHorizontal
    ? scrollProgress(scrollY, stageTop, metrics.scrollDistance)
    : active / (panels.length - 1);
  const height = measuredHeight();
  const minimumHeight = innerWidth <= 600 ? 640 : innerWidth <= 900 ? 760 : 560;
  isHorizontal =
    (listPreference ?? !reduced.matches) && height >= minimumHeight;
  root.classList.toggle("is-horizontal", isHorizontal);
  root.classList.toggle("is-list", !isHorizontal);
  root.style.setProperty("--vh", `${height}px`);
  metrics = scrollMetrics(innerWidth, height, panels.length);
  root.style.setProperty("--stage-height", `${metrics.stageHeight}px`);
  stageTop = stage.getBoundingClientRect().top + scrollY;
  viewToggle.hidden = height < minimumHeight;
  viewToggle.textContent = isHorizontal ? "Списком" : "Галереей";
  viewToggle.setAttribute("aria-pressed", String(!isHorizontal));
  viewToggle.setAttribute(
    "aria-label",
    isHorizontal
      ? "Переключить на просмотр списком"
      : "Переключить на горизонтальную галерею",
  );
  panels.forEach((panel, i) => {
    panel.inert = isHorizontal && i !== active;
    if (isHorizontal && i !== active) panel.setAttribute("aria-hidden", "true");
    else panel.removeAttribute("aria-hidden");
  });
  if (!isHorizontal) track.style.transform = "none";
  if (preserve) {
    if (isHorizontal)
      window.scrollTo({
        top:
          keepProgress && pendingTarget === null
            ? stageTop + oldProgress * metrics.scrollDistance
            : scrollForPanel(
                active,
                panels.length,
                stageTop,
                metrics.scrollDistance,
              ),
        behavior: "instant",
      });
    else
      window.scrollTo({ top: panels[active].offsetTop, behavior: "instant" });
  }
  previousWidth = innerWidth;
  previousHeight = height;
  settledTop = scrollY;
  settledIndex = active;
  render();
}

function goTo(target, { focus = false, updateHash = true } = {}) {
  const to = Math.round(clamp(target, 0, panels.length - 1));
  pendingTarget = to;
  const top = isHorizontal
    ? scrollForPanel(to, panels.length, stageTop, metrics.scrollDistance)
    : panels[to].offsetTop;
  clearTimeout(snapTimer);
  window.scrollTo({
    top,
    behavior: focus || reduced.matches ? "instant" : "smooth",
  });
  if (updateHash) history.replaceState(null, "", `#${panels[to].id}`);
  if (focus) {
    if (isHorizontal) setPanel(to, false);
    const targetHeading = heading(panels[to]);
    targetHeading.tabIndex = -1;
    targetHeading.focus({ preventScroll: true });
  }
}

document.addEventListener("click", (event) => {
  const anchor = event.target.closest("[data-goto]");
  if (!anchor) return;
  event.preventDefault();
  goTo(Number(anchor.dataset.goto), {
    focus: anchor.classList.contains("skip-link"),
  });
});
previous.addEventListener("click", () => goTo(index - 1));
next.addEventListener("click", () => goTo(index + 1));
viewToggle.addEventListener("click", () => {
  listPreference = isHorizontal ? false : true;
  setup();
});
document.querySelector(".skip-link").addEventListener("click", (event) => {
  event.preventDefault();
  goTo(0, { focus: true });
});

window.addEventListener("keydown", (event) => {
  if (
    interactive(event.target) ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    !loaderFinished
  )
    return;
  if (
    !isHorizontal ||
    !["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)
  )
    return;
  event.preventDefault();
  const target =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? panels.length - 1
        : index + (event.key === "ArrowRight" ? 1 : -1);
  goTo(target);
});
window.addEventListener("scroll", schedule, { passive: true });
window.addEventListener(
  "wheel",
  () => {
    pendingTarget = null;
  },
  { passive: true },
);
window.addEventListener(
  "pointerdown",
  () => {
    pendingTarget = null;
  },
  { passive: true },
);
let resizeTimer;
function resize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const h = measuredHeight();
    if (
      Math.abs(innerWidth - previousWidth) < 2 &&
      Math.abs(h - previousHeight) < 2
    )
      return;
    setup({ keepProgress: true });
  }, 100);
}
window.addEventListener("resize", resize, { passive: true });
window.visualViewport?.addEventListener("resize", resize, { passive: true });
reduced.addEventListener("change", () => {
  listPreference = null;
  setup();
});
window.addEventListener("hashchange", () => {
  const target = panels.findIndex((panel) => `#${panel.id}` === location.hash);
  if (target >= 0) goTo(target, { updateHash: false });
});

let gesture = null;
document.querySelector("#viewport").addEventListener(
  "pointerdown",
  (event) => {
    if (event.pointerType !== "touch" || event.target.closest("a,button"))
      return;
    gesture = { x: event.clientX, y: event.clientY };
  },
  { passive: true },
);
window.addEventListener(
  "pointerup",
  (event) => {
    if (!gesture) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    gesture = null;
    if (isHorizontal && Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5)
      goTo(index + (dx < 0 ? 1 : -1));
  },
  { passive: true },
);
window.addEventListener(
  "pointercancel",
  () => {
    gesture = null;
  },
  { passive: true },
);

function meter(value) {
  const progress = clamp(value);
  root.style.setProperty("--load-progress", progress);
  document.querySelector("#load-number").textContent = String(
    Math.round(progress * 100),
  ).padStart(2, "0");
  document
    .querySelector(".loader-progress")
    .setAttribute("aria-valuenow", String(Math.round(progress * 100)));
}
function finishLoader() {
  if (loaderFinished) return;
  loaderFinished = true;
  const restoreFocus = loader.contains(document.activeElement);
  root.classList.remove("is-loading");
  root.classList.add("loader-done");
  app.inert = false;
  if (isHorizontal) {
    const target = startPanel >= 0 ? startPanel : index;
    viewport.scrollLeft = 0;
    window.scrollTo({
      top: scrollForPanel(
        target,
        panels.length,
        stageTop,
        metrics.scrollDistance,
      ),
      behavior: "instant",
    });
    render();
    settledTop = scrollY;
    settledIndex = target;
  }
  loader.inert = true;
  loader.setAttribute("aria-hidden", "true");
  if (restoreFocus) {
    const target = heading(panels[index]);
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
  }
  setTimeout(
    () => {
      loader.hidden = true;
    },
    reduced.matches ? 0 : 500,
  );
}

setup({ preserve: false });
const startPanel = panels.findIndex(
  (panel) => `#${panel.id}` === location.hash,
);
if (startPanel >= 0) {
  window.scrollTo({
    top: isHorizontal
      ? scrollForPanel(
          startPanel,
          panels.length,
          stageTop,
          metrics.scrollDistance,
        )
      : panels[startPanel].offsetTop,
    behavior: "instant",
  });
  render();
}
app.inert = true;
document.querySelector("#skip-loader").addEventListener("click", finishLoader);
const previews = [...document.querySelectorAll("img[data-preload]")];
let loaded = 1;
const total = previews.length + 1;
meter(loaded / total);
const readiness = Promise.allSettled(
  previews.map(async (image) => {
    try {
      if (image.decode) await image.decode();
      else if (!image.complete)
        await new Promise((resolve) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        });
    } finally {
      meter(++loaded / total);
    }
  }),
);
const minimum = new Promise((resolve) =>
  setTimeout(resolve, reduced.matches ? 0 : 1150),
);
Promise.race([
  Promise.all([readiness, minimum]),
  new Promise((resolve) => setTimeout(resolve, 3000)),
]).then(finishLoader);
window.addEventListener("pageshow", schedule);
