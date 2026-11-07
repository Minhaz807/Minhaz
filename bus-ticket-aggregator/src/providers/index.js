import bdtickets from './bdtickets.js';
import shohoz from './shohoz.js';
import { demoProvider } from './demo.js';

const REAL = [bdtickets, shohoz];

/** Providers in display order. DEMO_MODE=1 swaps in sample data for all of them. */
export function loadProviders(env = process.env) {
  const disabled = new Set((env.DISABLED_PROVIDERS || '').split(',').map((s) => s.trim()).filter(Boolean));
  const active = REAL.filter((p) => !disabled.has(p.key));
  return env.DEMO_MODE === '1' ? active.map(demoProvider) : active;
}
