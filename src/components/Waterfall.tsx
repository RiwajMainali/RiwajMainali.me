import { useEffect, useRef, useState } from 'react';

// SDR-style waterfall behind the page, styled after a busy HF band. Rendered
// near screen resolution; each frame scrolls the image down one row and paints
// a fresh FFT row on top. Starts after the page is idle so it never competes
// with first paint.

const FPS = 30;
const PX_PER_BIN = 1.25;

// Black -> dark green -> neon -> white-hot.
const LUT = (() => {
  const lut = new Uint8ClampedArray(256 * 3);
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    lut[i * 3] = clamp((t - 0.7) * 3.3) * 230;
    lut[i * 3 + 1] = Math.pow(t, 0.7) * 255;
    lut[i * 3 + 2] = clamp((t - 0.5) * 2) * 150;
  }
  return lut;
})();

const MORSE: Record<string, string> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---',
  K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-',
  U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..', '0': '-----', '1': '.----',
  '2': '..---', '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
};

// Key-down/up per dit unit, with standard letter and word gaps.
function keying(text: string): number[] {
  const units: number[] = [];
  for (const word of text.split(' ')) {
    for (const ch of word) {
      for (const sym of MORSE[ch] ?? '') units.push(...(sym === '.' ? [1] : [1, 1, 1]), 0);
      units.push(0, 0);
    }
    units.push(0, 0, 0, 0);
  }
  return [...units, ...Array<number>(30).fill(0)];
}

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]!;

function makeSource(bins: number) {
  const B = (f: number) => f * bins; // band fraction -> bin
  let t = 0;
  const row = new Float32Array(bins);

  const gauss = (c: number, w: number, a: number) => {
    const lo = Math.max(0, Math.floor(c - w * 3));
    const hi = Math.min(bins - 1, Math.ceil(c + w * 3));
    for (let i = lo; i <= hi; i++) row[i] = row[i]! + a * Math.exp(-(((i - c) / w) ** 2));
  };
  const block = (lo: number, hi: number, a: number, grain: number) => {
    for (let i = Math.max(0, Math.floor(lo)); i <= Math.min(bins - 1, hi); i++) {
      const edge = Math.min(1, (i - lo) / 2, (hi - i) / 2);
      row[i] = row[i]! + edge * a * (1 - grain + Math.random() * grain * 2);
    }
  };
  const fade = (period: number, phase: number) => 0.55 + 0.45 * Math.sin(t / period + phase);

  // CW stations, the first one is ours.
  const calls = ['K5RWJ', 'W1AW', 'JA1XYZ', 'DL2ABC', 'VK3QQ', 'G4FON', '9N1AA'];
  const cw = [
    { f: 0.205, text: 'CQ CQ DE RIWAJ K', unit: 3, a: 0.8 },
    ...Array.from({ length: 5 }, () => ({
      f: rand(0.03, 0.3),
      text: `CQ CQ DE ${pick(calls)} ${pick(calls)} K`,
      unit: Math.floor(rand(2, 5)),
      a: rand(0.3, 0.65),
    })),
  ].map((s) => ({ ...s, keys: keying(s.text), phase: rand(0, 6), off: Math.floor(rand(0, 400)) }));

  // SSB voice: talk spurts made of shifting formants.
  const ssb = Array.from({ length: 4 }, () => ({
    lo: rand(0.33, 0.55),
    width: rand(0.012, 0.02),
    talking: false,
    left: 0,
    syl: 0,
    formants: [0.2, 0.45, 0.7],
    a: rand(0.35, 0.6),
  }));

  // FT8 sub-band: 15 s slots of 8-FSK stations.
  const FT8_LO = 0.6;
  const FT8_HI = 0.68;
  const SLOT = 15 * FPS;
  let ft8: { c: number; a: number; tones: number[] }[] = [];

  // RTTY: two tones 170 Hz apart.
  const rtty = { c: 0.74, shift: 0.006, left: 0, on: false };

  // Wideband OFDM data with TDMA-style bursts.
  const ofdm = { lo: 0.82, hi: 0.9, on: false, left: 0 };

  const birdies = Array.from({ length: 6 }, () => ({ c: rand(0, 1), a: rand(0.08, 0.16) }));
  let hop = { c: 0.5, left: 0 };
  let sweep = -1;
  let floorDrift = 0;

  return function nextRow(): Float32Array {
    t++;
    floorDrift += (Math.random() - 0.5) * 0.02;
    floorDrift *= 0.98;

    // Speckled noise floor (exponential like FFT bin power), with band edges rolled off.
    for (let i = 0; i < bins; i++) {
      const edge = Math.sin((i / bins) * Math.PI);
      row[i] = (0.07 + floorDrift * 0.05 - Math.log(Math.random() + 1e-6) * 0.045) * (0.6 + 0.4 * edge);
    }

    for (const b of birdies) gauss(B(b.c), 0.6, b.a);

    for (const s of cw) {
      if (s.keys[Math.floor((t + s.off) / s.unit) % s.keys.length]) gauss(B(s.f), 0.8, s.a * fade(140, s.phase));
    }

    for (const v of ssb) {
      if (v.left-- <= 0) {
        v.talking = !v.talking;
        v.left = v.talking ? Math.floor(rand(60, 240)) : Math.floor(rand(20, 150));
      }
      if (!v.talking) continue;
      if (v.syl-- <= 0) {
        v.syl = Math.floor(rand(3, 9));
        v.formants = v.formants.map((p) => Math.min(0.9, Math.max(0.08, p + rand(-0.12, 0.12))));
      }
      const loud = v.a * (0.4 + Math.random() * 0.6) * (v.syl > 1 ? 1 : 0.3);
      const lo = B(v.lo);
      const w = B(v.width);
      block(lo, lo + w, loud * 0.25, 0.8);
      for (const p of v.formants) gauss(lo + w * p, w * 0.08, loud * 0.6);
    }

    // FT8: new set of stations each slot, transmitting for ~12.6 s.
    const slotT = t % SLOT;
    if (slotT === 0) {
      ft8 = Array.from({ length: Math.floor(rand(5, 11)) }, () => ({
        c: rand(FT8_LO, FT8_HI - 0.01),
        a: rand(0.3, 0.75),
        tones: Array.from({ length: 79 }, () => Math.floor(Math.random() * 8)),
      }));
    }
    if (slotT > 15 && slotT < 15 + 79 * 5) {
      const sym = Math.floor((slotT - 15) / 5);
      for (const s of ft8) gauss(B(s.c) + s.tones[sym]! * (B(0.0012)), 0.7, s.a);
    }

    // RTTY bursts.
    if (rtty.left-- <= 0) {
      rtty.on = !rtty.on;
      rtty.left = Math.floor(rtty.on ? rand(120, 400) : rand(60, 300));
    }
    if (rtty.on) gauss(B(rtty.c) + (Math.random() < 0.5 ? 0 : B(rtty.shift)), 0.8, 0.6 * fade(90, 1));

    // OFDM: flat-topped grainy block, bursting.
    if (ofdm.left-- <= 0) {
      ofdm.on = !ofdm.on;
      ofdm.left = Math.floor(ofdm.on ? rand(8, 90) : rand(4, 60));
    }
    if (ofdm.on) block(B(ofdm.lo), B(ofdm.hi), 0.16 * fade(60, 2), 0.9);

    // Wideband FM-ish carrier wobbling with audio.
    gauss(B(0.95) + Math.sin(t / 9) * B(0.004) + Math.sin(t / 3.7) * B(0.002), B(0.006), 0.3);

    // Frequency hopper.
    if (hop.left-- <= 0) hop = { c: rand(0.05, 0.95), left: Math.floor(rand(5, 10)) };
    if (t % 500 < 200) gauss(B(hop.c), B(0.003), 0.45);

    // Occasional chirp sweeping the whole band.
    if (sweep < 0 && Math.random() < 0.0015) sweep = 0;
    if (sweep >= 0) {
      gauss(sweep, 1.5, 0.45);
      sweep += bins / 120;
      if (sweep > bins) sweep = -1;
    }

    return row;
  };
}

