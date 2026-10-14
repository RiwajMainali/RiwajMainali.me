import { useState } from 'react';
import type { Entry } from '../../lib/gym/types';
import { unitLabel } from '../../lib/gym/types';
import { historyPoints } from '../../lib/gym/progress';
export default function HistoryChart({
  entries,
  forecast,
  unit,
}: {
  entries: Entry[];
  forecast: { date: string; max: number }[];
  unit: 'lb' | 'kg';
}) {
  const [metric, setMetric] = useState<'max' | 'load' | 'volume' | 'reps'>(
    'max'
  );
  const factor = unit === 'lb' ? 1 / 0.45359237 : 1;
  const points = historyPoints(entries)
    .filter((p) => p[metric] !== null)
    .map((p) => ({
      date: p.date,
      value: p[metric]! * (metric === 'reps' ? 1 : factor),
      forecast: false,
    }));
  const future =
    metric === 'max' && points.length
      ? forecast.map((p) => ({
          date: p.date,
          value: p.max * factor,
          forecast: true,
        }))
      : [];
  const all = [...points, ...future];
  const minDate = Date.parse(all[0]?.date ?? '2026-01-01'),
    maxDate = Date.parse(all[all.length - 1]?.date ?? '2026-01-02');
  const maxValue = Math.max(1, ...all.map((p) => p.value)) * 1.1;
  const xy = (p: { date: string; value: number }) =>
    `${
      55 +
      ((Date.parse(p.date) - minDate) / Math.max(86400000, maxDate - minDate)) *
        610
    },${190 - (p.value / maxValue) * 155}`;
  return (
    <section className="gym-card">
      <div className="gym-row">
        <h2>Lift history</h2>
        <label>
          Metric
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as typeof metric)}
          >
            <option value="max">Estimated 1RM</option>
            <option value="load">Heaviest load</option>
            <option value="volume">Volume</option>
            <option value="reps">Total working reps</option>
          </select>
        </label>
      </div>
      <p className="gym-muted">
        {metric === 'max'
          ? 'Epley estimate from working sets of 1–12 reps; higher-rep sets are excluded.'
          : metric === 'volume'
          ? `Working-set load × reps (${unitLabel(
              unit
            )}·reps). Bodyweight itself is not added.`
          : `Working sets only. ${
              metric === 'reps' ? '' : `Load in ${unitLabel(unit)}.`
            }`}
      </p>
      {points.length === 0 ? (
        <p>No comparable history for this metric yet.</p>
      ) : (
        <>
          <svg
            viewBox="0 0 700 235"
            role="img"
            aria-label={`${metric} history, with dashed projections when available`}
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
                <text
                  x="48"
                  y={194 - 155 * f}
                  textAnchor="end"
                  fontSize="12"
                  fill="#555"
                >
                  {Math.round(maxValue * f)}
                </text>
              </g>
            ))}
            <polyline
              points={points.map(xy).join(' ')}
              fill="none"
              stroke="#225d47"
              strokeWidth="2"
            />
            {future.length > 0 && (
              <polyline
                points={[points[points.length - 1]!, ...future]
                  .map(xy)
                  .join(' ')}
                fill="none"
                stroke="#6b7b73"
                strokeWidth="2"
                strokeDasharray="6 5"
              />
            )}
            {points.map((p, i) => {
              const [cx, cy] = xy(p).split(',');
              return (
                <circle key={p.date} cx={cx} cy={cy} r="4" fill="#225d47">
                  <title>
                    {p.date}: {p.value.toFixed(1)}
                  </title>
                </circle>
              );
            })}
            <text x="55" y="220" fontSize="12" fill="#555">
              {points[0]!.date}
            </text>
            <text x="665" y="220" textAnchor="end" fontSize="12" fill="#555">
              {all[all.length - 1]!.date}
            </text>
          </svg>
          <details>
            <summary>View chart data</summary>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>{metric}</th>
                </tr>
              </thead>
              <tbody>
                {all.map((p) => (
                  <tr key={p.date}>
                    <td>
                      {p.date}
                      {p.forecast ? ' (projection)' : ''}
                    </td>
                    <td>{p.value.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
      {future.length > 0 && (
        <p className="gym-muted">
          Dashed line: short-term projection from your recent rate, not a
          promise.
        </p>
      )}
    </section>
  );
}
