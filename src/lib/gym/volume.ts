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
