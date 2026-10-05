// Shared state between the terminal's `sdr` command and the background waterfall.
// The terminal can set the speed before the waterfall has even started, so the
// value lives here rather than in either component.

export const SPEED_MIN = 0.5;
export const SPEED_MAX = 4;
const SPEED_KEY = 'riwaj.me:sdr_speed';

export type OnAir = { label: string; lo: number; hi: number } | { label: string; lo: null; hi: null };

let speed = 1;
try {
  const saved = Number(localStorage.getItem(SPEED_KEY));
  if (saved >= SPEED_MIN && saved <= SPEED_MAX) speed = saved;
} catch {}

const listeners = new Set<(s: number) => void>();

export const sdr = {
  onAir: [] as OnAir[],
  home: null as number | null,
  rbwHz: 0,
  getSpeed: () => speed,
  setSpeed(s: number) {
    speed = s;
    try {
      localStorage.setItem(SPEED_KEY, String(s));
    } catch {}
    listeners.forEach((l) => l(s));
  },
  subscribe(l: (s: number) => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
};

// The band we pretend to be looking at: 14.000-14.350 MHz, the 20 m ham band.
export const BAND_LO_MHZ = 14.0;
export const BAND_SPAN_HZ = 350_000;
export const mhz = (frac: number) => (BAND_LO_MHZ + (frac * BAND_SPAN_HZ) / 1e6).toFixed(3);
