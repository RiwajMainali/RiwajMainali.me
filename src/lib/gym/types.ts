export type SetLog = {
  weight: number;
  reps: number;
  rpe: number | null;
  warmup: boolean;
};
export type DraftSet = Omit<SetLog, 'weight' | 'reps'> & {
  weight: number | null;
  reps: number | null;
};
export const unitLabel = (unit: 'lb' | 'kg') => (unit === 'lb' ? 'lbs' : 'kg');
export type Draft = {
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
  sets: [{ weight: null, reps: 8, rpe: null, warmup: false }],
  notes: '',
  mediaIds: [],
  tier: 'auto',
});
