import { useEffect, useRef, useState } from 'react';

// SDR-style waterfall behind the page, styled after a busy HF band. Rendered
// near screen resolution; each frame scrolls the image down one row and paints
// a fresh FFT row on top. Starts after the page is idle so it never competes
// with first paint. The band plan is rolled fresh on every load and stations
// come and go, so no two visits look the same.

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
const shuffle = <T,>(xs: T[]) => {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [xs[i], xs[j]] = [xs[j]!, xs[i]!];
  }
  return xs;
};

type Mode = 'cw' | 'ssb' | 'ft8' | 'rtty' | 'ofdm' | 'fm' | 'am';
type Seg = { lo: number; hi: number };

// CW and SSB always; the rest only sometimes, in shuffled order with random
// widths and gaps. Segments never overlap.
function bandPlan(): Partial<Record<Mode, Seg>> & { cw: Seg; ssb: Seg } {
  const weight: Record<Mode, number> = { cw: 3, ssb: 3, ft8: 1, rtty: 0.6, ofdm: 2.2, fm: 0.5, am: 0.7 };
  const extras = (['ft8', 'rtty', 'fm', 'am'] as Mode[]).filter(() => Math.random() < 0.65);
  const modes = shuffle<Mode>(['cw', 'ssb', 'ofdm', ...extras]);
  const w = modes.map((m) => weight[m] * (m === 'ofdm' ? rand(0.9, 1.2) : rand(0.6, 1.4)));
  const gap = modes.map(() => rand(0.05, 0.4));
  const total = [...w, ...gap].reduce((s, x) => s + x, 0);
  let x = rand(0.02, 0.05);
  const span = 0.97 - x;
  const plan: Partial<Record<Mode, Seg>> = {};
  modes.forEach((m, i) => {
    x += (gap[i]! * span) / total;
    const width = (w[i]! * span) / total;
    plan[m] = { lo: x, hi: x + width };
    x += width;
  });
  return plan as Partial<Record<Mode, Seg>> & { cw: Seg; ssb: Seg };
}

type Cw = { f: number; keys: number[]; unit: number; a: number; phase: number; qsb: number; pos: number; drift: number };

