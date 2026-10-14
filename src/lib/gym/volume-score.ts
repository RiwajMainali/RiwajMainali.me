import muscleTable from '../../data/gym-muscles.json';
import { muscleGroup, type SetScore } from './volume';
import { setRir, type Entry } from './types';
import { kg } from './progress';
type ScoredEntry = Entry & {
  muscle: string;
  category?: string;
  equipment: string;
};
type Attribution = { primary: string; secondary: string[] };
const attributions = muscleTable as Record<string, Attribution>;
export function muscleCoefficients(id: string, primaryFallback: string) {
  const row = attributions[id];
  const primary = muscleGroup(row?.primary ?? primaryFallback);
  return [
    { muscle: primary, coefficient: 1 },
    ...(row?.secondary ?? [])
      .map((muscle) => ({ muscle: muscleGroup(muscle), coefficient: 0.5 }))
      .filter((m) => m.muscle !== primary),
  ];
}
export function scoreSets(entries: ScoredEntry[]): SetScore[] {
  const known = new Map<string, number[]>();
  for (const e of entries) {
    if (e.mode === 'cardio' || (!e.mode && e.category === 'cardio')) continue;
    for (const s of e.sets) {
      if (s.warmup || s.reps <= 0) continue;
      const rir = setRir(s);
      if (rir !== null)
        known.set(e.exerciseId, [...(known.get(e.exerciseId) ?? []), rir]);
    }
  }
  const medians = new Map<string, number>();
  for (const [id, values] of known) {
    values.sort((a, b) => a - b);
    const mid = Math.floor(values.length / 2);
    medians.set(
      id,
      values.length % 2 ? values[mid]! : (values[mid - 1]! + values[mid]!) / 2
    );
  }
  const output: SetScore[] = [];
  for (const e of entries) {
    if (e.mode === 'cardio' || (!e.mode && e.category === 'cardio')) continue;
    const muscles = muscleCoefficients(e.exerciseId, e.muscle);
    e.sets.forEach((s, i) => {
      const logged = setRir(s),
        median = medians.get(e.exerciseId) ?? null,
        rir = logged ?? median;
      const rirSource =
        logged !== null
          ? s.rir !== undefined && s.rir !== null
            ? 'logged_rir'
            : 'rpe_converted'
          : median !== null
          ? 'exercise_median'
          : 'missing';
      const ignored = s.warmup
        ? 'warmup'
        : s.reps === 0
        ? 'zero_reps'
        : rir === null
        ? 'missing_rir'
        : null;
      const p = ignored || rir === null ? null : s.reps / (s.reps + rir);
      const completion = p === null ? null : p;
      const decay = ignored || rir === null ? null : Math.pow(0.9, rir);
      output.push({
        date: e.date,
        entryId: e.id,
        exerciseId: e.exerciseId,
        exercise: e.exercise,
        setNumber: i + 1,
        reps: s.reps,
        load: s.weight,
        unit: e.unit,
        rir,
        rirSource,
        completionRatio: p,
        completionScore: completion,
        rirDecayScore: decay,
        ignored,
        muscles: muscles.map((m) => ({
          muscle: m.muscle,
          coefficient: m.coefficient,
          completion: (completion ?? 0) * m.coefficient,
          rirDecay: (decay ?? 0) * m.coefficient,
        })),
      });
    });
  }
  return output;
}
export function compareVolumeToE1rm(
  entries: ScoredEntry[],
  scores: SetScore[]
) {
  const rows: {
    exercise: string;
    weeks: number;
    effectiveCorrelation: number;
    rirDecayCorrelation: number;
  }[] = [];
  const lifts = entries.filter(
    (e) =>
      e.equipment === 'barbell' &&
      /(bench press|squat|deadlift|overhead press|military press)/i.test(
        e.exercise
      )
  );
  for (const exerciseId of new Set(lifts.map((e) => e.exerciseId))) {
    const primaryMuscle = scores
      .find((s) => s.exerciseId === exerciseId)
      ?.muscles.find((m) => m.coefficient === 1)?.muscle;
    const byWeek = new Map<
      number,
      { max: number; effective: number; decay: number }
    >();
    for (const e of lifts.filter((x) => x.exerciseId === exerciseId)) {
      const week = Math.floor(Date.parse(e.date + 'T00:00:00Z') / 604800000);
      const row = byWeek.get(week) ?? { max: 0, effective: 0, decay: 0 };
      for (const s of e.sets) {
        if (!s.warmup && s.reps > 0 && s.reps <= 12 && s.weight > 0)
          row.max = Math.max(
            row.max,
            kg(s.reps === 1 ? s.weight : s.weight * (1 + s.reps / 30), e.unit)
          );
      }
      byWeek.set(week, row);
    }
    for (const s of scores) {
      if (s.ignored) continue;
      const week = Math.floor(Date.parse(s.date + 'T00:00:00Z') / 604800000);
      const row = byWeek.get(week);
      const muscle = s.muscles.find((m) => m.muscle === primaryMuscle);
      if (row && muscle) {
        row.effective += muscle.completion;
        row.decay += muscle.rirDecay;
      }
    }
    const ordered = [...byWeek].sort((a, b) => a[0] - b[0]);
    if (
      ordered.length < 9 ||
      ordered[ordered.length - 1]![0] - ordered[0]![0] < 8
    )
      continue;
    const pairs = ordered.slice(0, -1).flatMap(([week, before]) => {
      const after = byWeek.get(week + 1);
      return after && after.max > 0 ? [{ before, after }] : [];
    });
    if (pairs.length < 8) continue;
    const ys = pairs.map((pair) => pair.after.max);
    const corr = (key: 'effective' | 'decay') => {
      const x = pairs.map((pair) => pair.before[key]),
        mx = x.reduce((a, b) => a + b, 0) / x.length,
        my = ys.reduce((a, b) => a + b, 0) / ys.length;
      const cov = x.reduce((n, v, i) => n + (v - mx) * (ys[i]! - my), 0),
        dx = Math.sqrt(x.reduce((n, v) => n + (v - mx) ** 2, 0)),
        dy = Math.sqrt(ys.reduce((n, v) => n + (v - my) ** 2, 0));
      return dx && dy ? cov / (dx * dy) : 0;
    };
    rows.push({
      exercise: lifts.find((e) => e.exerciseId === exerciseId)!.exercise,
      weeks: ordered.length,
      effectiveCorrelation: corr('effective'),
      rirDecayCorrelation: corr('decay'),
    });
  }
  return rows;
}
