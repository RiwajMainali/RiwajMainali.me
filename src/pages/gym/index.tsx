import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/gym/client';
import type {
  Attachment,
  Entry,
  Exercise,
  DraftSet,
} from '../../lib/gym/types';
import {
  unitLabel,
  DEFAULT_RPE,
  isHardSet,
  emptyCardio,
  workoutMode,
  isCardioExercise,
  cardioSummary,
} from '../../lib/gym/types';
import { progression } from '../../lib/gym/progress';
import { useSyncedDraft } from '../../components/gym/useSyncedDraft';
import HistoryChart from '../../components/gym/HistoryChart';
import CardioFields from '../../components/gym/CardioFields';
import CardioHistory from '../../components/gym/CardioHistory';
import VolumeHistory from '../../components/gym/VolumeHistory';
type User = { id: string; name: string; status: string; owner: boolean };
type Library = {
  suggested?: (Exercise & { reason: string })[];
  normalizedQueries?: string[];
  aliasCount?: number;
  exercises: Exercise[];
  equipments: string[];
  total: number;
  hasMore: boolean;
};
export default function Gym() {
  const [user, setUser] = useState<User | null>(null),
    [checked, setChecked] = useState(false),
    [error, setError] = useState('');
  const [historyView, setHistoryView] = useState('volume');
  const [tab, setTab] = useState('History'),
    [query, setQuery] = useState(''),
    [equipment, setEquipment] = useState(''),
    [offset, setOffset] = useState(0);
  const [library, setLibrary] = useState<Library>({
    exercises: [],
    equipments: [],
    total: 0,
    hasMore: false,
  });
  const [selected, setSelected] = useState<Exercise | null>(null),
    [history, setHistory] = useState<Entry[]>([]),
    [recent, setRecent] = useState<Entry[]>([]);
  const [media, setMedia] = useState<Attachment[]>([]),
    [busy, setBusy] = useState(false),
    [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState(''),
    [searchError, setSearchError] = useState('');
  const [pairCode, setPairCode] = useState(''),
    [email, setEmail] = useState(''),
    [name, setName] = useState(''),
    [redeem, setRedeem] = useState('');
  const [custom, setCustom] = useState({
      name: '',
      equipment: 'dumbbell',
      muscle: '',
      category: 'strength',
    }),
    [message, setMessage] = useState('');
  const [members, setMembers] = useState<
    { id: string; name: string; email: string; status: string }[]
  >([]);
  const enabled = user?.status === 'approved';
  const draftSync = useSyncedDraft(enabled);
  const { draft, change } = draftSync;
  const cardioMode = workoutMode(draft, selected) === 'cardio';
  const pendingSave = useRef<{
    id: string;
    revision: number;
    draft: string;
  } | null>(null);
  const advice = useMemo(
    () =>
      !cardioMode && selected?.id === draft.exerciseId
        ? progression(history, selected, draft.tier)
        : null,
    [history, selected, draft.tier, cardioMode]
  );
  async function session() {
    try {
      const r = await api<{ user: User | null }>('session');
      setUser(r.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecked(true);
    }
  }
  useEffect(() => {
    void session();
  }, []);
  useEffect(() => {
    if (user?.status !== 'pending') return;
    const t = setInterval(() => {
      void session();
    }, 10000);
    return () => clearInterval(t);
  }, [user?.status]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearchError('');
      void fetch(
        `/api/gym/exercises?q=${encodeURIComponent(
          query
        )}&equipment=${encodeURIComponent(equipment)}&offset=${offset}`,
        { signal: controller.signal }
      )
        .then(async (r) => {
          const data = (await r.json()) as Library & { error?: string };
          if (!r.ok) throw new Error(data.error);
          setLibrary(data);
        })
        .catch((e) => {
          if ((e as Error).name !== 'AbortError')
            setSearchError((e as Error).message);
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, query, equipment, offset, recent]);
  async function loadRecent() {
    const r = await api<{ entries: Entry[] }>('entries');
    setRecent(r.entries);
  }
  async function loadMedia() {
    const r = await api<{ media: Attachment[] }>('media');
    setMedia(r.media);
  }
  useEffect(() => {
    if (enabled)
      void Promise.all([loadRecent(), loadMedia()]).catch((e) =>
        setError((e as Error).message)
      );
  }, [enabled]);
  useEffect(() => {
    if (!enabled || !draft.exerciseId) {
      setSelected(null);
      setHistory([]);
      return;
    }
    let cancelled = false;
    setHistoryBusy(true);
    setHistoryError('');
    setHistory([]);
    void (async () => {
      const { exercise } = await api<{ exercise: Exercise }>(
        `exercise?id=${encodeURIComponent(draft.exerciseId)}`
      );
      const rows: Entry[] = [];
      let n = 0,
        more = true;
      while (more) {
        const r = await api<{ entries: Entry[]; hasMore: boolean }>(
          `entries?exerciseId=${encodeURIComponent(exercise.id)}&offset=${n}`
        );
        rows.push(...r.entries);
        n += r.entries.length;
        more = r.hasMore;
        if (cancelled) return;
      }
      if (!cancelled) {
        setSelected(exercise);
        setHistory(rows);
      }
    })()
      .catch((e) => {
        if (!cancelled) setHistoryError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setHistoryBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, draft.exerciseId, recent]);
  async function act(fn: () => Promise<void>) {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function updateSet(index: number, update: Partial<DraftSet>) {
    change((d) => ({
      ...d,
      sets: d.sets.map((s, i) => (i === index ? { ...s, ...update } : s)),
    }));
  }
  async function save() {
    if (!pendingSave.current) {
      await draftSync.sync();
      pendingSave.current = {
        id: crypto.randomUUID(),
        revision: draftSync.revision(),
        draft: JSON.stringify(draftSync.currentDraft()),
      };
    }
    const attempt = pendingSave.current;
    try {
      await api('entries', 'POST', {
        id: attempt.id,
        revision: attempt.revision,
      });
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status && status < 500) pendingSave.current = null;
      throw error;
    }
    pendingSave.current = null;
    if (JSON.stringify(draftSync.currentDraft()) === attempt.draft) {
      await draftSync.reload();
      setMessage('Workout saved to history.');
    } else {
      setMessage(
        'Earlier save confirmed. Your newer edits are still in this draft; resolve any sync conflict before saving them as another workout.'
      );
    }
    await loadRecent();
  }
  async function upload(file: File) {
    if (file.size > 50 * 1024 * 1024)
      throw new Error('Maximum attachment size is 50 MB');
    const r = await fetch('/api/gym/media', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-File-Name': encodeURIComponent(file.name),
      },
      body: file,
    });
    const data = (await r.json()) as { media: Attachment; error?: string };
    if (!r.ok) throw new Error(data.error ?? 'Upload failed');
    setMedia((m) => [data.media, ...m]);
    change((d) => ({ ...d, mediaIds: [...d.mediaIds, data.media.id] }));
    await draftSync.sync();
  }
  const title = (
    <>
      <Head>
        <title>riwaj.me/gym</title>
        <meta
          name="description"
          content="A quiet training log. Track your sets, effort and personal progress."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="referrer" content="same-origin" />
      </Head>
      <header className="gym-header">
        <Link href="/gym">riwaj.me/gym</Link>
        <span>Train. Record. Repeat.</span>
        {enabled && <span>{user?.name}</span>}
      </header>
    </>
  );
  if (!checked)
    return (
      <main className="gym">
        {title}
        <p>Connecting to your training log…</p>
        {error && <p role="alert">{error}</p>}
      </main>
    );
  if (!enabled)
    return (
      <main className="gym">
        {title}
        <div className="gym-access">
          <h1>Your training, kept together.</h1>
          <p>
            Log on your phone. Pick up on your desktop. Devices stay signed in
            for 180 days.
          </p>
          {error && (
            <p role="alert" className="gym-error">
              {error}
            </p>
          )}
          {user ? (
            <section className="gym-card">
              <h2>
                {user.status === 'pending'
                  ? 'Awaiting approval'
                  : 'Access not approved'}
              </h2>
              <p>
                Riwaj reviews new members by email. Keep this browser’s cookie
                so this device can be recognized.
              </p>
              <button onClick={() => void session()}>Check access</button>
            </section>
          ) : (
            <>
              <form
                className="gym-card"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act(async () => {
                    await api('request', 'POST', { email, name });
                    await session();
                  });
                }}
              >
                <h2>Request a place</h2>
                <p>Up to 100 members. Every request is reviewed by Riwaj.</p>
                <label>
                  Your name
                  <input
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={80}
                    required
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </label>
                <button className="gym-primary" disabled={busy}>
                  Request access
                </button>
              </form>
              <form
                className="gym-card"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act(async () => {
                    await api('pair/redeem', 'POST', { code: redeem.trim() });
                    await session();
                  });
                }}
              >
                <h2>Already a member?</h2>
                <p>
                  On your signed-in device, open Devices and create a pairing
                  code. Paste it here within 10 minutes.
                </p>
                <label>
                  One-time pairing code
                  <input
                    value={redeem}
                    onChange={(e) => setRedeem(e.target.value)}
                    autoComplete="off"
                    required
                  />
                </label>
                <button disabled={busy}>Pair this device</button>
              </form>
            </>
          )}
        </div>
        <footer>
          Exercise text catalogue from{' '}
          <a href="https://github.com/DuarteSantos8/openGym">openGym</a>.{' '}
          <Link href="/gym/source">Source & licenses</Link>
        </footer>
      </main>
    );
  return (
    <main className="gym">
      {title}
      <nav className="gym-tabs" aria-label="Gym sections">
        {[
          'Log',
          'History',
          'Notes',
          'Devices',
          'Data',
          ...(user?.owner ? ['Members'] : []),
        ].map((t) => (
          <button
            key={t}
            aria-current={tab === t ? 'page' : undefined}
            onClick={() => {
              setTab(t);
              if (t === 'Members')
                void act(async () => {
                  const r = await api<{ users: typeof members }>('admin/users');
                  setMembers(r.users);
                });
            }}
          >
            {t}
          </button>
        ))}
      </nav>
      <div role="status" aria-live="polite" className="gym-status">
        {draftSync.status}
        {message && ` · ${message}`}
      </div>
      {error && (
        <p role="alert" className="gym-error">
          {error}
        </p>
      )}
      {draftSync.conflict && (
        <section className="gym-card gym-conflict">
          <h2>Draft changed on another device</h2>
          <p>
            Your edits are still on this screen. Choose which draft to keep;
            replacing will overwrite the other device’s draft.
          </p>
          <button disabled={busy} onClick={() => void act(draftSync.reload)}>
            Discard these edits and load synced draft
          </button>
          <button disabled={busy} onClick={() => void act(draftSync.replace)}>
            Replace synced draft with these edits
          </button>
        </section>
      )}
      {!draftSync.ready ? (
        <p>Loading your draft…</p>
      ) : (
        <>
          {tab === 'Log' && (
            <div className="gym-layout">
              <section className="gym-card gym-library">
                <h2>Choose an exercise</h2>
                <label>
                  Search all variations
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setOffset(0);
                    }}
                    placeholder="e.g. incline, cable, behind neck"
                  />
                </label>
                <label>
                  Equipment
                  <select
                    value={equipment}
                    onChange={(e) => {
                      setEquipment(e.target.value);
                      setOffset(0);
                    }}
                  >
                    <option value="">All equipment</option>
                    {library.equipments.map((e) => (
                      <option key={e}>{e}</option>
                    ))}
                  </select>
                </label>
                <p className="gym-muted">
                  {library.total.toLocaleString()} matches · variants keep
                  separate histories
                </p>
                {searchError && <p role="alert">{searchError}</p>}
                <p className="gym-muted">
                  Shorthand works: BTN OHP, DB RDL, WG LPD. Search changes
                  names, never your exercise history.
                </p>
                {!!library.suggested?.length && (
                  <section aria-label="Usual and standard variations">
                    <h3 className="gym-results-title">
                      Usual & standard variations
                    </h3>
                    <div className="gym-exercise-list gym-suggestions">
                      {library.suggested.map((ex) => (
                        <button
                          key={ex.id}
                          className={
                            draft.exerciseId === ex.id ? 'selected' : ''
                          }
                          disabled={busy}
                          onClick={() => {
                            setSelected(ex);
                            change((d) => ({
                              ...d,
                              exerciseId: ex.id,
                              mode: isCardioExercise(ex)
                                ? 'cardio'
                                : 'strength',
                              cardio: emptyCardio(),
                              sets: d.sets.length
                                ? d.sets
                                : [
                                    {
                                      weight: null,
                                      reps: 8,
                                      rpe: DEFAULT_RPE,
                                      warmup: false,
                                    },
                                  ],
                              tier:
                                recent.find((e) => e.exerciseId === ex.id)
                                  ?.tier ?? 'auto',
                            }));
                          }}
                        >
                          <strong>{ex.name}</strong>
                          <span>
                            {ex.equipment} · {ex.reason}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
                <h3 className="gym-results-title">Other variations</h3>
                <div className="gym-exercise-list">
                  {library.exercises
                    .filter(
                      (ex) => !library.suggested?.some((s) => s.id === ex.id)
                    )
                    .map((ex) => (
                      <button
                        className={draft.exerciseId === ex.id ? 'selected' : ''}
                        key={ex.id}
                        onClick={() => {
                          setSelected(ex);
                          change((d) => ({
                            ...d,
                            exerciseId: ex.id,
                            mode: isCardioExercise(ex) ? 'cardio' : 'strength',
                            cardio: emptyCardio(),
                            sets: d.sets.length
                              ? d.sets
                              : [
                                  {
                                    weight: null,
                                    reps: 8,
                                    rpe: DEFAULT_RPE,
                                    warmup: false,
                                  },
                                ],
                            tier:
                              recent.find((e) => e.exerciseId === ex.id)
                                ?.tier ?? 'auto',
                          }));
                        }}
                        disabled={busy}
                      >
                        <strong>{ex.name}</strong>
                        <span>
                          {ex.equipment} · {ex.muscle}
                        </span>
                      </button>
                    ))}
                </div>
                <div className="gym-row">
                  <button
                    disabled={!offset}
                    onClick={() => setOffset((x) => Math.max(0, x - 50))}
                  >
                    Previous
                  </button>
                  <span>{Math.floor(offset / 50) + 1}</span>
                  <button
                    disabled={!library.hasMore}
                    onClick={() => setOffset((x) => x + 50)}
                  >
                    Next
                  </button>
                </div>
                <details>
                  <summary>Add your own exercise</summary>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void act(async () => {
                        const r = await api<{ exercise: Exercise }>(
                          'exercises',
                          'POST',
                          custom
                        );
                        setSelected(r.exercise);
                        change((d) => ({
                          ...d,
                          exerciseId: r.exercise.id,
                          mode: isCardioExercise(r.exercise)
                            ? 'cardio'
                            : 'strength',
                          cardio: emptyCardio(),
                          sets: d.sets.length
                            ? d.sets
                            : [
                                {
                                  weight: null,
                                  reps: 8,
                                  rpe: DEFAULT_RPE,
                                  warmup: false,
                                },
                              ],
                          tier: 'auto',
                        }));
                        setQuery(r.exercise.name);
                        setEquipment('');
                        setOffset(0);
                      });
                    }}
                  >
                    <label>
                      Name
                      <input
                        required
                        value={custom.name}
                        onChange={(e) =>
                          setCustom({ ...custom, name: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Equipment
                      <input
                        required
                        value={custom.equipment}
                        onChange={(e) =>
                          setCustom({ ...custom, equipment: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Target muscle
                      <input
                        required
                        value={custom.muscle}
                        onChange={(e) =>
                          setCustom({ ...custom, muscle: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Tracking type
                      <select
                        value={custom.category}
                        onChange={(e) =>
                          setCustom({ ...custom, category: e.target.value })
                        }
                      >
                        <option value="strength">Strength</option>
                        <option value="cardio">Cardio</option>
                      </select>
                    </label>
                    <button disabled={busy}>Add exercise</button>
                  </form>
                </details>
              </section>
              <div>
                <section className="gym-card">
                  <h1>{selected?.name ?? 'Log a workout'}</h1>
                  <p className="gym-muted">
                    {cardioMode
                      ? 'Track time, optional distance and effort.'
                      : 'One row per set. Log dumbbells per hand, barbells as total load, and use the same convention every session.'}
                  </p>
                  <fieldset disabled={busy}>
                    <label>
                      Tracking type
                      <select
                        value={cardioMode ? 'cardio' : 'strength'}
                        onChange={(e) =>
                          change((d) => ({
                            ...d,
                            mode: e.target.value as 'cardio' | 'strength',
                            cardio: d.cardio ?? emptyCardio(),
                            sets: d.sets.length
                              ? d.sets
                              : [
                                  {
                                    weight: null,
                                    reps: 8,
                                    rpe: DEFAULT_RPE,
                                    warmup: false,
                                  },
                                ],
                          }))
                        }
                      >
                        <option value="strength">Strength</option>
                        <option value="cardio">Cardio</option>
                      </select>
                    </label>
                    <div className="gym-fields">
                      <label>
                        Date
                        <input
                          type="date"
                          max={new Date().toISOString().slice(0, 10)}
                          value={draft.date}
                          onChange={(e) =>
                            change((d) => ({ ...d, date: e.target.value }))
                          }
                        />
                      </label>
                      {!cardioMode && (
                        <>
                          <label>
                            Units
                            <select
                              value={draft.unit}
                              onChange={(e) => {
                                const unit = e.target.value as 'lb' | 'kg';
                                change((d) => {
                                  const factor =
                                    unit === 'kg' ? 0.45359237 : 1 / 0.45359237;
                                  return {
                                    ...d,
                                    unit,
                                    bodyweight:
                                      d.bodyweight === null
                                        ? null
                                        : Math.round(
                                            d.bodyweight * factor * 100
                                          ) / 100,
                                    sets: d.sets.map((s) => ({
                                      ...s,
                                      weight:
                                        s.weight === null
                                          ? null
                                          : Math.round(
                                              s.weight * factor * 100
                                            ) / 100,
                                    })),
                                  };
                                });
                              }}
                            >
                              <option value="lb">lbs</option>
                              <option value="kg">kg</option>
                            </select>
                          </label>
                          <label>
                            Bodyweight ({unitLabel(draft.unit)})
                            <input
                              type="number"
                              inputMode="decimal"
                              min="1"
                              max="1500"
                              step="0.1"
                              value={draft.bodyweight ?? ''}
                              onChange={(e) =>
                                change((d) => ({
                                  ...d,
                                  bodyweight: e.target.value
                                    ? Number(e.target.value)
                                    : null,
                                }))
                              }
                            />
                          </label>
                        </>
                      )}
                    </div>
                    {cardioMode ? (
                      <CardioFields
                        value={draft.cardio ?? emptyCardio()}
                        onChange={(cardio) =>
                          change((d) => ({ ...d, mode: 'cardio', cardio }))
                        }
                      />
                    ) : (
                      <>
                        <div className="gym-set-labels">
                          <span>Set</span>
                          <span>{unitLabel(draft.unit)}</span>
                          <span>Reps</span>
                          <span>RPE</span>
                          <span>Warmup</span>
                          <span />
                        </div>
                        {draft.sets.map((s, i) => (
                          <div className="gym-set" key={i}>
                            <span>
                              {i + 1}
                              {isHardSet(s) && (
                                <small className="gym-hard-set">Hard</small>
                              )}
                            </span>
                            <input
                              aria-label={`Set ${i + 1} weight in ${unitLabel(
                                draft.unit
                              )}`}
                              type="number"
                              inputMode="decimal"
                              min="0"
                              max="3000"
                              step="0.25"
                              value={s.weight ?? ''}
                              required
                              onFocus={(e) => e.currentTarget.select()}
                              onChange={(e) =>
                                updateSet(i, {
                                  weight:
                                    e.target.value === ''
                                      ? null
                                      : Number(e.target.value),
                                })
                              }
                            />
                            <input
                              aria-label={`Set ${i + 1} reps`}
                              type="number"
                              inputMode="numeric"
                              min="1"
                              max="1000"
                              value={s.reps ?? ''}
                              required
                              onFocus={(e) => e.currentTarget.select()}
                              onChange={(e) =>
                                updateSet(i, {
                                  reps:
                                    e.target.value === ''
                                      ? null
                                      : Number(e.target.value),
                                })
                              }
                            />
                            <input
                              aria-label={`Set ${i + 1} RPE`}
                              type="number"
                              inputMode="decimal"
                              min="1"
                              max="10"
                              step="0.5"
                              placeholder="—"
                              value={s.rpe ?? ''}
                              onChange={(e) =>
                                updateSet(i, {
                                  rpe: e.target.value
                                    ? Number(e.target.value)
                                    : null,
                                })
                              }
                            />
                            <input
                              aria-label={`Set ${i + 1} is a warmup`}
                              type="checkbox"
                              checked={s.warmup}
                              onChange={(e) =>
                                updateSet(i, { warmup: e.target.checked })
                              }
                            />
                            <button
                              aria-label={`Remove set ${i + 1}`}
                              disabled={draft.sets.length === 1}
                              onClick={() =>
                                change((d) => ({
                                  ...d,
                                  sets: d.sets.filter((_, n) => n !== i),
                                }))
                              }
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <button
                          disabled={draft.sets.length >= 100}
                          onClick={() =>
                            change((d) => ({
                              ...d,
                              sets: [
                                ...d.sets,
                                {
                                  ...d.sets[d.sets.length - 1]!,
                                  rpe: DEFAULT_RPE,
                                },
                              ],
                            }))
                          }
                        >
                          + Add set
                        </button>
                        <p className="gym-muted">
                          Weight and reps are required to save; use 0 for no
                          external weight. RPE 10 = no reps left, 9 ≈ 1 left, 8
                          ≈ 2 left. New sets default to RPE 6. RPE 7+ counts as
                          a hard set for volume; blank RPE does not count.
                        </p>
                      </>
                    )}
                    <label>
                      Session notes
                      <textarea
                        value={draft.notes}
                        maxLength={20000}
                        onChange={(e) =>
                          change((d) => ({ ...d, notes: e.target.value }))
                        }
                        placeholder="Setup, technique, how it felt…"
                      />
                    </label>
                    <button onClick={() => setTab('Notes')}>
                      Attach video, photo or audio ({draft.mediaIds.length})
                    </button>
                    <button
                      className="gym-primary"
                      disabled={
                        !draft.exerciseId ||
                        draftSync.conflict ||
                        (cardioMode
                          ? !draft.cardio?.minutes
                          : !draft.sets.length ||
                            draft.sets.some(
                              (s) => s.weight === null || s.reps === null
                            ))
                      }
                      onClick={() => void act(save)}
                    >
                      {busy ? 'Saving…' : 'Save workout to history'}
                    </button>
                  </fieldset>
                </section>
                <section className="gym-card">
                  <h2>Next session</h2>
                  {cardioMode ? (
                    <p>
                      Use your time, distance and effort history to compare
                      sessions. Keep conditions similar when comparing pace.
                    </p>
                  ) : historyBusy ? (
                    <p>Loading complete history…</p>
                  ) : historyError ? (
                    <p role="alert">{historyError}</p>
                  ) : advice ? (
                    <>
                      <p>{advice.message}</p>
                      {advice.nextReps !== null && (
                        <p className="gym-target">
                          {advice.nextWeight}{' '}
                          {unitLabel(advice.unit as 'lb' | 'kg')} ×{' '}
                          {advice.nextReps} reps
                        </p>
                      )}
                      {advice.weeklyPercent !== null && (
                        <p>
                          Observed estimated 1RM change:{' '}
                          {advice.weeklyPercent.toFixed(1)}% / week
                        </p>
                      )}
                      <label>
                        Experience for this exercise
                        <select
                          value={draft.tier}
                          onChange={(e) =>
                            change((d) => ({
                              ...d,
                              tier: e.target.value as typeof d.tier,
                            }))
                          }
                        >
                          <option value="auto">Auto / rough reference</option>
                          {['novice', 'intermediate', 'advanced', 'elite'].map(
                            (t) => (
                              <option key={t}>{t}</option>
                            )
                          )}
                        </select>
                      </label>
                      <p>
                        {advice.tier
                          ? `Experience reference: ${advice.tier}${
                              draft.tier === 'auto'
                                ? ' (rough estimate)'
                                : ' (your selection)'
                            }`
                          : 'No reliable bodyweight standard for this variation.'}
                        {advice.ratio
                          ? ` · e1RM/bodyweight ${advice.ratio.toFixed(2)}×`
                          : ''}
                      </p>
                      <p className="gym-muted">
                        Bodyweight bands are rough, non-sex-specific reference
                        points for a few barbell lifts. Leverages, equipment and
                        technique change comparisons. Targets come from your own
                        exercise history and effort, not your label.
                      </p>
                    </>
                  ) : (
                    <p>Select an exercise to see its baseline.</p>
                  )}
                </section>
              </div>
            </div>
          )}
          {tab === 'History' && (
            <>
              <h1>
                {historyView === 'volume'
                  ? 'Training volume'
                  : selected?.name ?? 'Workout history'}
              </h1>
              <label>
                History view
                <select
                  value={historyView}
                  onChange={(e) => setHistoryView(e.target.value)}
                >
                  <option value="exercise">Selected exercise</option>
                  <option value="volume">Volume</option>
                </select>
              </label>
              <p>
                {historyView === 'volume'
                  ? 'Volume includes your full history. Saved workouts below show the latest 200 entries.'
                  : 'Select an exercise in Log to graph its full history. Saved workouts below show the latest 200 entries.'}
              </p>
              {historyView === 'volume' ? (
                <VolumeHistory
                  selectedExerciseId={draft.exerciseId}
                  refresh={recent}
                />
              ) : historyBusy ? (
                <p>Loading complete lift history…</p>
              ) : historyError ? (
                <p role="alert">{historyError}</p>
              ) : (
                selected &&
                (cardioMode ? (
                  <CardioHistory entries={history} />
                ) : (
                  <HistoryChart
                    entries={history}
                    forecast={advice?.forecast ?? []}
                    unit={draft.unit}
                  />
                ))
              )}
              {recent.length === 0 && <p>No workouts saved yet.</p>}
              {recent.map((entry) => (
                <article className="gym-card" key={entry.id}>
                  <div className="gym-row">
                    <button
                      onClick={() => {
                        change((d) => ({
                          ...d,
                          exerciseId: entry.exerciseId,
                          mode: entry.mode,
                          cardio: d.cardio ?? emptyCardio(),
                          tier: entry.tier,
                        }));
                        setTab('History');
                      }}
                    >
                      <strong>{entry.exercise}</strong>
                    </button>
                    <time>{entry.date}</time>
                  </div>
                  <p>
                    {entry.mode === 'cardio' && entry.cardio
                      ? cardioSummary(entry.cardio)
                      : entry.sets
                          .map(
                            (s) =>
                              `${s.weight} ${unitLabel(entry.unit)} × ${
                                s.reps
                              }${s.rpe === null ? '' : ` @${s.rpe}`}${
                                s.warmup ? ' (warmup)' : ''
                              }`
                          )
                          .join(' · ')}
                  </p>
                  {entry.notes && <p className="gym-note">{entry.notes}</p>}
                  <Media
                    items={media.filter((m) => entry.mediaIds.includes(m.id))}
                  />
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          'Delete this saved workout? This cannot be undone.'
                        )
                      )
                        void act(async () => {
                          await api('entries', 'DELETE', { id: entry.id });
                          await loadRecent();
                        });
                    }}
                  >
                    Delete entry
                  </button>
                </article>
              ))}
            </>
          )}
          {tab === 'Data' && (
            <section className="gym-card">
              <h1>Export your data</h1>
              <p>
                Export all your saved workouts, not just the latest 200. JSON
                includes your profile, notes, synced draft, exercise definitions
                and attachment metadata. CSV contains saved workouts, one row
                per strength set or cardio session.
              </p>
              <button
                disabled={busy || draftSync.conflict}
                onClick={() =>
                  void act(async () => {
                    await draftSync.sync();
                    const r = await fetch('/api/gym/export');
                    if (!r.ok) throw new Error('Export failed');
                    const url = URL.createObjectURL(await r.blob());
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `gym-data-${new Date()
                      .toISOString()
                      .slice(0, 10)}.json`;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 60000);
                  })
                }
              >
                Download JSON
              </button>
              <a
                className="gym-download"
                href="/api/gym/export?format=csv"
                download
              >
                Download CSV
              </a>
              <h2>Attachments</h2>
              <p>
                Photos, videos and audio are separate downloads. Their IDs and
                filenames are included in the JSON export.
              </p>
              {!media.length && <p>No attachments uploaded.</p>}
              {media.map((m) => (
                <p key={m.id}>
                  <a
                    href={`/api/gym/media/${m.id}?download=1`}
                    download={m.name}
                  >
                    {m.name}
                  </a>{' '}
                  · {m.id}
                </p>
              ))}
            </section>
          )}
          {tab === 'Notes' && (
            <section className="gym-card">
              <h1>Notes & attachments</h1>
              <p>
                These notes and attachments belong to the current workout draft
                and sync across paired devices.
              </p>
              <label>
                Notes
                <textarea
                  value={draft.notes}
                  maxLength={20000}
                  disabled={busy}
                  onChange={(e) =>
                    change((d) => ({ ...d, notes: e.target.value }))
                  }
                />
              </label>
              <label>
                Attach media (up to 50 MB each)
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/flac"
                  disabled={busy || draft.mediaIds.length >= 20}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void act(() => upload(file));
                  }}
                />
              </label>
              <p className="gym-muted">
                Private on your EC2 server. 500 MB per member; 10 GB total.
                Media is preserved as uploaded, including metadata.
              </p>
              <Media
                items={media.filter((m) => draft.mediaIds.includes(m.id))}
                onRemove={(id) =>
                  change((d) => ({
                    ...d,
                    mediaIds: d.mediaIds.filter((x) => x !== id),
                  }))
                }
              />
              <details>
                <summary>Previously uploaded media</summary>
                {media.map((m) => (
                  <div className="gym-row" key={m.id}>
                    <span>
                      {m.name} · {(m.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                    <button
                      disabled={
                        draft.mediaIds.includes(m.id) ||
                        busy ||
                        draft.mediaIds.length >= 20
                      }
                      onClick={() =>
                        change((d) => ({
                          ...d,
                          mediaIds: [...d.mediaIds, m.id],
                        }))
                      }
                    >
                      Attach
                    </button>
                    <button
                      disabled={busy || draft.mediaIds.includes(m.id)}
                      onClick={() =>
                        void act(async () => {
                          await api('media/' + m.id, 'DELETE');
                          await loadMedia();
                        })
                      }
                    >
                      Delete unused file
                    </button>
                  </div>
                ))}
              </details>
              <button onClick={() => void act(draftSync.sync)} disabled={busy}>
                Sync draft now
              </button>
            </section>
          )}
          {tab === 'Devices' && (
            <section className="gym-card">
              <h1>Your devices</h1>
              <p>
                This device is recognized by a private, secure session cookie.
                Clearing cookies signs it out. We do not fingerprint hardware.
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await draftSync.sync();
                    const r = await api<{ code: string }>('pair', 'POST');
                    setPairCode(r.code);
                  })
                }
              >
                Create a one-time pairing code
              </button>
              {pairCode && (
                <label>
                  Paste on your other device (expires in 10 minutes)
                  <input
                    readOnly
                    value={pairCode}
                    onFocus={(e) => e.target.select()}
                  />
                </label>
              )}
              <p>
                Never share a code with someone else: it grants access to your
                training log.
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await api('devices/revoke', 'POST');
                    setPairCode('');
                    setMessage('Other devices signed out.');
                  })
                }
              >
                Sign out all other devices
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await draftSync.sync();
                    await api('logout', 'POST');
                    window.location.reload();
                  })
                }
              >
                Sign out this device
              </button>
              <p className="gym-muted">
                Lost every signed-in device? Contact Riwaj for recovery. New
                access requests cannot claim an existing account.
              </p>
            </section>
          )}
          {tab === 'Members' && user?.owner && (
            <section className="gym-card">
              <h1>Members</h1>
              <p>
                {
                  members.filter(
                    (m) => m.status === 'approved' || m.status === 'pending'
                  ).length
                }
                /100 places reserved. Approval links are sent to
                riwaj227@gmail.com.
              </p>
              {members.map((m) => (
                <div className="gym-member" key={m.id}>
                  <span>
                    <strong>{m.name}</strong>
                    <br />
                    {m.email} · {m.status}
                  </span>
                  {m.id !== user.id && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          await api('admin/users', 'POST', {
                            userId: m.id,
                            status:
                              m.status === 'approved' ? 'rejected' : 'approved',
                          });
                          const r = await api<{ users: typeof members }>(
                            'admin/users'
                          );
                          setMembers(r.users);
                        })
                      }
                    >
                      {m.status === 'approved' ? 'Revoke' : 'Approve'}
                    </button>
                  )}
                </div>
              ))}
            </section>
          )}
        </>
      )}
      <footer>
        Text exercise library adapted from{' '}
        <a href="https://github.com/DuarteSantos8/openGym">openGym</a>.{' '}
        <Link href="/gym/source">Source & licenses</Link>
      </footer>
    </main>
  );
}
function Media({
  items,
  onRemove,
}: {
  items: Attachment[];
  onRemove?: (id: string) => void;
}) {
  return (
    <div className="gym-media">
      {items.map((m) => (
        <figure key={m.id}>
          {m.type.startsWith('image/') ? (
            <img loading="lazy" src={'/api/gym/media/' + m.id} alt={m.name} />
          ) : m.type.startsWith('video/') ? (
            <video
              controls
              playsInline
              preload="none"
              src={'/api/gym/media/' + m.id}
            />
          ) : (
            <audio controls preload="none" src={'/api/gym/media/' + m.id} />
          )}
          <figcaption>{m.name}</figcaption>
          {onRemove && (
            <button onClick={() => onRemove(m.id)}>Detach from draft</button>
          )}
        </figure>
      ))}
    </div>
  );
}
