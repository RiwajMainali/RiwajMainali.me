import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/gym/client';
import {
  effectiveDaily,
  rollingSevenDays,
  weeklyTotals,
  type EffectivePoint,
  type SetScore,
  type VolumeRow,
} from '../../lib/gym/volume';
import { unitLabel } from '../../lib/gym/types';
type Comparison = {
  exercise: string;
  weeks: number;
  effectiveCorrelation: number;
  rirDecayCorrelation: number;
};
export default function VolumeHistory({
  selectedExerciseId,
  refresh,
}: {
  selectedExerciseId: string;
  refresh: unknown;
}) {
  const [rows, setRows] = useState<VolumeRow[]>([]),
    [scores, setScores] = useState<SetScore[]>([]),
    [comparison, setComparison] = useState<Comparison[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const [scope, setScope] = useState<'exercise' | 'day' | 'week' | 'muscle'>(
      'day'
    ),
    [exerciseId, setExerciseId] = useState(selectedExerciseId),
    [muscle, setMuscle] = useState('');
  const [model, setModel] = useState<'hard' | 'completion' | 'rir_decay'>(
      'completion'
    ),
    [unit, setUnit] = useState<'lb' | 'kg'>('lb'),
    [exponent, setExponent] = useState(1),
    [useFloor, setUseFloor] = useState(false),
    [halveAfterTen, setHalveAfterTen] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError('');
    void api<{
      rows: VolumeRow[];
      scores: SetScore[];
      e1rmComparison: Comparison[];
    }>('volume')
      .then((r) => {
        if (!c.signal.aborted) {
          setRows(r.rows);
          setScores(r.scores);
          setComparison(r.e1rmComparison ?? []);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError((e as Error).message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [refresh]);
  const exercises = [
    ...new Map(
      rows.map((r) => [r.exerciseId, { id: r.exerciseId, name: r.exercise }])
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));
  const muscles = [
    ...new Set(scores.flatMap((s) => s.muscles.map((m) => m.muscle))),
  ].sort();
  const activeExercise = exercises.some((e) => e.id === exerciseId)
    ? exerciseId
    : exercises.some((e) => e.id === selectedExerciseId)
    ? selectedExerciseId
    : exercises[0]?.id ?? '';
  const preferredMuscle = scores
    .find((s) => s.exerciseId === activeExercise)
    ?.muscles.find((m) => m.coefficient === 1)?.muscle;
  const activeMuscle = muscles.includes(muscle)
    ? muscle
    : preferredMuscle ?? muscles[0] ?? '';
  const daily = useMemo(() => {
    const filtered = scores.filter(
      (s) =>
        (scope !== 'exercise' || s.exerciseId === activeExercise) &&
        (!activeMuscle || s.muscles.some((m) => m.muscle === activeMuscle)) &&
        !s.ignored &&
        s.reps > 0
    );
    if (model === 'hard') {
      const grouped = new Map<string, EffectivePoint>();
      for (const s of filtered) {
        if (s.rir === null || s.rir > 3) continue;
        for (const m of s.muscles) {
          if (m.muscle !== activeMuscle) continue;
          const key = JSON.stringify([s.date, m.muscle]);
          const p = grouped.get(key) ?? {
            date: s.date,
            muscle: m.muscle,
            score: 0,
            sets: 0,
            missingRir: 0,
          };
          p.score += m.coefficient;
          p.sets++;
          grouped.set(key, p);
        }
      }
      const points = [...grouped.values()];
      return scope === 'week'
        ? weeklyTotals(points, activeMuscle)
        : rollingSevenDays(points, activeMuscle);
    }
    const points = effectiveDaily(
      scores,
      model === 'completion' ? 'completion' : 'rir_decay',
      {
        exerciseId: scope === 'exercise' ? activeExercise : undefined,
        muscle: activeMuscle,
        exponent,
        floor: useFloor ? 0.4 : undefined,
        halveAfterTen,
      }
    );
    return scope === 'week'
      ? weeklyTotals(points, activeMuscle)
      : rollingSevenDays(points, activeMuscle);
  }, [
    model,
    rows,
    scores,
    scope,
    activeExercise,
    activeMuscle,
    exponent,
    useFloor,
    halveAfterTen,
  ]);
  const name =
    scope === 'day' || scope === 'week'
      ? 'All exercises'
      : scope === 'muscle'
      ? activeMuscle
      : exercises.find((e) => e.id === activeExercise)?.name ?? 'Exercise';
  const values = daily.map((p) => p.score),
    max = Math.max(1, ...values) * 1.1,
    start = Date.parse(daily[0]?.date ?? '2026-01-01'),
    end = Date.parse(daily[daily.length - 1]?.date ?? '2026-01-02');
  const xy = (p: { date: string; score: number }) =>
    `${
      55 +
      ((Date.parse(p.date) - start) / Math.max(86400000, end - start)) * 610
    },${190 - (p.score / max) * 155}`;
  const missing = scores.filter(
    (s) =>
      s.ignored === 'missing_rir' &&
      (scope !== 'exercise' || s.exerciseId === activeExercise)
  );
  const detailScores = scores.filter(
    (s) => scope !== 'exercise' || s.exerciseId === activeExercise
  );
  return (
    <section className="gym-card" aria-label="Training volume">
      <h2>Volume history</h2>
      <div className="gym-fields">
        <label htmlFor="volume-scope">
          Volume view
          <select
            id="volume-scope"
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
          >
            <option value="exercise">Per exercise</option>
            <option value="day">Per day — all exercises</option>
            <option value="week">Per week — all exercises</option>
            <option value="muscle">Per muscle group daily</option>
          </select>
        </label>
        {scope === 'exercise' && (
          <label htmlFor="volume-exercise">
            Exercise
            <select
              id="volume-exercise"
              value={activeExercise}
              onChange={(e) => setExerciseId(e.target.value)}
            >
              {exercises.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label htmlFor="volume-muscle">
          Muscle group
          <select
            id="volume-muscle"
            value={activeMuscle}
            onChange={(e) => setMuscle(e.target.value)}
          >
            {muscles.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label htmlFor="volume-model">
          Scoring model
          <select
            id="volume-model"
            value={model}
            onChange={(e) => setModel(e.target.value as typeof model)}
          >
            <option value="completion">Reps ÷ (reps + RIR)</option>
            <option value="rir_decay">RIR decay (0.9^RIR)</option>
            <option value="hard">Hard sets (RIR ≤ 3)</option>
          </select>
        </label>
      </div>
      {model === 'completion' && (
        <div className="gym-fields">
          <label htmlFor="volume-exponent">
            Exponent k: {exponent.toFixed(1)}
            <input
              id="volume-exponent"
              type="range"
              min="1"
              max="2"
              step="0.5"
              value={exponent}
              onChange={(e) => setExponent(Number(e.target.value))}
            />
          </label>
          <label>
            <span>Exclude sets below 0.4 completion</span>
            <input
              type="checkbox"
              checked={useFloor}
              onChange={(e) => setUseFloor(e.target.checked)}
            />
          </label>
          <label>
            <span>Halve effective sets past 10 per muscle/session</span>
            <input
              type="checkbox"
              checked={halveAfterTen}
              onChange={(e) => setHalveAfterTen(e.target.checked)}
            />
          </label>
        </div>
      )}
      {(model === 'completion' || model === 'rir_decay') && (
        <label htmlFor="volume-unit">
          Display score as
          <select id="volume-unit" value="score" disabled>
            <option value="score">Effective sets</option>
          </select>
        </label>
      )}
      <p className="gym-muted">
        {model === 'hard'
          ? 'Counts strength sets with RIR ≤3 (RPE ≥7), weighted by primary/secondary muscle coefficients.'
          : model === 'completion'
          ? `Effective sets use [reps ÷ (reps + RIR)]^${exponent.toFixed(
              1
            )} per muscle coefficient. RIR can come from logged RIR, converted RPE, or your median for that exercise. RIR ≤10.`
          : 'RIR-decay score is 0.9^RIR per set, multiplied by its muscle coefficient.'}{' '}
        Muscle coefficients use 1.0 primary and 0.5 secondary. Daily views show
        a rolling 7-day sum; the weekly view groups Monday through Sunday.
        Cardio and warm-ups are excluded; zero-rep sets are ignored.
      </p>
      {loading ? (
        <p>Loading your volume history…</p>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : !daily.length ? (
        <p>No scored sets yet for this view.</p>
      ) : (
        <>
          <h3>
            {name} · {activeMuscle}
          </h3>
          <svg
            viewBox="0 0 700 235"
            role="img"
            aria-label={`${name} ${activeMuscle} ${
              scope === 'week' ? 'weekly' : 'rolling seven day'
            } ${model} volume`}
          >
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line
                  x1="55"
                  x2="665"
                  y1={190 - 155 * f}
                  y2={190 - 155 * f}
                  stroke="#ddd"
                />
                <text x="48" y={194 - 155 * f} textAnchor="end" fontSize="12">
                  {(max * f).toFixed(1)}
                </text>
              </g>
            ))}
            <polyline
              points={daily.map(xy).join(' ')}
              fill="none"
              stroke="#225d47"
              strokeWidth="2"
            />
            {daily.map((p) => {
              const [cx, cy] = xy(p).split(',');
              return (
                <circle key={p.date} cx={cx} cy={cy} r="4" fill="#225d47">
                  <title>
                    {p.date}: {p.score.toFixed(2)} effective sets
                  </title>
                </circle>
              );
            })}
            <text x="55" y="220" fontSize="12">
              {daily[0]!.date}
            </text>
            <text x="665" y="220" textAnchor="end" fontSize="12">
              {daily[daily.length - 1]!.date}
            </text>
          </svg>
          <table>
            <caption>
              {name} · {activeMuscle}{' '}
              {scope === 'week' ? 'weekly totals' : 'rolling seven-day totals'}
            </caption>
            <thead>
              <tr>
                <th>{scope === 'week' ? 'Week starting' : 'Date'}</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((p) => (
                <tr key={p.date}>
                  <td>{p.date}</td>
                  <td>{p.score.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {missing.length > 0 && (
        <p role="alert">
          {missing.length} set(s) need RIR. No exercise median was available, so
          these are flagged and excluded from both scores.
        </p>
      )}
      <details>
        <summary>
          Per-set RIR and score audit ({detailScores.length} sets)
        </summary>
        <p>
          RPE is converted to RIR = 10 − RPE. Missing RIR uses the median of
          that exercise’s non-warmup logged sets. The comparison RIR-decay
          formula is 0.9^RIR. Each row lists both scores and muscle
          coefficients.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Date / exercise</th>
                <th>Set</th>
                <th>Reps</th>
                <th>Load</th>
                <th>RIR / source</th>
                <th>Completion</th>
                <th>Completion score by muscle</th>
                <th>RIR decay by muscle</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {detailScores.map((s, i) => (
                <tr key={`${s.date}-${s.exerciseId}-${s.setNumber}-${i}`}>
                  <td>
                    {s.date} · {s.exercise}
                  </td>
                  <td>{s.setNumber}</td>
                  <td>{s.reps}</td>
                  <td>
                    {s.load} {s.unit}
                  </td>
                  <td>
                    {s.rir ?? '—'} / {s.rirSource}
                  </td>
                  <td>{s.completionRatio?.toFixed(3) ?? '—'}</td>
                  <td>
                    {s.completionScore === null
                      ? '—'
                      : s.muscles
                          .map((m) => `${m.muscle} ${m.completion.toFixed(2)}`)
                          .join(', ')}
                  </td>
                  <td>
                    {s.rirDecayScore === null
                      ? '—'
                      : s.muscles
                          .map((m) => `${m.muscle} ${m.rirDecay.toFixed(2)}`)
                          .join(', ')}
                  </td>
                  <td>
                    {s.ignored ??
                      (s.rirSource === 'exercise_median'
                        ? 'RIR imputed'
                        : 'Counted')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <details>
        <summary>e1RM volume comparison</summary>
        {comparison.length === 0 ? (
          <p>
            Need at least eight weeks and nine weekly records for a lift before
            comparing whether preceding weekly effective-set or RIR-decay volume
            correlates with next week’s e1RM. Treat these as descriptive
            correlations, not proof of prediction.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Lift</th>
                <th>Weeks</th>
                <th>Effective sets → next week e1RM (r)</th>
                <th>RIR decay → next week e1RM (r)</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((c) => (
                <tr key={c.exercise}>
                  <td>{c.exercise}</td>
                  <td>{c.weeks}</td>
                  <td>{c.effectiveCorrelation.toFixed(2)}</td>
                  <td>{c.rirDecayCorrelation.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </details>
    </section>
  );
}
