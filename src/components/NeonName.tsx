import { useState, type CSSProperties } from 'react';

// Per-letter neon tube. Each letter lights on its own schedule, a few are
// "broken" and keep sputtering. Hover or click fixes the sign.
// Broken letters: index -> flicker pattern + loop length (s). Odd lengths keep
// them from syncing up.
const BROKEN: Record<number, { pattern: 'sputter' | 'dying' | 'blink'; dur: number }> = {
  2: { pattern: 'blink', dur: 5.3 },
  4: { pattern: 'sputter', dur: 3.7 },
  10: { pattern: 'dying', dur: 7.9 },
};

// Deterministic jitter so the ignite order looks random but SSR and client agree.
const delayFor = (i: number) => 0.1 + ((i * 7) % 11) * 0.06;

export default function NeonName({ text }: { text: string }) {
  const [repaired, setRepaired] = useState(false);

  return (
    <h1
      className={`neon${repaired ? ' repaired' : ''}`}
      aria-label={text}
      title={repaired ? undefined : 'this sign needs a repair'}
      onClick={() => setRepaired((r) => !r)}
    >
      {[...text].map((ch, i) => {
        const broken = BROKEN[i];
        const style = {
          '--d': `${delayFor(i)}s`,
          '--i': i,
          ...(broken && { '--dur': `${broken.dur}s` }),
        } as CSSProperties;
        return (
          <span
            key={i}
            aria-hidden
            data-c={ch}
            style={style}
            className={`neon-letter${ch === ' ' ? ' neon-space' : ''}${broken ? ` broken ${broken.pattern}` : ''}`}
          >
            {ch}
          </span>
        );
      })}
    </h1>
  );
}
