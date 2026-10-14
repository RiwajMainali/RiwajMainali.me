export type SetLog = {
  weight: number;
  reps: number;
  rpe: number | null;
  warmup: boolean;
};
export const DEFAULT_RPE = 6;
export const isHardSet = (set: Pick<SetLog, 'rpe' | 'warmup'>) =>
  !set.warmup && (set.rpe ?? DEFAULT_RPE) >= 7;
export type DraftSet = Omit<SetLog, 'weight' | 'reps'> & {
  weight: number | null;
  reps: number | null;
};
export const unitLabel = (unit: 'lb' | 'kg') => (unit === 'lb' ? 'lbs' : 'kg');
export type CardioLog = {
  minutes: number | null;
  distance: number | null;
  distanceUnit: 'mi' | 'km';
  effort: number | null;
};
export const emptyCardio = (): CardioLog => ({
  minutes: null,
  distance: null,
  distanceUnit: 'mi',
  effort: null,
});
export const isCardioExercise = (e: Exercise) =>
  e.category === 'cardio' || e.bodyPart === 'cardio';
export const workoutMode = (d: Pick<Draft, 'mode'>, e: Exercise | null) =>
  d.mode ?? (e && isCardioExercise(e) ? 'cardio' : 'strength');
export function cardioPace(c: CardioLog) {
  if (!c.minutes || !c.distance) return null;
  const seconds = Math.round((c.minutes / c.distance) * 60);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(
    2,
    '0'
  )} / ${c.distanceUnit}`;
}
export function cardioSummary(c: CardioLog) {
  return `${c.minutes ?? '—'} min${
    c.distance === null ? '' : ` · ${c.distance} ${c.distanceUnit}`
  }${cardioPace(c) ? ` · ${cardioPace(c)}` : ''}${
    c.effort === null ? '' : ` · effort ${c.effort}/10`
  }`;
}
export type Draft = {
  mode?: 'strength' | 'cardio';
  cardio?: CardioLog;
  exerciseId: string;
  date: string;
  unit: 'lb' | 'kg';
  bodyweight: number | null;
  sets: DraftSet[];
  notes: string;
  mediaIds: string[];
  tier: 'auto' | 'novice' | 'intermediate' | 'advanced' | 'elite';
};
export type Exercise = {
  id: string;
  name: string;
  equipment: string;
  muscle: string;
  bodyPart: string;
  category: string;
};
export type Entry = Omit<Draft, 'sets'> & {
  sets: SetLog[];
  id: string;
  exercise: string;
  createdAt: string;
};
export type Attachment = {
  id: string;
  name: string;
  type: string;
  size: number;
};
export const emptyDraft = (): Draft => ({
  exerciseId: '',
  date: new Date().toISOString().slice(0, 10),
  unit: 'lb',
  bodyweight: null,
  sets: [{ weight: null, reps: 8, rpe: DEFAULT_RPE, warmup: false }],
  notes: '',
  mediaIds: [],
  tier: 'auto',
});
