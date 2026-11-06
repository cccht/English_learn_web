import { useCallback, useEffect, useRef, useState } from 'react';
import { createStore, get, set } from 'idb-keyval';
import { api, ApiError } from './api';
import { emptyAnnotation, NOTE_COLORS, type Annotation } from './note-types';

type Draft = { annotation: Annotation; dirty: boolean; savedAt: string };
let cache: ReturnType<typeof createStore> | undefined;
const database = () => (cache ||= createStore('shici-annotations', 'drafts'));
const valid = (value: unknown): value is Annotation => {
  const data = value as Annotation | null;
  return Boolean(
    data &&
    data.formatVersion === 1 &&
    data.pageWidth === 720 &&
    Number.isSafeInteger(data.revision) &&
    data.revision >= 0 &&
    Array.isArray(data.strokes) &&
    data.strokes.length <= 1500 &&
    data.strokes.every(
      (stroke) =>
        stroke &&
        typeof stroke.id === 'string' &&
        ['pen', 'highlighter'].includes(stroke.tool) &&
        NOTE_COLORS.includes(stroke.color as (typeof NOTE_COLORS)[number]) &&
        Number.isFinite(stroke.size) &&
        stroke.size >= 1 &&
        stroke.size <= 24 &&
        Array.isArray(stroke.points) &&
        stroke.points.length <= 5000 &&
        stroke.points.every(
          (point) =>
            Array.isArray(point) &&
            point.length === 3 &&
            point.every(Number.isFinite) &&
            point[0] >= 0 &&
            point[0] <= 720 &&
            point[1] >= 0 &&
            point[1] <= 200000 &&
            point[2] >= 0 &&
            point[2] <= 1,
        ),
    ) &&
    typeof data.textNote === 'string' &&
    data.textNote.length <= 10000,
  );
};
const sameContent = (a: Annotation, b: Annotation) =>
  JSON.stringify([a.strokes, a.textNote]) === JSON.stringify([b.strokes, b.textNote]);

