import { useEffect, useRef, useState } from 'react';
import { BAND_SPAN_HZ, sdr, type OnAir } from '~/lib/sdr';

// SDR-style waterfall behind the page, styled after a busy HF band. Each new
// row scrolls the image down one line and is painted on top. Starts after the
// page is idle so it never competes with first paint.
//
// The band simulation always runs in real time (TICK_HZ). Speed only changes
// how many rows that time is spread over, like an SDR's FFT size: slow scrolls
// average several ticks into each row over more, finer bins (smooth floor,
// sharp lines); fast scrolls repeat ticks over fewer, coarser bins that get
// stretched across the screen (blurry).
//
// Transmitters come and go: 4-7 of ~20 kinds are on air at any moment, each
// fades out after a while and is replaced, sometimes by a different mode on
// the very same spot.

const TICK_HZ = 30;
const PX_PER_BIN = 1.25; // at 1x
const FADE = 45;

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
function keying(text: string, tail = 30): number[] {
  const units: number[] = [];
  for (const word of text.split(' ')) {
    for (const ch of word) {
      for (const sym of MORSE[ch] ?? '') units.push(...(sym === '.' ? [1] : [1, 1, 1]), 0);
      units.push(0, 0);
    }
    units.push(0, 0, 0, 0);
  }
  return [...units, ...Array<number>(tail).fill(0)];
}

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const randInt = (lo: number, hi: number) => Math.floor(rand(lo, hi));
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)]!;

// Band kinds take a segment of this width range (band fractions); null means
// a wideband kind that roams the whole band.
const KINDS = {
  cw: [0.08, 0.2], ssb: [0.08, 0.2], ft8: [0.04, 0.08], rtty: [0.03, 0.06], ofdm: [0.05, 0.1],
  fm: [0.03, 0.05], am: [0.04, 0.07], psk: [0.02, 0.04], sstv: [0.03, 0.05], fax: [0.015, 0.025],
  drm: [0.03, 0.05], jammer: [0.06, 0.12], beacon: [0.01, 0.015], wspr: [0.012, 0.02], mfsk: [0.015, 0.03],
  ale: [0.012, 0.02], hop: null, drift: null, radar: null, chirp: null,
} as const;
type Kind = keyof typeof KINDS;
const ALL = Object.keys(KINDS) as Kind[];
type Seg = { lo: number; hi: number };
type Tx = { kind: Kind; label: string; seg: Seg | null; age: number; life: number; draw: (g: number) => void };

export const MIN_ON_AIR = 4;
export const MAX_ON_AIR = 7;

const CALLS = ['K5RWJ', 'W1AW', 'JA1XYZ', 'DL2ABC', 'VK3QQ', 'G4FON', '9N1AA', 'ZL2RX', 'PY2XB', 'OH8K', 'EA7HG', 'UA9CDE'];
const MSGS = [
  () => `CQ CQ DE ${pick(CALLS)} ${pick(CALLS)} K`,
  () => `CQ TEST ${pick(CALLS)}`,
  () => `${pick(CALLS)} DE ${pick(CALLS)} 599 TU`,
  () => `QRZ DE ${pick(CALLS)}`,
  () => `TNX FER QSO 73 SK`,
];

