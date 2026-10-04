import { h } from './dom';
import { intake } from './intake';
import { checkCount, MIN_PHOTOS, move, toggle } from './logic';
import { enableDragReorder } from './reorder';
import { addScreen, skippedChips } from './screens/add';
import { customizeBlock } from './screens/customize';
import { exportScreen } from './screens/export';
import { pickScreen } from './screens/pick';
import { previewScreen, type PreviewHandle } from './screens/preview';
import { stopSample, trackScreen } from './screens/track';
import type { Engines } from './seams/types';
import { createStore, stageOf, STEPS, type Photo, type State } from './store';

const TITLES: Record<(typeof STEPS)[number], string> = {
  add: 'Add',
  preview: 'Watch',
  export: 'Export',
};
const TARGET_COUNT = 10;
const BITMAP_WIDTH = 1080;

export function createApp(root: HTMLElement, engines: Engines) {
  const store = createStore();
  let preview: PreviewHandle | null = null;
  let previewFor: unknown = null;
  let bitmaps = new Map<string, ImageBitmap>();
  let pendingFocus: string | null = null;

  // Background only: a failure is not the user's problem, the export path copes on its own.
  // `data-warm` marks the moment load-time requests are over, for the zero-request E2E.
  void (engines.warmUp?.() ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => root.setAttribute('data-warm', 'done'));

  const say = (announce: string) => store.set({ announce });

  function closePreview() {
    preview?.destroy();
    preview = null;
    previewFor = null;
    bitmaps.forEach((b) => b.close());
    bitmaps = new Map();
  }

  function revokePhotoUrls(s: State) {
    s.photos.forEach((p) => URL.revokeObjectURL(p.url));
    if (s.exp.kind === 'done') URL.revokeObjectURL(s.exp.url);
  }

  async function handleFiles(picked: File[]) {
    if (picked.length === 0) return;
    const count = checkCount(picked.length);
    if (!count.ok) {
      store.set({ notice: count.message, skipped: [] });
      return;
    }
    store.set({ busy: 'Checking photos…', notice: null, skipped: [] });
    const { files, skipped } = await intake(picked);
    const after = checkCount(files.length);
    if (!after.ok) {
      store.set({
        busy: null,
        skipped,
        notice: `${after.message} ${skipped.length} could not be used.`,
      });
      return;
    }
    store.set({ busy: 'Choosing your best shots…', skipped });
    try {
      const result = await engines.select(files, { targetCount: TARGET_COUNT });
      revokePhotoUrls(store.get());
      const photos: Photo[] = result.scores
        .flatMap((score) => {
          const file = files[score.index];
          return file ? [{ id: score.photoId, file, url: URL.createObjectURL(file), score }] : [];
        })
        .sort((x, y) => x.score.index - y.score.index);
      const order = result.chosen.map((x) => x.photoId);
      store.set({
        busy: 'Cutting your reel…',
        files,
        photos,
        order,
        plan: null,
        trackId: null,
        track: null,
        notice: null,
        exp: { kind: 'idle' },
        announce: `${order.length} of ${photos.length} photos chosen.`,
      });
      await openWithDefaultTrack();
    } catch (err) {
      store.set({
        busy: null,
        notice: `Could not choose photos: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  function setOrder(order: string[], message: string) {
    store.set({ order, plan: null, announce: message });
  }

  function onMove(from: number, to: number) {
    const s = store.get();
    const id = s.order[from];
    if (to < 0 || to >= s.order.length) return;
    pendingFocus = `[data-handle][data-for="${id}"]`;
    setOrder(move(s.order, from, to), `Photo moved to position ${to + 1} of ${s.order.length}.`);
  }

  function onToggle(id: string) {
    const s = store.get();
    const all = s.photos.map((p) => p.id);
    const next = toggle(s.order, all, id);
    setOrder(
      next,
      next.includes(id)
        ? `Added back. ${next.length} in your reel.`
        : `Removed. ${next.length} in your reel.`,
    );
  }

  async function chooseTrack(id: string) {
    store.set({ trackId: id, track: null, plan: null });
    try {
      const track = await engines.loadTrack(id);
      if (store.get().trackId === id) store.set({ track });
    } catch (err) {
      store.set({
        trackId: null,
        notice: `Could not load that track: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  /**
   * Zero decisions: the first shipped track is the default, so a reel is ready the moment photos are
   * chosen. Every shipped track is fetched at mount (see warmUp), so this makes no new request.
   * If it cannot load, the Music screen opens so the user can pick another.
   */
  async function openWithDefaultTrack() {
    const first = engines.tracks[0];
    try {
      if (!first) throw new Error('No music is available.');
      const track = await engines.loadTrack(first.id);
      store.set({ trackId: first.id, track });
    } catch (err) {
      store.set({
        busy: null,
        step: 'track',
        notice: `Could not load the music: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }
    await goPreview();
  }

  function setLength(lengthMs: number) {
    store.set({ lengthMs });
    void goPreview();
  }

  async function goPreview() {
    const s = store.get();
    if (!s.track) return;
    store.set({ busy: 'Building preview…', notice: null });
    try {
      const chosen = s.order.flatMap((id) => {
        const photo = s.photos.find((p) => p.id === id);
        return photo ? [{ photoId: id, width: photo.score.width, height: photo.score.height }] : [];
      });
      const plan = engines.plan(chosen, s.track.beatmap, s.lengthMs);
      const next = new Map<string, ImageBitmap>();
      for (const shot of plan.shots) {
        const file = s.photos.find((p) => p.id === shot.photoId)?.file;
        if (file && !next.has(shot.photoId))
          next.set(shot.photoId, await createImageBitmap(file, { resizeWidth: BITMAP_WIDTH }));
      }
      closePreview();
      bitmaps = next;
      store.set({ busy: null, plan, step: 'preview', exp: { kind: 'idle' } });
    } catch (err) {
      store.set({
        busy: null,
        notice: `Could not build the preview: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  async function startExport() {
    const s = store.get();
    if (!s.plan || !s.track) return;
    store.set({ exp: { kind: 'rendering', progress: 0 } });
    try {
      const photos = new Map<string, Blob>();
      for (const shot of s.plan.shots) {
        const p = s.photos.find((x) => x.id === shot.photoId);
        if (p) photos.set(p.id, p.file);
      }
      const { blob, silent } = await engines.render(s.plan, photos, s.track.beatmap, (progress) => {
        if (store.get().exp.kind === 'rendering')
          store.set({ exp: { kind: 'rendering', progress } });
      });
      const file = new File([blob], 'reel.mp4', { type: 'video/mp4' });
      store.set({
        exp: { kind: 'done', file, silent, url: URL.createObjectURL(file), saved: false },
        announce: silent ? 'Export finished, without sound.' : 'Export finished.',
      });
    } catch (err) {
      store.set({
        exp: {
          kind: 'error',
          message: `Export failed: ${err instanceof Error ? err.message : String(err)}`,
        },
      });
    }
  }

  const canShare = (file: File) =>
    typeof navigator.canShare === 'function' &&
    typeof navigator.share === 'function' &&
    navigator.canShare({ files: [file] });

  function markSaved() {
    const e = store.get().exp;
    if (e.kind === 'done')
      store.set({
        exp: { ...e, saved: true },
        announce: 'Saved. Open Instagram and pick it from your camera roll.',
      });
  }

  async function share() {
    const e = store.get().exp;
    if (e.kind !== 'done') return;
    try {
      await navigator.share({ files: [e.file], title: 'My reel' });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      say('Sharing failed. Use Download instead.');
    }
  }

  function goto(step: State['step']) {
    stopSample();
    if (step !== 'preview') closePreview();
    store.set({ step, notice: null });
    const { trackId, track } = store.get();
    if (step === 'track' && trackId && !track) void chooseTrack(trackId);
  }

  // ---- rendering ----
  const live = h('div', { class: 'visually-hidden', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const banner = h('header', { class: 'top' });
  const main = h('main', { class: 'stage', id: 'stage' });
  const nav = h('nav', { class: 'bar', 'aria-label': 'Step actions' });
  root.append(banner, main, nav, live);
  let lastStep: State['step'] | null = null;

  function stepper(s: State) {
    const stage = stageOf(s.step);
    return h(
      'ol',
      { class: 'steps', 'aria-label': 'Progress' },
      ...STEPS.map((k, i) =>
        h(
          'li',
          {
            class: `step${k === stage ? ' is-now' : ''}${i < STEPS.indexOf(stage) ? ' is-done' : ''}`,
            'aria-current': k === stage ? 'step' : null,
          },
          h('span', { class: 'step-n' }, String(i + 1).padStart(2, '0')),
          h('span', { class: 'step-t' }, TITLES[k]),
        ),
      ),
    );
  }

  function navBar(s: State) {
    const ghost = (label: string, to: State['step']) =>
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => goto(to) }, label);
    const primary = (label: string, onclick: () => void, disabled = false) =>
      h(
        'button',
        { class: 'btn btn-primary', type: 'button', 'data-testid': 'next', disabled, onclick },
        label,
      );
    const busy = s.busy !== null;
    switch (s.step) {
      case 'preview':
        return [ghost('New photos', 'add'), primary('Export', () => goto('export'), busy)];
      case 'pick':
        return [primary('Done', () => void goPreview(), s.order.length < MIN_PHOTOS || busy)];
      case 'track':
        return [primary('Done', () => void goPreview(), !s.track || busy)];
      case 'export':
        return s.exp.kind === 'rendering' ? [] : [ghost('Back', 'preview')];
      default:
        return [];
    }
  }

  function screenFor(s: State): HTMLElement {
    switch (s.step) {
      case 'pick':
        return pickScreen(s, { onToggle, onMove });
      case 'track':
        return trackScreen(s, engines.tracks, {
          onChoose: (id) => void chooseTrack(id),
          loadTrack: engines.loadTrack,
        });
      case 'preview': {
        if (!s.plan || !s.track) return h('section', { class: 'screen' });
        preview = previewScreen(s.plan, bitmaps, s.track.audioUrl, s.track.beatmap, [
          customizeBlock(s, { onCustomize: goto, onLength: setLength }),
          s.skipped.length > 0 && skippedChips(s.skipped),
        ]);
        previewFor = s.plan;
        return preview.el;
      }
      case 'export':
        return exportScreen(s, {
          onStart: () => void startExport(),
          onShare: () => void share(),
          onSaved: markSaved,
          canShare,
          onRestart: () => {
            closePreview();
            revokePhotoUrls(store.get());
            store.reset();
          },
        });
      default:
        return addScreen(s, { onFiles: (f) => void handleFiles(f) });
    }
  }

  function render(s: State) {
    banner.replaceChildren(
      h(
        'div',
        { class: 'brand' },
        h('span', { class: 'brand-mark', 'aria-hidden': 'true' }),
        h('h1', {}, 'Reels4mPhotos'),
        engines.fake &&
          h(
            'span',
            { class: 'demo', title: 'Curation, render or music is a local stand-in' },
            'demo engine',
          ),
      ),
      stepper(s),
    );
    const keepPreview = s.step === 'preview' && preview && previewFor === s.plan;
    if (!keepPreview) {
      const screen = screenFor(s);
      if (s.busy) screen.append(h('p', { class: 'busy', role: 'status' }, s.busy));
      if (s.notice && s.step !== 'add')
        screen.prepend(h('p', { class: 'notice', role: 'alert' }, s.notice));
      main.replaceChildren(screen);
      if (s.step === 'pick') {
        const list = main.querySelector<HTMLElement>('[data-reel-list]');
        if (list)
          enableDragReorder({
            list,
            itemSelector: '[data-tile]',
            handleSelector: '[data-handle]',
            onMove,
          });
      }
    }
    nav.replaceChildren(...navBar(s));
    nav.hidden = nav.childElementCount === 0;
    live.textContent = s.announce;
    if (pendingFocus) {
      main.querySelector<HTMLElement>(pendingFocus)?.focus();
      pendingFocus = null;
    } else if (lastStep !== s.step) {
      main.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
    lastStep = s.step;
  }

  store.subscribe(render);
  render(store.get());
  return { store };
}
