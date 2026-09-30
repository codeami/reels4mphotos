import { registerServiceWorker } from './pwa';
import { mountApp } from './ui';

const root = document.getElementById('app');
if (!root) throw new Error('#app mount point missing from index.html');
void mountApp(root);
registerServiceWorker();
