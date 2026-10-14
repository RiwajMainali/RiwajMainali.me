import type { Entry, Exercise, SetLog } from './types';
import { setRir } from './types';
const DAY = 86400000;
export const kg = (weight: number, unit: string) =>
  unit === 'lb' ? weight * 0.45359237 : weight;
// Inverse of the existing Epley estimate; preserve the measured-single convention.
export function predictedRepMax(oneRepMax: number, reps: number) {
  if (!Number.isInteger(reps) || reps < 1 || reps > 15)
    throw new RangeError('Prediction reps must be an integer from 1 to 15');
  return reps === 1 ? oneRepMax : oneRepMax / (1 + reps / 30);
}
export function estimatedMax(set: SetLog) {
  if (set.warmup || set.weight <= 0 || set.reps < 1 || set.reps > 12)
    return null;
  // Actual single reps are already a measured max; never inflate them.
  return set.reps === 1 ? set.weight : set.weight * (1 + set.reps / 30);
}
export function historyPoints(entries: Entry[]) {
  const dates = new Map<
    string,
    {
      date: string;
      max: number | null;
      volume: number;
      reps: number;
      load: number;
    }
  >();
  for (const e of entries) {
    if (e.mode === 'cardio') continue;
    const point = dates.get(e.date) ?? {
      date: e.date,
      max: null,
      volume: 0,
      reps: 0,
      load: 0,
    };
    for (const s of e.sets.filter((s) => !s.warmup)) {
      const weight = kg(s.weight, e.unit),
        max = estimatedMax({ ...s, weight });
      if (max !== null) point.max = Math.max(point.max ?? 0, max);
      point.volume += weight * s.reps;
      point.reps += s.reps;
      point.load = Math.max(point.load, weight);
    }
    dates.set(e.date, point);
  }
  return [...dates.values()].sort((a, b) => a.date.localeCompare(b.date));
}
export function progression(
  entries: Entry[],
  exercise: Exercise,
  override = 'auto'
) {
  entries = entries.filter((e) => e.mode !== 'cardio');
  const points = historyPoints(entries);
  const last = [...entries].sort(
    (a, b) =>
      b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
  )[0];
  const comparable = points.filter((p) => p.max !== null);
  const span =
    comparable.length > 1
      ? (Date.parse(comparable[comparable.length - 1]!.date) -
          Date.parse(comparable[0]!.date)) /
        DAY
      : 0;
  const best = last?.sets
    .filter((s) => !s.warmup)
    .sort((a, b) => b.weight - a.weight || b.reps - a.reps)[0];
  const bodyweight = last?.bodyweight ? kg(last.bodyweight, last.unit) : null;
  const max = comparable[comparable.length - 1]?.max ?? null;
  const ratio = max && bodyweight ? max / bodyweight : null;
  // Only rough reference bands for unambiguous free-barbell lifts. Machine stacks,
  // dumbbell conventions, assisted and bodyweight movements are not comparable.
  const name = exercise.name.toLowerCase();
  let bands: number[] | null = null;
  if (exercise.equipment === 'barbell') {
    if (/^barbell bench press$/.test(name)) bands = [0.75, 1.25, 1.75];
    if (/^barbell (back |full )?squat$/.test(name)) bands = [1, 1.75, 2.5];
    if (/^barbell deadlift$/.test(name)) bands = [1.25, 2, 3];
    if (
      /^barbell (standing military press|standing overhead press)$/.test(name)
    )
      bands = [0.5, 0.8, 1.1];
  }
  const referenceTier =
    bands && ratio
      ? ['novice', 'intermediate', 'advanced', 'elite'][
          bands.filter((x) => ratio >= x).length
        ]!
      : null;
  const tier = override !== 'auto' ? override : referenceTier;
  const base = {
    points,
    tier,
    referenceTier,
    ratio,
    span,
    sessions: comparable.length,
    nextReps: null as number | null,
    nextWeight: best?.weight ?? null,
    unit: last?.unit ?? 'lb',
    weeklyPercent: null as number | null,
    forecast: [] as { date: string; max: number }[],
  };
  if (!best)
    return {
      ...base,
      message: 'Log this exercise to build your own baseline.',
    };
  if (/assisted/.test(name) || exercise.equipment === 'assisted')
    return {
      ...base,
      message:
        'Assistance is not lifted load. History is available; automated load forecasts are disabled.',
    };
  if (span < 14 || comparable.length < 3)
    return {
      ...base,
      message: `Building your baseline: ${
        comparable.length
      }/3 comparable training days, ${Math.floor(
        span
      )}/14 days. Forecasts need both. Sets above 12 reps stay in history but are excluded from estimated 1RM trends.`,
    };
  // Recent, date-aggregated Theil–Sen slope limits the influence of one outlier/PR.
  const recent = comparable.slice(-12),
    origin = Date.parse(recent[0]!.date);
  const slopes: number[] = [];
  for (let i = 0; i < recent.length; i++)
    for (let j = i + 1; j < recent.length; j++) {
      const days =
        (Date.parse(recent[j]!.date) - Date.parse(recent[i]!.date)) / DAY;
      if (days > 0) slopes.push((recent[j]!.max! - recent[i]!.max!) / days);
    }
  slopes.sort((a, b) => a - b);
  const median =
    slopes.length % 2
      ? slopes[Math.floor(slopes.length / 2)]!
      : (slopes[slopes.length / 2 - 1]! + slopes[slopes.length / 2]!) / 2;
  const intercepts = recent
    .map((p) => p.max! - (median * (Date.parse(p.date) - origin)) / DAY)
    .sort((a, b) => a - b);
  const intercept = intercepts[Math.floor(intercepts.length / 2)]!;
  const residuals = recent
    .map((p) =>
      Math.abs(
        p.max! - intercept - (median * (Date.parse(p.date) - origin)) / DAY
      )
    )
    .sort((a, b) => a - b);
  const scatter = residuals[Math.floor(residuals.length / 2)]! / max!;
  const weeklyPercent = ((median * 7) / max!) * 100;
  if (scatter > 0.12)
    return {
      ...base,
      weeklyPercent,
      message:
        'Recent sessions vary too much for a useful forecast. Keep exercise setup, range of motion and load convention consistent.',
    };
  const bestRir = setRir(best);
  const effortKnown = bestRir !== null;
  const mayAdd = median > 0 && effortKnown && bestRir! >= 2 && best.reps < 12;
  const nextReps = best.reps + (mayAdd ? 1 : 0);
  const forecast = [7, 14].map((days) => ({
    date: new Date(Date.parse(recent[recent.length - 1]!.date) + days * DAY)
      .toISOString()
      .slice(0, 10),
    max: Math.max(0, max! + median * days),
  }));
  return {
    ...base,
    weeklyPercent,
    nextReps,
    forecast,
    message: mayAdd
      ? 'Try one extra rep at the same load. Your recent trend is rising and your last recorded effort leaves room. This is a suggestion, not a required target.'
      : !effortKnown
      ? 'Repeat the last rep target and log RPE before increasing it automatically.'
      : 'Repeat your last target. Your recent progress or effort does not support an automatic increase. Consider recovery and technique before adding load.',
  };
}
