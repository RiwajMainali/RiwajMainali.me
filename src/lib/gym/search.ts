import aliases from '../../data/gym-aliases.json';
import type { Exercise } from './types';
function plain(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9/]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
function rule(from: string, to: string): [RegExp, string] {
  return [
    new RegExp(
      `(^|\\s)${plain(from).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`,
      'g'
    ),
    `$1${to}`,
  ];
}
const shortMap = new Map([
  ...aliases.map((a) => [plain(a.alias), a.expansion] as const),
  ...aliases.map((a) => [plain(a.expansion), a.expansion] as const),
]);
const shortPattern = new RegExp(
  `(?<!\\S)(?:${[...shortMap.keys()]
    .sort((a, b) => b.length - a.length)
    .map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})(?!\\S)`,
  'g'
);
const wordRules: [RegExp, string][] = [
  rule('behind the neck', 'behind neck'),
  rule('behind the head', 'behind neck'),
  rule('behind head', 'behind neck'),
  rule('behind the back', 'behind back'),
  rule('rear foot elevated split squat', 'bulgarian split squat'),
  rule('military press', 'shoulder press'),
  rule('overhead press', 'shoulder press'),
  rule('lat pull down', 'pulldown'),
  rule('lat pulldown', 'pulldown'),
  rule('lateral pulldown', 'pulldown'),
  rule('pull down', 'pulldown'),
  rule('pull ups', 'pullup'),
  rule('pull up', 'pullup'),
  rule('push ups', 'pushup'),
  rule('push up', 'pushup'),
  rule('press ups', 'pushup'),
  rule('press up', 'pushup'),
  rule('chin ups', 'chinup'),
  rule('chin up', 'chinup'),
  rule('dead lift', 'deadlift'),
  rule('push down', 'pushdown'),
  rule('single arm', 'one arm'),
  rule('single hand', 'one arm'),
  rule('single leg', 'one leg'),
  rule('supinated grip', 'underhand grip'),
  rule('pronated grip', 'overhand grip'),
  rule('parallel grip', 'neutral grip'),
  rule('hamstring curl', 'leg curl'),
  rule('hamstrings curl', 'leg curl'),
  rule('rear delt fly', 'reverse fly'),
  rule('rear deltoid fly', 'reverse fly'),
  rule('skullcrusher', 'skull crusher'),
  rule('hyperextension', 'back extension'),
  rule('hyper extension', 'back extension'),
  rule('farmers walk', 'farmer carry'),
  rule('farmer s walk', 'farmer carry'),
  rule('farmers carry', 'farmer carry'),
  rule('farmer s carry', 'farmer carry'),
  rule('ez barbell', 'ez bar'),
  rule('bodyweight', 'body weight'),
  rule('dumbell', 'dumbbell'),
  rule('dumbbells', 'dumbbell'),
  rule('barbells', 'barbell'),
  rule('kettle bell', 'kettlebell'),
  rule('hipthrust', 'hip thrust'),
  rule('facepull', 'face pull'),
  rule('deadbug', 'dead bug'),
  rule('split squats', 'split squat'),
  ...[
    ['bicep', 'biceps'],
    ['tricep', 'triceps'],
    ['squats', 'squat'],
    ['presses', 'press'],
    ['rows', 'row'],
    ['curls', 'curl'],
    ['raises', 'raise'],
    ['extensions', 'extension'],
    ['pulldowns', 'pulldown'],
    ['lunges', 'lunge'],
    ['flies', 'fly'],
    ['flyes', 'fly'],
    ['calves', 'calf'],
  ].map(([a, b]) => rule(a!, b!)),
];
export function normalizeExerciseQuery(value: string) {
  let text = plain(value);
  text = text.replace(shortPattern, (alias) => shortMap.get(alias) ?? alias);
  for (const [pattern, replacement] of wordRules)
    text = text.replace(pattern, replacement);
  return text
    .replace(/\bbar bar\b/g, 'bar')
    .replace(/\b(?:the|with|and)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
// Ambiguous gym shorthand returns alternatives, never silently selects a lift.
export function queryVariants(query: string) {
  let variants = [plain(query)];
  for (const [short, expanded] of [
    ['pu', ['push up', 'pull up']],
    ['lp', ['leg press', 'lat pulldown']],
    ['pc', ['preacher curl', 'power clean']],
    ['hc', ['hammer curl', 'hang clean']],
    ['sc', ['skull crusher', 'squat clean']],
    ['sb', ['stability ball', 'sandbag', 'straight bar']],
  ] as const) {
    const re = new RegExp(`(^|\\s)${short}(?=\\s|$)`);
    variants = variants.flatMap((v) =>
      re.test(v)
        ? expanded.map((e) => v.replace(new RegExp(re.source, 'g'), `$1${e}`))
        : [v]
    );
  }
  return [...new Set(variants.map(normalizeExerciseQuery))];
}
export const exerciseIdentity = (e: Pick<Exercise, 'name' | 'equipment'>) =>
  [...new Set(normalizeExerciseQuery(e.name + ' ' + e.equipment).split(' '))]
    .sort()
    .join(' ');
type Indexed = { exercise: Exercise; name: string; words: Set<string> };
let shared: Indexed[] = [];
let sharedKey = '';
function index(exercise: Exercise): Indexed {
  const name = normalizeExerciseQuery(exercise.name);
  return {
    exercise,
    name,
    words: new Set(
      normalizeExerciseQuery(
        `${exercise.name} ${exercise.equipment} ${exercise.muscle}`
      ).split(' ')
    ),
  };
}
export type ExerciseUsage = {
  exerciseId: string;
  count: number;
  lastUsed: string;
};
export function searchExercises(
  exercises: Exercise[],
  query: string,
  equipment = '',
  offset = 0,
  usage: ExerciseUsage[] = [],
  demotedExerciseIds: string[] = []
) {
  const globals = exercises.filter((e) => e.id.startsWith('og-'));
  const key = globals.map((e) => e.id + '\0' + e.name).join('\n');
  if (sharedKey !== key) {
    sharedKey = key;
    shared = globals.map(index);
  }
  const docs = [
    ...shared,
    ...exercises.filter((e) => !e.id.startsWith('og-')).map(index),
  ];
  const variants = queryVariants(query);
  const matched = docs
    .flatMap((d) => {
      if (equipment && d.exercise.equipment !== equipment) return [];
      let best = -Infinity;
      for (const q of variants) {
        const tokens = q.split(' ').filter(Boolean);
        // All words must match, regardless of query order. Prefixes support typing.
        if (
          tokens.every((t) =>
            [...d.words].some((w) => w === t || w.startsWith(t))
          )
        ) {
          let score =
            tokens.filter((t) => d.name.split(' ').includes(t)).length * 10;
          if (d.name === q) score += 100;
          score -= d.name.split(' ').length;
          best = Math.max(best, score);
        }
      }
      return Number.isFinite(best)
        ? [{ exercise: d.exercise, score: best }]
        : [];
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.exercise.name.localeCompare(b.exercise.name) ||
        a.exercise.id.localeCompare(b.exercise.id)
    );
  const used = new Map(usage.map((u) => [u.exerciseId, u]));
  const demoted = new Set(demotedExerciseIds);
  // Keep demoted lifts visible in the other tier; otherwise familiar lifts lead.
  matched.sort((a, b) => {
    const ad = demoted.has(a.exercise.id),
      bd = demoted.has(b.exercise.id);
    if (ad !== bd) return ad ? -1 : 1;
    const au = used.get(a.exercise.id),
      bu = used.get(b.exercise.id);
    if (!!au !== !!bu) return au ? -1 : 1;
    if (au && bu)
      return (
        bu.lastUsed.localeCompare(au.lastUsed) ||
        bu.count - au.count ||
        b.score - a.score
      );
    return b.score - a.score || a.exercise.name.localeCompare(b.exercise.name);
  });
  const suggested: (Exercise & { reason: string })[] = [];
  const selected = new Set<string>();
  const gears = new Set<string>();
  for (const m of matched
    .filter((m) => used.has(m.exercise.id) && !demoted.has(m.exercise.id))
    .slice(0, 3)) {
    suggested.push({ ...m.exercise, reason: 'Previously logged' });
    selected.add(m.exercise.id);
    gears.add(m.exercise.equipment);
  }
  const standard = [...matched]
    .filter((m) => !selected.has(m.exercise.id) && !demoted.has(m.exercise.id))
    .sort(
      (a, b) =>
        b.score - a.score || a.exercise.name.localeCompare(b.exercise.name)
    );
  for (const m of standard) {
    if (suggested.length >= 6) break;
    if (gears.has(m.exercise.equipment)) continue;
    // Common free weights, cables and machines lead; specialist kit stays below.
    if (
      ![
        'barbell',
        'dumbbell',
        'cable',
        'leverage machine',
        'smith machine',
        'body weight',
        'kettlebell',
      ].includes(m.exercise.equipment)
    )
      continue;
    suggested.push({ ...m.exercise, reason: 'Standard variation' });
    selected.add(m.exercise.id);
    gears.add(m.exercise.equipment);
  }
  if (!suggested.length && standard[0])
    suggested.push({ ...standard[0].exercise, reason: 'Closest variation' });
  return {
    exercises: matched.slice(offset, offset + 50).map((x) => x.exercise),
    suggested,
    total: matched.length,
    hasMore: offset + 50 < matched.length,
    normalizedQueries: variants,
    aliasCount: aliases.length,
  };
}
