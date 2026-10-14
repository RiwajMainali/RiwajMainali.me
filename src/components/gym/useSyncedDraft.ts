import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/gym/client';
import { emptyDraft, type Draft } from '../../lib/gym/types';
type Response = { draft: Draft; revision: number };
export function useSyncedDraft(enabled: boolean) {
  const state = useRef({
    draft: emptyDraft(),
    revision: 0,
    seq: 0,
    dirty: false,
    conflict: false,
    loaded: false,
  });
  const [draft, setDraft] = useState(state.current.draft),
    [ready, setReady] = useState(false),
    [status, setStatus] = useState('Loading draft…');
  const [conflict, setConflict] = useState(false);
  const running = useRef<Promise<void> | null>(null);
  const apply = useCallback((data: Response) => {
    state.current = {
      draft: data.draft,
      revision: data.revision,
      seq: state.current.seq + 1,
      dirty: false,
      conflict: false,
      loaded: true,
    };
    setDraft(data.draft);
    setConflict(false);
    setStatus('Draft synced across devices · not yet in history');
    setReady(true);
  }, []);
  const sync = useCallback(async () => {
    if (running.current) return running.current;
    if (state.current.conflict)
      throw new Error('Resolve the draft conflict before saving');
    const task = async () => {
      while (state.current.dirty) {
        const { draft, revision, seq } = state.current;
        setStatus('Syncing draft…');
        try {
          const result = await api<{ revision: number }>('draft', 'PUT', {
            draft,
            revision,
          });
          state.current.revision = result.revision;
          if (state.current.seq === seq) state.current.dirty = false;
          setStatus(
            state.current.dirty
              ? 'Syncing newer edits…'
              : 'Draft synced across devices · not yet in history'
          );
        } catch (e) {
          if ((e as { status?: number }).status === 409) {
            state.current.conflict = true;
            setConflict(true);
          }
          setStatus(e instanceof Error ? e.message : 'Draft sync failed');
          throw e;
        }
      }
    };
    running.current = task();
    try {
      await running.current;
    } finally {
      running.current = null;
    }
  }, []);
  const change = useCallback((update: Draft | ((d: Draft) => Draft)) => {
    const next =
      typeof update === 'function' ? update(state.current.draft) : update;
    state.current.draft = next;
    state.current.seq++;
    state.current.dirty = true;
    setDraft(next);
    setStatus('Unsynced changes on this device');
  }, []);
  const reload = useCallback(async () => {
    if (running.current) await running.current.catch(() => {});
    apply(await api<Response>('draft'));
  }, [apply]);
  const replace = useCallback(async () => {
    const remote = await api<Response>('draft');
    state.current.revision = remote.revision;
    state.current.conflict = false;
    setConflict(false);
    await sync();
  }, [sync]);
  useEffect(() => {
    if (!enabled) return;
    void reload().catch((e) => setStatus((e as Error).message));
    const timer = setInterval(() => {
      if (state.current.dirty) {
        if (!state.current.conflict) void sync().catch(() => {});
        return;
      }
      if (running.current) return;
      const seq = state.current.seq;
      void api<Response>('draft')
        .then((r) => {
          if (
            !state.current.dirty &&
            seq === state.current.seq &&
            (!state.current.loaded || r.revision !== state.current.revision)
          )
            apply(r);
        })
        .catch(() => {});
    }, 5000);
    const leave = (e: BeforeUnloadEvent) => {
      if (state.current.dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const online = () => {
      void sync().catch(() => {});
    };
    window.addEventListener('beforeunload', leave);
    window.addEventListener('online', online);
    return () => {
      clearInterval(timer);
      window.removeEventListener('beforeunload', leave);
      window.removeEventListener('online', online);
    };
  }, [enabled, reload, apply, sync]);
  useEffect(() => {
    if (!ready || !state.current.dirty || state.current.conflict) return;
    const t = setTimeout(() => {
      void sync().catch(() => {});
    }, 650);
    return () => clearTimeout(t);
  }, [draft, ready, sync]);
  return {
    draft,
    change,
    ready,
    status,
    conflict,
    sync,
    reload,
    replace,
    revision: () => state.current.revision,
    currentDraft: () => state.current.draft,
  };
}
