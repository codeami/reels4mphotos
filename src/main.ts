import { registerServiceWorker } from './pwa';

// Placeholder shell. The UI workstream replaces this render with the real app.
function mount(root: HTMLElement): void {
  const h1 = document.createElement('h1');
  h1.textContent = 'Reels4mPhotos';
  const p = document.createElement('p');
  p.textContent = 'Photos in, reel out. Everything stays on your device.';
  root.replaceChildren(h1, p);
}

const root = document.getElementById('app');
if (!root) throw new Error('#app mount point missing from index.html');
mount(root);
registerServiceWorker();
