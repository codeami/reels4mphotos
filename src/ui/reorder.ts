/**
 * Pointer-events drag reorder, built touch-first. The drag starts only from a
 * dedicated handle, which carries `touch-action: none`, so the rest of the
 * tile still scrolls the page. Pointer capture keeps the gesture alive even
 * when the finger leaves the handle. Buttons elsewhere provide the same
 * reorder without dragging; this is an enhancement, not the only path.
 */
export interface ReorderOptions {
  list: HTMLElement;
  itemSelector: string; // tiles inside `list`
  handleSelector: string; // grip inside a tile
  onMove: (from: number, to: number) => void;
}

const EDGE = 70;
const SCROLL_STEP = 14;

export function enableDragReorder(opts: ReorderOptions): void {
  const { list, itemSelector, handleSelector, onMove } = opts;

  list.addEventListener('pointerdown', (down) => {
    const handle = (down.target as Element).closest<HTMLElement>(handleSelector);
    if (!handle || (down.pointerType === 'mouse' && down.button !== 0)) return;
    const tiles = [...list.querySelectorAll<HTMLElement>(itemSelector)];
    const dragged = handle.closest<HTMLElement>(itemSelector);
    if (!dragged) return;
    const from = tiles.indexOf(dragged);
    const rects = tiles.map((t) => t.getBoundingClientRect());
    const scrollAtStart = window.scrollY;
    let to = from;
    let lastY = down.clientY;
    let raf = 0;

    down.preventDefault();
    handle.setPointerCapture(down.pointerId);
    dragged.classList.add('is-dragging');
    list.classList.add('is-reordering');

    const findSlot = (x: number, y: number): number => {
      const scrolled = window.scrollY - scrollAtStart;
      const hit = rects.findIndex(
        (r) => x >= r.left && x <= r.right && y + scrolled >= r.top && y + scrolled <= r.bottom,
      );
      return hit === -1 ? to : hit;
    };
    const paint = (x: number, y: number) => {
      const scrolled = window.scrollY - scrollAtStart;
      dragged.style.transform = `translate(${x - down.clientX}px, ${y - down.clientY + scrolled}px) scale(1.04)`;
      to = findSlot(x, y);
      tiles.forEach((t, i) => t.classList.toggle('is-target', i === to && i !== from));
    };
    let lastX = down.clientX;
    const autoScroll = () => {
      if (lastY < EDGE) window.scrollBy(0, -SCROLL_STEP);
      else if (lastY > window.innerHeight - EDGE) window.scrollBy(0, SCROLL_STEP);
      else {
        raf = requestAnimationFrame(autoScroll);
        return;
      }
      paint(lastX, lastY);
      raf = requestAnimationFrame(autoScroll);
    };
    raf = requestAnimationFrame(autoScroll);

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== down.pointerId) return;
      lastX = e.clientX;
      lastY = e.clientY;
      paint(lastX, lastY);
    };
    const finish = (e: PointerEvent, commit: boolean) => {
      if (e.pointerId !== down.pointerId) return;
      cancelAnimationFrame(raf);
      handle.removeEventListener('pointermove', onPointerMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onCancel);
      dragged.classList.remove('is-dragging');
      list.classList.remove('is-reordering');
      dragged.style.transform = '';
      tiles.forEach((t) => t.classList.remove('is-target'));
      if (commit && to !== from) onMove(from, to);
    };
    const onUp = (e: PointerEvent) => finish(e, true);
    const onCancel = (e: PointerEvent) => finish(e, false);
    handle.addEventListener('pointermove', onPointerMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onCancel);
  });
}