function makeSource(bins: number) {
  const B = (f: number) => f * bins; // band fraction -> bin
  let t = 0;
  const row = new Float32Array(bins);
  const plan = bandPlan();

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

  // Band conditions wander over minutes; everything except our station rides on it.
  let prop = rand(0.6, 1.1);
  let propVel = 0;

  // CW: ours keeps calling forever; the others finish a message, then either
  // call again or vanish and get replaced by someone new elsewhere.
  const CW = plan.cw;
  const homeF = rand(CW.lo + (CW.hi - CW.lo) * 0.2, CW.hi - (CW.hi - CW.lo) * 0.2);
  const home: Cw = { f: homeF, keys: keying('CQ CQ DE RIWAJ K'), unit: 3, a: 0.8, phase: 0, qsb: 140, pos: 0, drift: 0 };
  const calls = ['K5RWJ', 'W1AW', 'JA1XYZ', 'DL2ABC', 'VK3QQ', 'G4FON', '9N1AA', 'ZL2RX', 'PY2XB', 'OH8K', 'EA7HG', 'UA9CDE'];
  const msgs = [
    () => `CQ CQ DE ${pick(calls)} ${pick(calls)} K`,
    () => `CQ TEST ${pick(calls)}`,
    () => `${pick(calls)} DE ${pick(calls)} 599 TU`,
    () => `QRZ DE ${pick(calls)}`,
    () => `TNX FER QSO 73 SK`,
  ];
  const respawnCw = (s: Cw) => {
    let f = 0;
    do f = rand(CW.lo, CW.hi);
    while (Math.abs(f - homeF) < 0.008);
    s.f = f;
    s.keys = keying(pick(msgs)());
    s.unit = Math.floor(rand(2, 6));
    s.a = rand(0.25, 0.7);
    s.qsb = rand(60, 260);
    s.drift = Math.random() < 0.2 ? rand(-2, 2) * 1e-5 : 0; // the odd chirpy old rig
    s.pos = -Math.floor(rand(0, 300));
  };
  const cw = Array.from({ length: Math.floor(rand(3, 10)) }, () => {
    const s = { phase: rand(0, 6) } as Cw;
    respawnCw(s);
    s.pos = Math.floor(rand(0, 400));
    return s;
  });

  // SSB voice: talk spurts of shifting formants; between overs a station may QSY.
  const SSB = plan.ssb;
  const ssbLo = () => rand(SSB.lo, Math.max(SSB.lo, SSB.hi - 0.02));
  const ssb = Array.from({ length: Math.floor(rand(2, 7)) }, () => ({
    lo: ssbLo(),
    width: rand(0.012, 0.02),
    talking: false,
    left: Math.floor(rand(0, 120)),
    syl: 0,
    formants: [0.2, 0.45, 0.7],
    a: rand(0.35, 0.6),
  }));

  // FT8 sub-band: 15 s slots of 8-FSK stations, busier when the band is open.
  const SLOT = 15 * FPS;
  let ft8: { c: number; a: number; tones: number[] }[] = [];

  // RTTY: pairs of tones 170 Hz apart.
  const rtty = plan.rtty
    ? Array.from({ length: Math.floor(rand(1, 4)) }, () => ({
        c: rand(plan.rtty!.lo, Math.max(plan.rtty!.lo, plan.rtty!.hi - 0.006)),
        left: Math.floor(rand(0, 200)),
        on: false,
        phase: rand(0, 6),
      }))
    : [];

  // Wideband OFDM data in fixed TDMA slots: short enough that a screen holds a
  // dozen-plus bursts, so the rhythm reads as a pattern, not noise.
  const ofdmBurst = Math.floor(rand(14, 24));
  const ofdmPeriod = ofdmBurst + Math.floor(rand(8, 16));

  // AM broadcaster: steady carrier with fading audio sidebands.
  const am = plan.am && { c: (plan.am.lo + plan.am.hi) / 2, w: Math.min(0.012, (plan.am.hi - plan.am.lo) / 2.5) };

  const birdies = Array.from({ length: Math.floor(rand(3, 9)) }, () => ({ c: rand(0, 1), a: rand(0.08, 0.16) }));
  const drifter = Math.random() < 0.5 ? { c: rand(0.05, 0.95), v: rand(-4, 4) * 1e-5, a: rand(0.2, 0.4) } : null;
  let hop = { c: 0.5, left: 0 };
  const hopDuty = Math.floor(rand(80, 350));
  let sweep = -1;
  let radar = { left: 0, lo: 0 };
  let floorDrift = 0;

  return function nextRow(): Float32Array {
    t++;
    floorDrift += (Math.random() - 0.5) * 0.02;
    floorDrift *= 0.98;
    propVel = (propVel + (Math.random() - 0.5) * 4e-4) * 0.995;
    prop += propVel;
    if (prop < 0.35 || prop > 1.2) {
      prop = Math.min(1.2, Math.max(0.35, prop));
      propVel *= -0.5;
    }

    // Speckled noise floor (exponential like FFT bin power), with band edges rolled off.
    // Now and then a lightning crash lights up the whole row.
    const crash = Math.random() < 0.004 ? rand(0.1, 0.3) : 0;
    for (let i = 0; i < bins; i++) {
      const edge = Math.sin((i / bins) * Math.PI);
      row[i] = (0.055 + crash + prop * 0.02 + floorDrift * 0.05 - Math.log(Math.random() + 1e-6) * 0.045) * (0.6 + 0.4 * edge);
    }

    for (const b of birdies) gauss(B(b.c), 0.6, b.a);

    if (home.keys[Math.floor(t / home.unit) % home.keys.length]) gauss(B(home.f), 0.8, home.a * fade(140, 0));
    for (const s of cw) {
      const k = Math.floor(++s.pos / s.unit);
      if (k >= s.keys.length) {
        if (Math.random() < 0.6) respawnCw(s);
        else s.pos = -Math.floor(rand(30, 200));
        continue;
      }
      s.f += s.drift;
      if (k >= 0 && s.keys[k]) gauss(B(s.f), 0.8, s.a * prop * fade(s.qsb, s.phase));
    }

    for (const v of ssb) {
      if (v.left-- <= 0) {
        v.talking = !v.talking;
        v.left = v.talking ? Math.floor(rand(60, 240)) : Math.floor(rand(20, 150));
        if (!v.talking && Math.random() < 0.25) {
          v.lo = ssbLo();
          v.a = rand(0.3, 0.65);
          v.left = Math.floor(rand(100, 500));
        }
      }
      if (!v.talking) continue;
      if (v.syl-- <= 0) {
        v.syl = Math.floor(rand(3, 9));
        v.formants = v.formants.map((p) => Math.min(0.9, Math.max(0.08, p + rand(-0.12, 0.12))));
      }
      const loud = v.a * prop * (0.4 + Math.random() * 0.6) * (v.syl > 1 ? 1 : 0.3);
      const lo = B(v.lo);
      const w = B(v.width);
      block(lo, lo + w, loud * 0.25, 0.8);
      for (const p of v.formants) gauss(lo + w * p, w * 0.08, loud * 0.6);
    }

    // FT8: new set of stations each slot, transmitting for ~12.6 s.
    if (plan.ft8) {
      const { lo, hi } = plan.ft8;
      const slotT = t % SLOT;
      if (slotT === 0) {
        ft8 = Array.from({ length: Math.floor(rand(2, 5 + prop * 8)) }, () => ({
          c: rand(lo, Math.max(lo, hi - 0.01)),
          a: rand(0.3, 0.75),
          tones: Array.from({ length: 79 }, () => Math.floor(Math.random() * 8)),
        }));
      }
      if (slotT > 15 && slotT < 15 + 79 * 5) {
        const sym = Math.floor((slotT - 15) / 5);
        for (const s of ft8) gauss(B(s.c) + s.tones[sym]! * B(0.0012), 0.7, s.a * prop);
      }
    }

    // RTTY bursts.
    for (const r of rtty) {
      if (r.left-- <= 0) {
        r.on = !r.on;
        r.left = Math.floor(r.on ? rand(120, 400) : rand(60, 300));
      }
      if (r.on) gauss(B(r.c) + (Math.random() < 0.5 ? 0 : B(0.006)), 0.8, 0.6 * prop * fade(90, r.phase));
    }

    // OFDM: flat-topped block keyed on the slot clock, bright preamble leading each burst.
    if (plan.ofdm) {
      const k = t % ofdmPeriod;
      if (k < ofdmBurst) block(B(plan.ofdm.lo), B(plan.ofdm.hi), (k < 2 ? 0.45 : 0.24) * (0.85 + 0.15 * prop), 0.3);
    }

    // Wideband FM-ish carrier wobbling with audio.
    if (plan.fm) {
      const c = (plan.fm.lo + plan.fm.hi) / 2;
      const w = Math.min(0.006, (plan.fm.hi - plan.fm.lo) / 4);
      gauss(B(c) + Math.sin(t / 9) * B(w * 0.7) + Math.sin(t / 3.7) * B(w * 0.35), B(w), 0.3);
    }

    if (am) {
      const audio = prop * (0.5 + Math.random() * 0.5) * fade(200, 1);
      gauss(B(am.c), 0.9, 0.7 * prop);
      block(B(am.c - am.w), B(am.c) - 1, audio * 0.18, 0.7);
      block(B(am.c) + 1, B(am.c + am.w), audio * 0.18, 0.7);
    }

    // Unstable carrier slowly walking across the band.
    if (drifter) {
      drifter.c += drifter.v;
      if (drifter.c < 0.02 || drifter.c > 0.98) drifter.v *= -1;
      gauss(B(drifter.c), 0.7, drifter.a * fade(300, 0));
    }

    // Frequency hopper.
    if (hop.left-- <= 0) hop = { c: rand(0.05, 0.95), left: Math.floor(rand(5, 10)) };
    if (t % 500 < hopDuty) gauss(B(hop.c), B(0.003), 0.45);

    // Occasional chirp sweeping the whole band.
    if (sweep < 0 && Math.random() < 0.0015) sweep = 0;
    if (sweep >= 0) {
      gauss(sweep, 1.5, 0.45);
      sweep += bins / 120;
      if (sweep > bins) sweep = -1;
    }

    // Over-the-horizon radar: a wide pulsed comb that parks for a few seconds.
    if (radar.left <= 0 && Math.random() < 0.0008) radar = { left: Math.floor(rand(90, 300)), lo: rand(0.05, 0.85) };
    if (radar.left > 0 && radar.left-- % 3 === 0) block(B(radar.lo), B(radar.lo + 0.06), 0.2, 0.6);

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
