// Registers the precaching service worker. Production builds only: in dev the
// worker would serve stale bundles.
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const url = `${import.meta.env.BASE_URL}sw.js`;
  navigator.serviceWorker.register(url, { scope: import.meta.env.BASE_URL }).catch((err) => {
    console.error('service worker registration failed', err);
  });
}
