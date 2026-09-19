import './styles.css';
import { fallbackPlan } from './fallback';
import { STAGE_PROGRESS, type Stage } from './scene/timeline';
import type { SceneControls } from './scene/HeroScene';

const viewport = document.querySelector<HTMLElement>('#scene-viewport')!;
const hero = document.querySelector<HTMLElement>('.hero')!;
const story = document.querySelector<HTMLElement>('#hero-story')!;
const visual = document.querySelector<HTMLElement>('.hero-visual')!;
const fallback = document.querySelector<HTMLElement>('#fallback')!;
const loading = document.querySelector<HTMLElement>('#loading')!;
const hint = document.querySelector<HTMLElement>('#scroll-hint')!;
const stageButtons = [...document.querySelectorAll<HTMLButtonElement>('button[data-stage]')];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const descriptions = ['See the whole picture.', 'Find the feeling of every room.', 'Give your vision a foundation.'];
let controls: SceneControls | undefined;
let currentStage: Stage = 0;
let failed = false;
let frame = 0;
let scrollStart = 0;
let scrollDistance = 1;
let disposed = false;

fallback.innerHTML = fallbackPlan;
document.querySelector('#year')!.textContent = String(new Date().getFullYear());

function updateStage(stage: Stage) {
  currentStage = stage;
  stageButtons.forEach((button, index) => button.setAttribute('aria-pressed', String(index === stage)));
  document.querySelector('#stage-description')!.textContent = descriptions[stage];
  viewport.dataset.stage = String(stage);
}

function updateScroll() {
  frame = 0;
  if (failed || reducedMotion.matches) return;
  const progress = Math.min(1, Math.max(0, (window.scrollY - scrollStart) / scrollDistance));
  controls?.setProgress(progress);
}

function scheduleScroll() {
  if (!frame) frame = requestAnimationFrame(updateScroll);
}

function measure() {
  // On short/mobile screens the heading scrolls away before the scene pins.
  // No wheel/touch interception: the browser owns scrolling in both directions.
  const compact = matchMedia('(max-width: 760px)').matches;
  const visualTop = visual.getBoundingClientRect().top - hero.getBoundingClientRect().top;
  const top = compact
    ? Math.min(0, Math.max(24, (innerHeight - visual.offsetHeight) / 2) - visualTop)
    : Math.min(0, innerHeight - hero.offsetHeight - 24);
  hero.style.setProperty('--hero-sticky-top', `${top}px`);
  story.style.setProperty('--hero-height', `${hero.offsetHeight}px`);
  scrollStart = story.getBoundingClientRect().top + window.scrollY - top;
  scrollDistance = Math.max(1, story.offsetHeight - hero.offsetHeight);
  scheduleScroll();
}

function select(stage: Stage) {
  if (failed) return;
  if (reducedMotion.matches) {
    updateStage(stage);
    controls?.select(stage);
    visual.scrollIntoView({ behavior: 'instant', block: 'center' });
  } else {
    measure();
    window.scrollTo({ top: scrollStart + STAGE_PROGRESS[stage] * scrollDistance, behavior: 'smooth' });
  }
}

const listenerController = new AbortController();
const { signal } = listenerController;
stageButtons.forEach(button => button.addEventListener('click', () => select(Number(button.dataset.stage) as Stage), { signal }));
document.querySelectorAll<HTMLAnchorElement>('[data-view]').forEach(link => link.addEventListener('click', event => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (failed) {
    visual.scrollIntoView({ behavior: 'instant', block: 'center' });
    return;
  }
  history.replaceState(null, '', '#demo');
  select(Number(link.dataset.view) as Stage);
}, { signal }));
document.querySelector('.scroll-link')!.addEventListener('click', event => {
  if (reducedMotion.matches || failed) return;
  event.preventDefault();
  select(1);
}, { signal });
window.addEventListener('scroll', scheduleScroll, { passive: true, signal });
window.addEventListener('resize', measure, { passive: true, signal });
window.addEventListener('pageshow', measure, { signal });
reducedMotion.addEventListener('change', event => {
  controls?.setReducedMotion(event.matches);
  updateHint();
  measure();
}, { signal });
function updateHint() {
  hint.firstChild!.textContent = reducedMotion.matches ? 'Choose a view ' : 'Scroll to explore ';
}
function failure() {
  failed = true;
  document.documentElement.classList.add('has-static-demo');
  viewport.classList.remove('is-ready');
  loading.hidden = true;
  hint.hidden = true;
  stageButtons.forEach(button => {
    button.disabled = true;
    button.setAttribute('aria-pressed', String(button.dataset.stage === '2'));
  });
  document.querySelector('#stage-description')!.textContent = 'Your home, in plan.';
  viewport.setAttribute('aria-label', 'Static architectural floor plan of the demonstration home, with a kitchen, living room, bedroom and bathroom. Interactive 3D is unavailable in this browser.');
}
updateStage(0);
updateHint();
const layoutObserver = new ResizeObserver(measure);
layoutObserver.observe(hero);
layoutObserver.observe(story);
measure();

// Keep content and a static preview independent of the heavy renderer.
const loadObserver = new IntersectionObserver(async entries => {
  if (!entries.some(entry => entry.isIntersecting)) return;
  loadObserver.disconnect();
  try {
    await document.fonts.ready;
    const { mountHeroScene } = await import('./scene/HeroScene');
    if (disposed) return;
    controls = mountHeroScene(viewport, { reduced: reducedMotion.matches, onStage: updateStage, onFailure: failure });
    if (reducedMotion.matches) controls.select(currentStage);
    measure();
    loading.hidden = true;
  } catch (error) {
    console.warn('Mopple: showing the static floor plan.', error);
    failure();
  }
}, { rootMargin: '200px' });
loadObserver.observe(viewport);

function dispose() {
  disposed = true;
  cancelAnimationFrame(frame);
  controls?.dispose();
  loadObserver.disconnect();
  layoutObserver.disconnect();
  listenerController.abort();
}
window.addEventListener('pagehide', event => { if (!event.persisted) dispose(); }, { signal });
if (import.meta.hot) import.meta.hot.dispose(dispose);
