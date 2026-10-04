import { useEffect, useState, type CSSProperties } from 'react';

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
  // Red flicker when the terminal fires `neon:alarm` (wrong sudo password).
  // Restart on every event so back-to-back failures each flash.
  const [alarm, setAlarm] = useState(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onAlarm = () => {
      // A failed break-in undoes the repair: the sign comes back broken.
      setRepaired(false);
      setAlarm((a) => a + 1);
      clearTimeout(timer);
      timer = setTimeout(() => setAlarm(0), 1200);
    };
    window.addEventListener('neon:alarm', onAlarm);
    return () => {
      window.removeEventListener('neon:alarm', onAlarm);
      clearTimeout(timer);
    };
  }, []);

  return (
    <h1
      key={alarm ? `alarm-${alarm}` : 'calm'}
      className={`neon${repaired ? ' repaired' : ''}${alarm ? ' alarm' : ''}`}
      aria-label={text}
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
