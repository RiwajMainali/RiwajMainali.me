import { useEffect, useState } from 'react';
import { api } from '../../lib/gym/client';
import { dailyVolume, type VolumeRow } from '../../lib/gym/volume';
import { unitLabel } from '../../lib/gym/types';
export default function VolumeHistory({
  selectedExerciseId,
  refresh,
}: {
  selectedExerciseId: string;
  refresh: unknown;
}) {
  const [rows, setRows] = useState<VolumeRow[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const [scope, setScope] = useState<'exercise' | 'day' | 'muscle'>('exercise');
  const [exerciseId, setExerciseId] = useState(selectedExerciseId),
    [muscle, setMuscle] = useState('');
  const [unit, setUnit] = useState<'lb' | 'kg'>('lb');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void api<{ rows: VolumeRow[] }>('volume')
      .then((r) => {
        if (!controller.signal.aborted) setRows(r.rows);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError((e as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [refresh]);
  const exercises = [
    ...new Map(
      rows.map((r) => [r.exerciseId, { id: r.exerciseId, name: r.exercise }])
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));
  const muscles = [...new Set(rows.map((r) => r.muscle))].sort();
  const activeExercise = exercises.some((e) => e.id === exerciseId)
    ? exerciseId
    : exercises[0]?.id ?? '';
  const activeMuscle = muscles.includes(muscle) ? muscle : muscles[0] ?? '';
  const factor = unit === 'lb' ? 1 / 0.45359237 : 1;
  const points = dailyVolume(
    rows,
    scope,
    scope === 'exercise' ? activeExercise : activeMuscle
  ).map((p) => ({ ...p, volume: p.volume * factor }));
  const name =
    scope === 'day'
      ? 'All exercises'
      : scope === 'muscle'
      ? activeMuscle
      : exercises.find((e) => e.id === activeExercise)?.name ?? 'Exercise';
  const max = Math.max(1, ...points.map((p) => p.volume)) * 1.1;
  const start = Date.parse(points[0]?.date ?? '2026-01-01'),
    end = Date.parse(points[points.length - 1]?.date ?? '2026-01-02');
  const xy = (p: { date: string; volume: number }) =>
    `${
      55 +
      ((Date.parse(p.date) - start) / Math.max(86400000, end - start)) * 610
    },${190 - (p.volume / max) * 155}`;
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
        {scope === 'muscle' && (
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
        )}
        <label htmlFor="volume-unit">
          Volume units
          <select
            id="volume-unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value as typeof unit)}
          >
            <option value="lb">lbs·reps</option>
            <option value="kg">kg·reps</option>
          </select>
        </label>
      </div>
      <p className="gym-muted">
        Working-set weight × reps, summed by workout date across your full
        history. Warmups and cardio excluded; bodyweight itself is not added.
        Muscle totals use each exercise’s primary muscle once, without crediting
        secondary muscles.
      </p>
      {loading ? (
        <p>Loading full volume history…</p>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : !points.length ? (
        <p>No working sets logged for this view yet.</p>
      ) : (
        <>
          <h3>{name}</h3>
          <p>
            Total: {points.reduce((n, p) => n + p.volume, 0).toFixed(1)}{' '}
            {unitLabel(unit)}·reps · {points.reduce((n, p) => n + p.sets, 0)}{' '}
            working sets
          </p>
          <svg
            viewBox="0 0 700 235"
            role="img"
            aria-label={`${name} daily volume in ${unitLabel(unit)} times reps`}
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
                  {Math.round(max * f)}
                </text>
              </g>
            ))}
            <polyline
              points={points.map(xy).join(' ')}
              fill="none"
              stroke="#225d47"
              strokeWidth="2"
            />
            {points.map((p) => {
              const [cx, cy] = xy(p).split(',');
              return (
                <circle key={p.date} cx={cx} cy={cy} r="4" fill="#225d47">
                  <title>
                    {p.date}: {p.volume.toFixed(1)} {unitLabel(unit)}·reps
                  </title>
                </circle>
              );
            })}
            <text x="55" y="220" fontSize="12">
              {points[0]!.date}
            </text>
            <text x="665" y="220" textAnchor="end" fontSize="12">
              {points[points.length - 1]!.date}
            </text>
          </svg>
          <table>
            <caption>{name} — daily totals</caption>
            <thead>
              <tr>
                <th>Date</th>
                <th>Volume ({unitLabel(unit)}·reps)</th>
                <th>Sets</th>
                <th>Reps</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.date}>
                  <td>{p.date}</td>
                  <td>{p.volume.toFixed(1)}</td>
                  <td>{p.sets}</td>
                  <td>{p.reps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
