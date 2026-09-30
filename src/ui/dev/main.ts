import { mountApp } from '../index';
import { fakeEngines } from '../seams/fakes';

// ?fakes=1 pins the deterministic fake engines (used by the Playwright tests).
const pinFakes = new URLSearchParams(location.search).get('fakes') === '1';
void mountApp(document.getElementById('app')!, pinFakes ? fakeEngines() : undefined);