export function makeSource() {
  let bins = 1;
  let row = new Float32Array(1);
  const B = (f: number) => f * bins; // band fraction -> bin
  let t = 0;

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
  let floorDrift = 0;

  // Our own CW station keeps calling forever, in a slot nobody else lands on.
  const homeF = rand(0.06, 0.94);
  const homeSeg = { lo: homeF - 0.008, hi: homeF + 0.008 };
  const homeKeys = keying('CQ CQ DE RIWAJ K');
  sdr.home = homeF;
  const birdies = Array.from({ length: randInt(0, 9) }, () => ({ c: rand(0, 1), a: rand(0.08, 0.16) }));

  // Each factory sets up one transmitter on its segment and returns its painter;
  // g is the fade-in/out envelope. Every kind randomizes its own character too.
  const make: Record<Kind, (s: Seg) => { label: string; draw: (g: number) => void }> = {
    cw: (s) => {
      type St = { f: number; keys: number[]; unit: number; a: number; phase: number; qsb: number; pos: number; drift: number };
      const contest = Math.random() < 0.4;
      const respawn = (c: St) => {
        c.f = rand(s.lo, s.hi);
        c.keys = keying(contest ? `${pick(CALLS)} 5NN TU` : pick(MSGS)());
        c.unit = contest ? randInt(2, 3) : randInt(3, 6);
        c.a = rand(0.25, 0.7);
        c.qsb = rand(60, 260);
        c.drift = Math.random() < 0.2 ? rand(-2, 2) * 1e-5 : 0; // the odd chirpy old rig
        c.pos = -randInt(0, contest ? 60 : 300);
      };
      const st = Array.from({ length: contest ? randInt(5, 11) : randInt(2, 6) }, () => {
        const c = { phase: rand(0, 6) } as St;
        respawn(c);
        c.pos = randInt(0, 400);
        return c;
      });
      return {
        label: contest ? 'CW contest' : 'CW',
        draw: (g) => {
          for (const c of st) {
            const k = Math.floor(++c.pos / c.unit);
            if (k >= c.keys.length) {
              if (Math.random() < 0.6) respawn(c);
              else c.pos = -randInt(30, 200);
              continue;
            }
            c.f += c.drift;
            if (k >= 0 && c.keys[k]) gauss(B(c.f), 0.8, c.a * prop * fade(c.qsb, c.phase) * g);
          }
        },
      };
    },

    // Voice: talk spurts of shifting formants; between overs a station may QSY.
    ssb: (s) => {
      const lo = () => rand(s.lo, Math.max(s.lo, s.hi - 0.02));
      const st = Array.from({ length: randInt(2, 6) }, () => ({
        lo: lo(), width: rand(0.012, 0.02), talking: false, left: randInt(0, 120), syl: 0,
        formants: [0.2, 0.45, 0.7], a: rand(0.35, 0.6),
      }));
      const chatty = rand(0.5, 1.5);
      return {
        label: 'SSB voice',
        draw: (g) => {
          for (const v of st) {
            if (v.left-- <= 0) {
              v.talking = !v.talking;
              v.left = v.talking ? randInt(60, 240) * chatty : randInt(20, 150) / chatty;
              if (!v.talking && Math.random() < 0.25) {
                v.lo = lo();
                v.left = randInt(100, 500);
              }
            }
            if (!v.talking) continue;
            if (v.syl-- <= 0) {
              v.syl = randInt(3, 9);
              v.formants = v.formants.map((p) => Math.min(0.9, Math.max(0.08, p + rand(-0.12, 0.12))));
            }
            const loud = v.a * prop * g * (0.4 + Math.random() * 0.6) * (v.syl > 1 ? 1 : 0.3);
            const l = B(v.lo);
            const w = B(v.width);
            block(l, l + w, loud * 0.25, 0.8);
            for (const p of v.formants) gauss(l + w * p, w * 0.08, loud * 0.6);
          }
        },
      };
    },

    // FT8: 15 s slots of 8-FSK; FT4 is the same idea at 7.5 s and 4 tones.
    ft8: (s) => {
      const ft4 = Math.random() < 0.35;
      const slot = (ft4 ? 7.5 : 15) * TICK_HZ;
      const symT = ft4 ? 2 : 5;
      const nSym = ft4 ? 103 : 79;
      const tones = ft4 ? 4 : 8;
      const spacing = ft4 ? 0.0024 : 0.0012;
      let st: { c: number; a: number; tones: number[] }[] = [];
      return {
        label: ft4 ? 'FT4' : 'FT8',
        draw: (g) => {
          const k = t % slot;
          if (k === 0) {
            st = Array.from({ length: randInt(2, 4 + prop * 8) }, () => ({
              c: rand(s.lo, Math.max(s.lo, s.hi - spacing * tones)),
              a: rand(0.3, 0.75),
              tones: Array.from({ length: nSym }, () => randInt(0, tones)),
            }));
          }
          if (k > 15 && k < 15 + nSym * symT) {
            const sym = Math.floor((k - 15) / symT);
            for (const v of st) gauss(B(v.c + v.tones[sym]! * spacing), 0.7, v.a * prop * g);
          }
        },
      };
    },

    // RTTY: tone pairs, 170 Hz shift usually, sometimes the wide 850 Hz one.
    rtty: (s) => {
      const shift = pick([0.0005, 0.0005, 0.0024]);
      const st = Array.from({ length: randInt(1, 4) }, () => ({
        c: rand(s.lo, Math.max(s.lo, s.hi - shift)), left: randInt(0, 200), on: false, phase: rand(0, 6),
      }));
      return {
        label: 'RTTY',
        draw: (g) => {
          for (const r of st) {
            if (r.left-- <= 0) {
              r.on = !r.on;
              r.left = r.on ? randInt(120, 400) : randInt(60, 300);
            }
            if (r.on) gauss(B(r.c + (Math.random() < 0.5 ? 0 : shift)), 0.8, 0.6 * prop * g * fade(90, r.phase));
          }
        },
      };
    },

    // OFDM data. Grouped: a fixed frame of uneven bursts then a long pause.
    // Slotted: a steady TDMA clock. Continuous: always on, with pilot carriers.
    ofdm: (s) => {
      const style = pick(['grouped', 'grouped', 'slotted', 'continuous'] as const);
      const frame: number[] = []; // 0 off, 1 on, 2 preamble
      const burst = (len: number, gap: number) => {
        for (let i = 0; i < len; i++) frame.push(i < 2 ? 2 : 1);
        for (let i = 0; i < gap; i++) frame.push(0);
      };
      if (style === 'grouped') {
        for (let n = randInt(3, 7); n > 0; n--) burst(randInt(5, 16), randInt(4, 9));
        for (let i = randInt(30, 60); i > 0; i--) frame.push(0);
      } else if (style === 'slotted') burst(randInt(8, 20), randInt(6, 14));
      else frame.push(1);
      const pilots = style === 'continuous' ? Array.from({ length: randInt(2, 5) }, () => rand(0.1, 0.9)) : [];
      return {
        label: style === 'continuous' ? 'OFDM data link' : 'OFDM data bursts',
        draw: (g) => {
          const k = frame[t % frame.length]!;
          if (!k) return;
          const a = (k === 2 ? 0.45 : style === 'continuous' ? 0.14 : 0.24) * (0.85 + 0.15 * prop) * g;
          block(B(s.lo), B(s.hi), a, 0.3);
          for (const p of pilots) gauss(B(s.lo + (s.hi - s.lo) * p), 0.7, 0.35 * g);
        },
      };
    },

    // Wideband FM-ish carrier wobbling with audio.
    fm: (s) => {
      const c = (s.lo + s.hi) / 2;
      const w = Math.min(0.006, (s.hi - s.lo) / 4);
      const r1 = rand(5, 14);
      const r2 = rand(2, 5);
      return {
        label: 'NBFM',
        draw: (g) => gauss(B(c + Math.sin(t / r1) * w * 0.7 + Math.sin(t / r2) * w * 0.35), B(w), 0.3 * g),
      };
    },

    // AM broadcaster: carrier plus sidebands. Music fills them in, a talk show
    // is bursty, a numbers station is mostly bare carrier with short readouts.
    am: (s) => {
      const c = (s.lo + s.hi) / 2;
      const w = Math.min(0.012, (s.hi - s.lo) / 2.5);
      const style = pick(['music', 'talk', 'numbers'] as const);
      let talk = 0;
      return {
        label: style === 'numbers' ? 'numbers station' : `AM ${style}`,
        draw: (g) => {
          if (talk-- <= -60) talk = style === 'numbers' ? (Math.random() < 0.3 ? randInt(20, 60) : -randInt(30, 200)) : randInt(20, 200);
          const on = style === 'music' || talk > 0;
          const audio = on ? prop * g * (style === 'music' ? 0.8 + Math.random() * 0.2 : 0.4 + Math.random() * 0.6) * fade(200, 1) : 0;
          gauss(B(c), 0.9, 0.7 * prop * g);
          if (audio) {
            const ww = style === 'numbers' ? w * 0.4 : w;
            block(B(c - ww), B(c) - 1, audio * 0.18, 0.7);
            block(B(c) + 1, B(c + ww), audio * 0.18, 0.7);
          }
        },
      };
    },

    // PSK31: a handful of hair-thin traces that stop and start as people type.
    psk: (s) => {
      const st = Array.from({ length: randInt(2, 6) }, () => ({ f: rand(s.lo, s.hi), on: false, left: randInt(0, 100), a: rand(0.25, 0.6) }));
      return {
        label: 'PSK31',
        draw: (g) => {
          for (const p of st) {
            if (p.left-- <= 0) {
              p.on = !p.on;
              p.left = p.on ? randInt(60, 400) : randInt(30, 250);
            }
            if (p.on) gauss(B(p.f), 0.6, p.a * prop * g * (0.7 + Math.random() * 0.3));
          }
        },
      };
    },

    // SSTV: a picture sent one scan line at a time; the tone wanders with the
    // pixels and a sync pip sits at the low edge every line.
    sstv: (s) => {
      const line = randInt(8, 15);
      let pix = 0.5;
      return {
        label: 'SSTV',
        draw: (g) => {
          const k = t % line;
          if (k === 0) gauss(B(s.lo), 0.8, 0.6 * prop * g);
          else {
            pix = Math.min(1, Math.max(0, pix + rand(-0.25, 0.25)));
            gauss(B(s.lo + (s.hi - s.lo) * (0.2 + 0.8 * pix)), 0.9, 0.45 * prop * g);
          }
        },
      };
    },

    // Weather fax: black/white runs flipping between two tones.
    fax: (s) => {
      let white = false;
      let run = 0;
      return {
        label: 'WEFAX',
        draw: (g) => {
          if (run-- <= 0) {
            white = !white;
            run = randInt(1, 12);
          }
          gauss(B(white ? s.hi : s.lo), 0.9, 0.5 * prop * g);
          block(B(s.lo), B(s.hi), 0.05 * g, 0.8);
        },
      };
    },

    // DRM digital broadcast: a dense flat block with bright pilot tones.
    drm: (s) => {
      const pilots = [0.18, 0.5, 0.82].map((p) => p + rand(-0.05, 0.05));
      return {
        label: 'DRM digital radio',
        draw: (g) => {
          block(B(s.lo), B(s.hi), 0.2 * prop * g, 0.45);
          for (const p of pilots) gauss(B(s.lo + (s.hi - s.lo) * p), 0.7, 0.4 * prop * g);
        },
      };
    },

    // Jammer: a wall of noise with a bright bubble sawing back and forth.
    jammer: (s) => {
      const rate = rand(20, 90);
      return {
        label: 'jammer',
        draw: (g) => {
          block(B(s.lo), B(s.hi), 0.14 * g * fade(rate * 3, 0), 0.95);
          const saw = (t % rate) / rate;
          gauss(B(s.lo + (s.hi - s.lo) * saw), B(0.002), 0.35 * g);
        },
      };
    },

    // NCDXF-style beacon: callsign, then four dashes stepping down in power, on a fixed cycle.
    beacon: (s) => {
      const f = (s.lo + s.hi) / 2;
      const id = keying(pick(['4U1UN', 'W6WX', 'KH6RS', 'ZS6DN', 'VK6RBP']), 0);
      const seq = [...id, ...[0.9, 0.5, 0.25, 0.1].flatMap((p) => [...Array<number>(8).fill(p), 0, 0])];
      const unit = 2;
      const cycle = 10 * TICK_HZ;
      return {
        label: 'NCDXF beacon',
        draw: (g) => {
          const k = Math.floor((t % cycle) / unit);
          const a = k < seq.length ? seq[k]! : 0;
          if (a) gauss(B(f), 0.7, a * 0.7 * prop * g);
        },
      };
    },

    // WSPR: weak, slow 4-FSK with tiny tone spacing, 2-minute cycles. Only
    // the finer resolutions show the wiggle.
    wspr: (s) => {
      const st = Array.from({ length: randInt(2, 6) }, () => ({ f: rand(s.lo, s.hi - 0.0006), a: rand(0.15, 0.35), tone: 0 }));
      const cycle = 120 * TICK_HZ;
      return {
        label: 'WSPR',
        draw: (g) => {
          const k = t % cycle;
          if (k > 110 * TICK_HZ) return;
          for (const w of st) {
            if (k % 20 === 0) w.tone = randInt(0, 4);
            gauss(B(w.f + w.tone * 0.00015), 0.6, w.a * prop * g);
          }
        },
      };
    },

    // Olivia/MFSK: 32 tones across the segment, hopping fast. Reads as a
    // sparkly staircase.
    mfsk: (s) => {
      const tones = pick([16, 32]);
      const symT = randInt(2, 5);
      let tone = 0;
      return {
        label: tones === 32 ? 'Olivia 32' : 'MFSK16',
        draw: (g) => {
          if (t % symT === 0) tone = randInt(0, tones);
          gauss(B(s.lo + ((s.hi - s.lo) * tone) / tones), 0.7, 0.5 * prop * g);
        },
      };
    },

    // ALE: short 8-FSK link-setup calls now and then.
    ale: (s) => {
      let left = randInt(0, 150);
      let on = false;
      return {
        label: 'ALE',
        draw: (g) => {
          if (left-- <= 0) {
            on = !on;
            left = on ? randInt(25, 70) : randInt(80, 400);
          }
          if (on) gauss(B(s.lo + ((s.hi - s.lo) * randInt(0, 8)) / 7), 0.8, 0.5 * prop * g);
        },
      };
    },

    // Wideband kinds: they roam the whole band and cross everything.
    hop: () => {
      const dwell: [number, number] = pick([[3, 6], [5, 10], [10, 20]]);
      const w = rand(0.002, 0.005);
      const duty = randInt(80, 350);
      let c = 0.5;
      let left = 0;
      return {
        label: 'frequency hopper',
        draw: (g) => {
          if (left-- <= 0) {
            c = rand(0.05, 0.95);
            left = randInt(...dwell);
          }
          if (t % 500 < duty) gauss(B(c), B(w), 0.45 * g);
        },
      };
    },
    drift: () => {
      // One carrier, or a few marching in parallel.
      const c = rand(0.05, 0.9);
      const v = rand(-4, 4) * 1e-5;
      const st = Array.from({ length: pick([1, 1, 2, 3]) }, (_, i) => ({ c: c + i * 0.004, v, a: rand(0.2, 0.4), i }));
      return {
        label: st.length > 1 ? 'drifting carriers' : 'drifting carrier',
        draw: (g) => {
          for (const d of st) {
            d.c += d.v;
            if (d.c < 0.02 || d.c > 0.98) d.v = -d.v;
            gauss(B(d.c), 0.7, d.a * fade(300, d.i) * g);
          }
        },
      };
    },
    // Over-the-horizon radar: a wide pulsed comb that parks for a few seconds.
    radar: () => {
      const w = rand(0.03, 0.08);
      const pulse = randInt(2, 5);
      let left = 0;
      let lo = 0;
      return {
        label: 'OTH radar',
        draw: (g) => {
          if (left <= 0 && Math.random() < 0.006) {
            left = randInt(90, 300);
            lo = rand(0.02, 0.98 - w);
          }
          if (left > 0 && left-- % pulse === 0) block(B(lo), B(lo + w), 0.2 * g, 0.6);
        },
      };
    },
    // Ionosonde: a chirp sweeping the whole band on a schedule.
    chirp: () => {
      const every = randInt(150, 450);
      const speed = rand(1 / 160, 1 / 60);
      let pos = -1;
      return {
        label: 'ionosonde chirp',
        draw: (g) => {
          if (pos < 0 && t % every === 0) pos = 0;
          if (pos >= 0) {
            gauss(B(pos), 1.5, 0.45 * g);
            pos += speed;
            if (pos > 1) pos = -1;
          }
        },
      };
    },
  };

  // Transmitter roster. Fading ones are already on their way out, so they
  // neither count toward the 4-7 nor block a new one landing on their spot.
  const txs: Tx[] = [];
  const live = () => txs.filter((x) => x.age < x.life - FADE);
  let target = randInt(MIN_ON_AIR, MAX_ON_AIR + 1);
  let wait = 0;

  const clear = (s: Seg, o: Seg) => s.hi + 0.005 < o.lo || s.lo - 0.005 > o.hi;
  const fits = (s: Seg) =>
    s.lo >= 0.02 && s.hi <= 0.98 && clear(s, homeSeg) && live().every((x) => !x.seg || clear(s, x.seg));
  const spawn = (near?: number, not?: Kind): boolean => {
    const busy = new Set(live().map((x) => x.kind));
    const kinds = ALL.filter((k) => k !== not && !busy.has(k)).sort(() => Math.random() - 0.5);
    for (const kind of kinds) {
      const range = KINDS[kind];
      let seg: Seg | null = null;
      if (range) {
        const w = rand(range[0], range[1]);
        for (let n = 0; n < 40 && !seg; n++) {
          const lo = near !== undefined && n < 10 ? near - w / 2 + rand(-0.01, 0.01) : rand(0.02, 0.98 - w);
          if (fits({ lo, hi: lo + w })) seg = { lo, hi: lo + w };
        }
        if (!seg) continue;
      } else if (near !== undefined) continue;
      const { label, draw } = make[kind](seg ?? { lo: 0, hi: 1 });
      txs.push({ kind, label, seg, age: 0, life: randInt(20, 120) * TICK_HZ, draw });
      return true;
    }
    return false;
  };
  for (let n = 0; n < target; n++) spawn();
  for (const x of txs) x.age = randInt(FADE, x.life - FADE * 3); // mid-transmission at load

  const publish = () => {
    sdr.onAir = txs
      .filter((x) => x.age < x.life - FADE)
      .map((x): OnAir => (x.seg ? { label: x.label, ...x.seg } : { label: x.label, lo: null, hi: null }));
  };
  publish();

  function roster() {
    let changed = false;
    for (let i = txs.length - 1; i >= 0; i--) {
      const x = txs[i]!;
      if (++x.age === x.life - FADE) {
        changed = true;
        // Half the time the spot is handed straight to a different mode.
        if (x.seg && Math.random() < 0.5) spawn((x.seg.lo + x.seg.hi) / 2, x.kind);
      }
      if (x.age >= x.life) txs.splice(i, 1);
    }
    const n = live().length;
    if (n < MIN_ON_AIR || (n < target && wait-- <= 0)) {
      if (n < MAX_ON_AIR && spawn()) changed = true;
      wait = randInt(60, 600);
    }
    if (t % (60 * TICK_HZ) === 0) target = randInt(MIN_ON_AIR, MAX_ON_AIR + 1);
    if (changed) publish();
  }

  return {
    resize(n: number) {
      bins = n;
      row = new Float32Array(n);
      sdr.rbwHz = BAND_SPAN_HZ / n;
    },
    tick(): Float32Array {
      t++;
      floorDrift = (floorDrift + (Math.random() - 0.5) * 0.02) * 0.98;
      propVel = (propVel + (Math.random() - 0.5) * 4e-4) * 0.995;
      prop += propVel;
      if (prop < 0.35 || prop > 1.2) {
        prop = Math.min(1.2, Math.max(0.35, prop));
        propVel *= -0.5;
      }

      // Speckled noise floor (exponential like FFT bin power), with band edges
      // rolled off. Now and then a lightning crash lights up the whole row.
      const crash = Math.random() < 0.004 ? rand(0.1, 0.3) : 0;
      for (let i = 0; i < bins; i++) {
        const edge = Math.sin((i / bins) * Math.PI);
        row[i] = (0.055 + crash + prop * 0.02 + floorDrift * 0.05 - Math.log(Math.random() + 1e-6) * 0.045) * (0.6 + 0.4 * edge);
      }
      for (const b of birdies) gauss(B(b.c), 0.6, b.a);
      if (homeKeys[Math.floor(t / 3) % homeKeys.length]) gauss(B(homeF), 0.8, 0.8 * fade(140, 0));

      roster();
      for (const x of txs) x.draw(Math.min(1, x.age / FADE, (x.life - x.age) / FADE));
      return row;
    },
    // For tests.
    onAir: () => live().map((x) => x.seg),
    kinds: () => live().map((x) => x.kind),
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
    let unsubscribe = () => {};

    const start = () => {
      const rows = Math.max(200, Math.round(window.innerHeight / PX_PER_BIN));
      const maxBins = Math.min(3000, Math.round(window.innerWidth * Math.max(2, window.devicePixelRatio)));
      const binsFor = (s: number) => Math.min(maxBins, Math.max(120, Math.round(window.innerWidth / (PX_PER_BIN * s))));

      const src = makeSource();
      let speed = sdr.getSpeed();
      let bins = 0;
      let img = ctx.createImageData(1, 1);
      let acc = new Float32Array(1);
      let debt = 1; // >= 1 forces a fresh tick before the next row, so no row paints from an empty buffer

      // New bin count, keeping the history on screen by stretching it across.
      const resize = () => {
        const n = binsFor(speed);
        if (n === bins) return;
        let old: HTMLCanvasElement | null = null;
        if (bins) {
          old = document.createElement('canvas');
          old.width = bins;
          old.height = rows;
          old.getContext('2d')!.drawImage(canvas, 0, 0);
        }
        bins = n;
        canvas.width = n;
        canvas.height = rows;
        if (old) ctx.drawImage(old, 0, 0, n, rows);
        img = ctx.createImageData(n, 1);
        acc = new Float32Array(n);
        src.resize(n);
        debt = Math.max(debt, 1);
      };
      resize();

      // One screen row covers 1/speed ticks: slow rows average several, fast
      // rows repeat the last one.
      const paintRow = () => {
        debt += 1 / speed;
        if (debt >= 1) {
          acc.fill(0);
          let n = 0;
          for (; debt >= 1; debt--, n++) {
            const r = src.tick();
            for (let i = 0; i < bins; i++) acc[i] = acc[i]! + r[i]!;
          }
          for (let i = 0; i < bins; i++) acc[i] = acc[i]! / n;
        }
        for (let i = 0; i < bins; i++) {
          const v = Math.min(255, Math.max(0, Math.floor(acc[i]! * 255)));
          img.data[i * 4] = LUT[v * 3]!;
          img.data[i * 4 + 1] = LUT[v * 3 + 1]!;
          img.data[i * 4 + 2] = LUT[v * 3 + 2]!;
          img.data[i * 4 + 3] = 255;
        }
        ctx.drawImage(canvas, 0, 1);
        ctx.putImageData(img, 0, 0);
      };

      let last = performance.now();
      let due = 0;
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        due = Math.min(due + ((now - last) / 1000) * TICK_HZ * speed, 8);
        last = now;
        for (; due >= 1; due--) paintRow();
      };

      // Pre-fill so it fades in as a full screen of history, not an empty band.
      for (let r = 0; r < rows; r++) paintRow();
      setOn(true);
      unsubscribe = sdr.subscribe((s) => {
        speed = s;
        resize();
      });
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) raf = requestAnimationFrame(loop);
    };

    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(start, { timeout: 1500 })
      : window.setTimeout(start, 300);

    return () => {
      cancelAnimationFrame(raf);
      unsubscribe();
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
