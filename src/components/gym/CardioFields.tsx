import { cardioPace, type CardioLog } from '../../lib/gym/types';
export default function CardioFields({
  value,
  onChange,
}: {
  value: CardioLog;
  onChange: (value: CardioLog) => void;
}) {
  return (
    <>
      <div className="gym-fields">
        <label>
          Duration (minutes)
          <input
            type="number"
            inputMode="decimal"
            min="0.01"
            max="10080"
            step="any"
            required
            value={value.minutes ?? ''}
            onChange={(e) =>
              onChange({
                ...value,
                minutes: e.target.value === '' ? null : Number(e.target.value),
              })
            }
          />
        </label>
        <label>
          Distance (optional)
          <input
            type="number"
            inputMode="decimal"
            min="0.001"
            max="10000"
            step="any"
            value={value.distance ?? ''}
            onChange={(e) =>
              onChange({
                ...value,
                distance: e.target.value === '' ? null : Number(e.target.value),
              })
            }
          />
        </label>
        <label>
          Distance units
          <select
            value={value.distanceUnit}
            onChange={(e) => {
              const unit = e.target.value as 'mi' | 'km';
              onChange({
                ...value,
                distanceUnit: unit,
                distance:
                  value.distance === null
                    ? null
                    : Math.round(
                        value.distance *
                          (unit === 'km' ? 1.609344 : 1 / 1.609344) *
                          1000
                      ) / 1000,
              });
            }}
          >
            <option value="mi">Miles</option>
            <option value="km">Kilometers</option>
          </select>
        </label>
        <label>
          Effort (optional, 1–10)
          <input
            type="number"
            inputMode="decimal"
            min="1"
            max="10"
            step="0.5"
            value={value.effort ?? ''}
            onChange={(e) =>
              onChange({
                ...value,
                effort: e.target.value === '' ? null : Number(e.target.value),
              })
            }
          />
        </label>
      </div>
      <p className="gym-muted">
        Duration is all you need. Effort: 1 = very easy, 10 = maximum effort.
        Add distance to see average pace.
      </p>
      {cardioPace(value) && <p>Average pace: {cardioPace(value)}</p>}
    </>
  );
}
