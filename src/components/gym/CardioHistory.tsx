import { useState } from 'react';
import type { Entry } from '../../lib/gym/types';
export default function CardioHistory({ entries }: { entries: Entry[] }) {
  const [metric, setMetric] = useState<'minutes' | 'distance'>('minutes');
  const [unit, setUnit] = useState<'mi' | 'km'>('mi');
  const dates = new Map<string, number>();
  for (const e of entries) {
    if (e.mode !== 'cardio' || !e.cardio) continue;
    const c = e.cardio;
    const value =
      metric === 'minutes'
        ? c.minutes
        : c.distance === null
        ? null
        : c.distance *
          (c.distanceUnit === unit
            ? 1
            : unit === 'km'
            ? 1.609344
            : 1 / 1.609344);
    if (value !== null) dates.set(e.date, (dates.get(e.date) ?? 0) + value);
  }
  const points = [...dates]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));
  const start = Date.parse(points[0]?.date ?? '2026-01-01'),
    end = Date.parse(points[points.length - 1]?.date ?? '2026-01-02');
  const max = Math.max(1, ...points.map((p) => p.value)) * 1.1;
  const xy = (p: { date: string; value: number }) =>
    `${
      55 +
      ((Date.parse(p.date) - start) / Math.max(86400000, end - start)) * 610
    },${190 - (p.value / max) * 155}`;
  return (
    <section className="gym-card">
      <h2>Cardio history</h2>
      <div className="gym-fields">
        <label>
          Metric
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as typeof metric)}
          >
            <option value="minutes">Duration (minutes)</option>
            <option value="distance">Distance</option>
          </select>
        </label>
        {metric === 'distance' && (
          <label>
            Distance units
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as typeof unit)}
            >
              <option value="mi">Miles</option>
              <option value="km">Kilometers</option>
            </select>
          </label>
        )}
      </div>
      <p className="gym-muted">
        Daily totals for this exercise in{' '}
        {metric === 'minutes' ? 'minutes' : unit}. Sessions without distance are
        excluded from distance totals.
      </p>
      {!points.length ? (
        <p>
          No cardio history for this metric yet. Older lifting-style entries
          remain below.
        </p>
      ) : (
        <>
          <svg
            viewBox="0 0 700 235"
            role="img"
            aria-label={`Cardio ${metric} history`}
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
                    {p.date}: {p.value.toFixed(2)}
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
          <details>
            <summary>View chart data</summary>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>{metric === 'minutes' ? 'Minutes' : unit}</th>
                </tr>
              </thead>
              <tbody>
                {points.map((p) => (
                  <tr key={p.date}>
                    <td>{p.date}</td>
                    <td>{p.value.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}