export function useAnnotation(userId: string, attemptId: string, groupId: string) {
  const key = `note:${userId}:${attemptId}:${groupId}`;
  const path = `/attempts/${encodeURIComponent(attemptId)}/annotations/${encodeURIComponent(groupId)}`;
  const [annotation, setAnnotation] = useState<Annotation>(emptyAnnotation);
  const [status, setStatus] = useState<
    'loading' | 'saved' | 'saving' | 'local' | 'error' | 'conflict'
  >('loading');
  const [error, setError] = useState('');
  const [localError, setLocalError] = useState('');
  const [conflict, setConflict] = useState<Annotation | null>(null);
  const [generation, setGeneration] = useState(0);
  const loaded = useRef(false);
  const mounted = useRef(true);
  const current = useRef<Annotation>(emptyAnnotation());
  const dirty = useRef(false);
  const mutation = useRef(0);
  const conflictRef = useRef<Annotation | null>(null);
  const localQueue = useRef<Promise<boolean>>(Promise.resolve(true));
  const remoteQueue = useRef<Promise<boolean>>(Promise.resolve(true));
  const saving = useRef(false);
  const loadId = useRef(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const persist = useCallback(
    (value = current.current, isDirty = dirty.current) => {
      const snapshot: Draft = {
        annotation: value,
        dirty: isDirty,
        savedAt: new Date().toISOString(),
      };
      localQueue.current = localQueue.current
        .catch(() => false)
        .then(async () => {
          try {
            await set(key, snapshot, database());
            if (mounted.current) setLocalError('');
            return true;
          } catch {
            if (mounted.current)
              setLocalError('本机草稿存储不可用，请确认服务器保存成功后再离开。');
            return false;
          }
        });
      return localQueue.current;
    },
    [key],
  );
  const showConflict = useCallback((value: Annotation | null) => {
    conflictRef.current = value;
    if (mounted.current) setConflict(value);
  }, []);

  const save = useCallback(() => {
    if (saving.current) return remoteQueue.current;
    saving.current = true;
    const work = remoteQueue.current
      .catch(() => false)
      .then(async () => {
        if (!loaded.current) return false;
        if (!dirty.current) return true;
        if (conflictRef.current) return false;
        const snapshot = current.current;
        const revision = mutation.current;
        if (mounted.current) setStatus('saving');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          const { revision: baseRevision, updatedAt: _updatedAt, ...body } = snapshot;
          const result = await api<{ annotation: Annotation }>(path, {
            method: 'PUT',
            body: JSON.stringify({ ...body, baseRevision }),
            signal: controller.signal,
          });
          if (!valid(result.annotation)) throw new Error('批注响应格式不正确');
          current.current = {
            ...current.current,
            revision: result.annotation.revision,
            updatedAt: result.annotation.updatedAt,
          };
          dirty.current = mutation.current !== revision;
          await persist(current.current, dirty.current);
          if (mounted.current) {
            setAnnotation(current.current);
            setStatus(dirty.current ? 'local' : 'saved');
            setError('');
          }
          return true;
        } catch (reason) {
          if (reason instanceof ApiError && reason.status === 409) {
            const remote = (reason.body as { annotation?: Annotation })?.annotation;
            if (valid(remote)) {
              if (sameContent(current.current, remote)) {
                current.current = remote;
                dirty.current = false;
                await persist(remote, false);
                if (mounted.current) {
                  setAnnotation(remote);
                  setStatus('saved');
                  setError('');
                }
                return true;
              }
              showConflict(remote);
              if (mounted.current) setStatus('conflict');
            }
          } else if (mounted.current) setStatus('local');
          if (mounted.current)
            setError(reason instanceof Error ? reason.message : '批注暂未同步，本机草稿已保留。');
          await persist();
          return false;
        } finally {
          clearTimeout(timeout);
        }
      });
    remoteQueue.current = work.finally(() => {
      saving.current = false;
    });
    return remoteQueue.current;
  }, [path, persist, showConflict]);

  const load = useCallback(async () => {
    const id = ++loadId.current;
    if (mounted.current) setStatus('loading');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const [server, local] = await Promise.allSettled([
      api<{ annotation: Annotation }>(path, { signal: controller.signal }),
      Promise.resolve().then(() => get<Draft>(key, database())),
    ]);
    clearTimeout(timeout);
    if (!mounted.current || id !== loadId.current) return;
    const localDraft =
      local.status === 'fulfilled' && valid(local.value?.annotation) ? local.value : null;
    const remote =
      server.status === 'fulfilled' && valid(server.value.annotation)
        ? server.value.annotation
        : null;
    if (!remote && !localDraft) {
      setStatus('error');
      setError('暂时无法载入批注，请重试。');
      return;
    }
    loaded.current = true;
    if (localDraft?.dirty && (!remote || !sameContent(localDraft.annotation, remote))) {
      current.current = localDraft.annotation;
      dirty.current = true;
      if (remote && remote.revision !== localDraft.annotation.revision) {
        showConflict(remote);
        setStatus('conflict');
        setError('其他页面已更新批注，本机草稿仍然保留。');
      } else {
        setStatus('local');
        setError(remote ? '' : '服务器暂不可用，正在使用本机草稿。');
      }
    } else {
      current.current = remote || localDraft!.annotation;
      dirty.current = Boolean(localDraft?.dirty && !remote);
      setStatus(remote ? 'saved' : 'local');
      setError(remote ? '' : '服务器暂不可用，正在使用本机草稿。');
    }
    setAnnotation(current.current);
    setGeneration((value) => value + 1);
    await persist();
    if (dirty.current && !conflictRef.current) void save();
  }, [key, path, persist, save, showConflict]);

  const change = useCallback(
    (value: Pick<Annotation, 'strokes' | 'textNote'>) => {
      if (!loaded.current) return;
      current.current = { ...current.current, strokes: value.strokes, textNote: value.textNote };
      dirty.current = true;
      mutation.current++;
      setAnnotation(current.current);
      setStatus(conflictRef.current ? 'conflict' : 'local');
      void persist();
      clearTimeout(debounce.current);
      debounce.current = setTimeout(() => {
        void save();
      }, 900);
    },
    [persist, save],
  );

  const flush = useCallback(async () => {
    clearTimeout(debounce.current);
    if (!loaded.current) return true;
    const localSaved = await persist();
    if (localSaved) {
      void save();
      return true;
    }
    const remoteSaved = await save();
    if (!remoteSaved) return false;
    if (dirty.current) await save();
    return !dirty.current;
  }, [persist, save]);

  const resolve = useCallback(
    async (preferLocal: boolean) => {
      const remote = conflictRef.current;
      if (!remote) return;
      try {
        await set(`${key}:backup:${Date.now()}`, { local: current.current, remote }, database());
      } catch {
        setLocalError('无法保存版本备份，请先下载批注后再处理冲突。');
        return;
      }
      if (preferLocal) {
        current.current = { ...current.current, revision: remote.revision };
        dirty.current = true;
        showConflict(null);
        await persist();
        await save();
      } else {
        current.current = remote;
        dirty.current = false;
        showConflict(null);
        setAnnotation(remote);
        setGeneration((value) => value + 1);
        setStatus('saved');
        setError('');
        await persist(remote, false);
      }
    },
    [key, persist, save, showConflict],
  );

  useEffect(() => {
    mounted.current = true;
    void load();
    const interval = setInterval(() => {
      if (dirty.current && !conflictRef.current) void save();
    }, 5000);
    const retry = () => {
      if (loaded.current) void save();
      else void load();
    };
    const exit = () => {
      if (!loaded.current || !dirty.current) return;
      void persist();
      if (conflictRef.current) return;
      const { revision: baseRevision, updatedAt: _updatedAt, ...body } = current.current;
      const data = JSON.stringify({ ...body, baseRevision });
      if (new TextEncoder().encode(data).length < 48000)
        void fetch('/api' + path, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: data,
          keepalive: true,
        }).catch(() => {});
    };
    window.addEventListener('online', retry);
    window.addEventListener('pagehide', exit);
    return () => {
      mounted.current = false;
      loadId.current++;
      clearTimeout(debounce.current);
      clearInterval(interval);
      window.removeEventListener('online', retry);
      window.removeEventListener('pagehide', exit);
      if (loaded.current && dirty.current) {
        void persist();
        void save();
      }
    };
  }, [load, path, persist, save]);
  return {
    annotation,
    status,
    error,
    localError,
    conflict,
    generation,
    loaded: loaded.current,
    change,
    flush,
    resolve,
    retry: () => (loaded.current ? save() : load()),
  };
}
