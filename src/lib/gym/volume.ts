import type { Entry } from './types';
import { isHardSet } from './types';
import { kg } from './progress';
export type VolumeRow = {
  date: string;
  exerciseId: string;
  exercise: string;
  muscle: string;
  volume: number;
  sets: number;
  reps: number;
};
const muscleNames: Record<string, string> = {
  pectorals: 'Chest',
  delts: 'Shoulders',
  quads: 'Quadriceps',
  abs: 'Abs',
  lats: 'Lats',
  glutes: 'Glutes',
  biceps: 'Biceps',
  triceps: 'Triceps',
  calves: 'Calves',
  hamstrings: 'Hamstrings',
  forearms: 'Forearms',
  spine: 'Lower back',
  'upper back': 'Upper back',
  traps: 'Traps',
  abductors: 'Abductors',
  adductors: 'Adductors',
};
export function muscleGroup(muscle: string) {
  const key = muscle.trim().toLowerCase();
  return (
    muscleNames[key] ??
    (key ? key[0]!.toUpperCase() + key.slice(1) : 'Unspecified')
  );
}
export function volumeRows(
  entries: (Entry & { muscle: string; category?: string })[]
): VolumeRow[] {
  const rows = new Map<string, VolumeRow>();
  for (const e of entries) {
    if (e.mode === 'cardio' || (!e.mode && e.category === 'cardio')) continue;
    const working = e.sets;
    if (!working.length) continue;
    const key = JSON.stringify([e.date, e.exerciseId]);
    const row = rows.get(key) ?? {
      date: e.date,
      exerciseId: e.exerciseId,
      exercise: e.exercise,
      muscle: muscleGroup(e.muscle),
      volume: 0,
      sets: 0,
      reps: 0,
    };
    for (const s of working.filter(isHardSet)) {
      row.volume += kg(s.weight, e.unit) * s.reps;
      row.sets++;
      row.reps += s.reps;
    }
    rows.set(key, row);
  }
  return [...rows.values()].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.exercise.localeCompare(b.exercise) ||
      a.exerciseId.localeCompare(b.exerciseId)
  );
}
export function dailyVolume(
  rows: VolumeRow[],
  scope: 'exercise' | 'day' | 'muscle',
  filter: string
) {
  const days = new Map<
    string,
    { date: string; volume: number; sets: number; reps: number }
  >();
  for (const row of rows) {
    if (
      (scope === 'exercise' && row.exerciseId !== filter) ||
      (scope === 'muscle' && row.muscle !== filter)
    )
      continue;
    const day = days.get(row.date) ?? {
      date: row.date,
      volume: 0,
      sets: 0,
      reps: 0,
    };
    day.volume += row.volume;
    day.sets += row.sets;
    day.reps += row.reps;
    days.set(row.date, day);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export type ScoreMuscle = {
  muscle: string;
  coefficient: number;
  completion: number;
  rirDecay: number;
};
export type SetScore = {
  date: string;
  entryId: string;
  exerciseId: string;
  exercise: string;
  setNumber: number;
  reps: number;
  load: number;
  unit: string;
  rir: number | null;
  rirSource: 'logged_rir' | 'rpe_converted' | 'exercise_median' | 'missing';
  completionRatio: number | null;
  completionScore: number | null;
  rirDecayScore: number | null;
  ignored: 'warmup' | 'zero_reps' | 'missing_rir' | null;
  muscles: ScoreMuscle[];
};
export type EffectivePoint = {
  date: string;
  muscle: string;
  score: number;
  sets: number;
  missingRir: number;
};
export function effectiveDaily(
  scores: SetScore[],
  model: 'completion' | 'rir_decay',
  options: {
    exerciseId?: string;
    muscle?: string;
    exponent?: number;
    floor?: number;
    halveAfterTen?: boolean;
  } = {}
) {
  const bySession = new Map<string, SetScore[]>();
  for (const s of scores) {
    if (options.exerciseId && s.exerciseId !== options.exerciseId) continue;
    if (s.ignored || s.reps <= 0) continue;
    bySession.set(s.date, [...(bySession.get(s.date) ?? []), s]);
  }
  const result = new Map<string, EffectivePoint>();
  for (const [date, sets] of bySession) {
    const contributions = new Map<string, number[]>();
    for (const set of sets)
      for (const m of set.muscles) {
        if (options.muscle && m.muscle !== options.muscle) continue;
        const raw =
          model === 'completion'
            ? set.completionRatio === null
              ? 0
              : Math.pow(set.completionRatio, options.exponent ?? 1)
            : set.rirDecayScore ?? 0;
        const score =
          model === 'completion' &&
          options.floor !== undefined &&
          set.completionRatio !== null &&
          set.completionRatio < options.floor
            ? 0
            : raw * m.coefficient;
        contributions.set(m.muscle, [
          ...(contributions.get(m.muscle) ?? []),
          score,
        ]);
      }
    for (const [muscle, values] of contributions) {
      let remaining = options.halveAfterTen ? 10 : Infinity,
        total = 0;
      for (const n of values) {
        const full = Math.min(remaining, n);
        total += full + Math.max(0, n - full) * 0.5;
        remaining -= full;
      }
      const key = JSON.stringify([date, muscle]);
      const row = result.get(key) ?? {
        date,
        muscle,
        score: 0,
        sets: 0,
        missingRir: 0,
      };
      row.score += total;
      row.sets += values.length;
      result.set(key, row);
    }
  }
  return [...result.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.muscle.localeCompare(b.muscle)
  );
}
export function rollingSevenDays(points: EffectivePoint[], muscle: string) {
  const byDate = new Map<string, number>();
  for (const p of points)
    if (!muscle || p.muscle === muscle)
      byDate.set(p.date, (byDate.get(p.date) ?? 0) + p.score);
  return [...byDate.keys()].sort().map((date) => {
    const end = Date.parse(date + 'T00:00:00Z');
    let score = 0;
    for (const [day, value] of byDate) {
      const age = (end - Date.parse(day + 'T00:00:00Z')) / 86400000;
      if (age >= 0 && age < 7) score += value;
    }
    return { date, score };
  });
}