export default function Waterfall() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let raf = 0;
    let last = 0;

    const start = () => {
      const bins = Math.min(1400, Math.max(320, Math.round(window.innerWidth / PX_PER_BIN)));
      const rows = Math.max(200, Math.round(window.innerHeight / PX_PER_BIN));
      canvas.width = bins;
      canvas.height = rows;

      const nextRow = makeSource(bins);
      const img = ctx.createImageData(bins, 1);
      const paintRow = () => {
        const row = nextRow();
        for (let i = 0; i < bins; i++) {
          const v = Math.min(255, Math.max(0, Math.floor(row[i]! * 255)));
          img.data[i * 4] = LUT[v * 3]!;
          img.data[i * 4 + 1] = LUT[v * 3 + 1]!;
          img.data[i * 4 + 2] = LUT[v * 3 + 2]!;
          img.data[i * 4 + 3] = 255;
        }
        ctx.drawImage(canvas, 0, 1);
        ctx.putImageData(img, 0, 0);
      };

      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        if (now - last < 1000 / FPS) return;
        last = now;
        paintRow();
      };

      // Pre-fill so it fades in as a full screen of history, not an empty band.
      for (let r = 0; r < rows; r++) paintRow();
      setOn(true);
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) raf = requestAnimationFrame(loop);
    };

    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(start, { timeout: 1500 })
      : window.setTimeout(start, 300);

    return () => {
      cancelAnimationFrame(raf);
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      else clearTimeout(idle);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={`waterfall pointer-events-none fixed inset-0 z-0 h-full w-full${on ? ' on' : ''}`}
    />
  );
}
