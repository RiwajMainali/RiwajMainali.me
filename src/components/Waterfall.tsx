import { useEffect, useRef, useState } from 'react';

// SDR-style waterfall behind the page. Rendered at low resolution and stretched
// by CSS; each frame scrolls the image down one row and paints a fresh FFT row
// on top. Starts after the page is idle so it never competes with first paint.

const BINS = 320;
const ROWS = 220;
const FPS = 30;

// Black -> dark green -> neon -> white-hot.
const LUT = (() => {
  const lut = new Uint8ClampedArray(256 * 3);
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    lut[i * 3] = clamp((t - 0.72) * 3.5) * 220;
    lut[i * 3 + 1] = Math.pow(t, 0.85) * 255;
    lut[i * 3 + 2] = clamp((t - 0.55) * 2.2) * 140;
  }
  return lut;
})();

// "CQ CQ DE RIWAJ K" in Morse, one entry per dit-length unit (1 = key down).
const MORSE: Record<string, string> = {
  C: '-.-.', Q: '--.-', D: '-..', E: '.', R: '.-.', I: '..', W: '.--', A: '.-', J: '.---', K: '-.-',
};
const MORSE_KEYING = (() => {
  const units: number[] = [];
  for (const word of 'CQ CQ DE RIWAJ K'.split(' ')) {
    for (const ch of word) {
      for (const sym of MORSE[ch] ?? '') units.push(...(sym === '.' ? [1] : [1, 1, 1]), 0);
      units.push(0, 0);
    }
    units.push(0, 0, 0, 0);
  }
  return [...units, ...Array<number>(40).fill(0)];
})();

type Bump = { c: number; w: number; a: number };

function makeSource() {
  let t = 0;
  // Bursty FSK packets and a frequency hopper, re-rolled as they expire.
  let burst = { c: 0, left: 0, shift: 6 };
  let hop = { c: 60, left: 0 };
  let sweep = { c: -1 };

  return function nextRow(row: Float32Array) {
    t++;
    const bumps: Bump[] = [];

    // Steady carriers with slow drift.
    bumps.push({ c: 42 + Math.sin(t / 300) * 1.5, w: 0.9, a: 0.55 });
    bumps.push({ c: 251 + Math.sin(t / 170) * 0.8, w: 0.8, a: 0.4 });

    // Wideband FM-ish signal, wobbling with "audio".
    const fm = 150 + Math.sin(t / 9) * 4 + Math.sin(t / 3.7) * 2;
    bumps.push({ c: fm, w: 5, a: 0.35 + Math.random() * 0.1 });

    // CW beacon keying Morse, 3 rows per unit.
    if (MORSE_KEYING[Math.floor(t / 3) % MORSE_KEYING.length]) bumps.push({ c: 205, w: 0.7, a: 0.85 });

    // FSK bursts: two tones alternating each row.
    if (burst.left > 0) {
      burst.left--;
      bumps.push({ c: burst.c + (Math.random() < 0.5 ? 0 : burst.shift), w: 0.9, a: 0.7 });
    } else if (Math.random() < 0.012) {
      burst = { c: 70 + Math.random() * 200, left: 8 + Math.floor(Math.random() * 30), shift: 4 + Math.random() * 6 };
    }

    // Frequency hopper.
    if (hop.left-- <= 0) hop = { c: 20 + Math.random() * 280, left: 6 + Math.floor(Math.random() * 6) };
    if (t % 400 < 160) bumps.push({ c: hop.c, w: 1.6, a: 0.45 });

    // Occasional chirp sweeping across the band.
    if (sweep.c < 0 && Math.random() < 0.002) sweep.c = 0;
    if (sweep.c >= 0) {
      bumps.push({ c: sweep.c, w: 2, a: 0.5 });
      sweep.c += 3;
      if (sweep.c > BINS) sweep.c = -1;
    }

    for (let i = 0; i < BINS; i++) {
      // Noise floor with gentle roll-off at the band edges.
      const edge = Math.sin((i / BINS) * Math.PI);
      row[i] = (0.06 + Math.random() * 0.12) * (0.55 + 0.45 * edge);
    }
    for (const { c, w, a } of bumps) {
      const lo = Math.max(0, Math.floor(c - w * 3));
      const hi = Math.min(BINS - 1, Math.ceil(c + w * 3));
      for (let i = lo; i <= hi; i++) row[i] = row[i]! + a * Math.exp(-(((i - c) / w) ** 2));
    }
  };
}

export default function Waterfall() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const nextRow = makeSource();
    const row = new Float32Array(BINS);
    const img = ctx.createImageData(BINS, 1);

    const paintRow = () => {
      nextRow(row);
      for (let i = 0; i < BINS; i++) {
        const v = Math.min(255, Math.max(0, Math.floor(row[i]! * 255)));
        img.data[i * 4] = LUT[v * 3]!;
        img.data[i * 4 + 1] = LUT[v * 3 + 1]!;
        img.data[i * 4 + 2] = LUT[v * 3 + 2]!;
        img.data[i * 4 + 3] = 255;
      }
      ctx.drawImage(canvas, 0, 1);
      ctx.putImageData(img, 0, 0);
    };

    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 1000 / FPS) return;
      last = now;
      paintRow();
    };

    const start = () => {
      // Pre-fill so it fades in as a full screen of history, not an empty band.
      for (let r = 0; r < ROWS; r++) paintRow();
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
      width={BINS}
      height={ROWS}
      aria-hidden
      className={`waterfall pointer-events-none fixed inset-0 z-0 h-full w-full${on ? ' on' : ''}`}
    />
  );
}
