import { create } from 'zustand';
import type { PlayUrlResponse } from '../services/types';

interface CacheEntry {
  playData: PlayUrlResponse;
  mpdUri?: string;
  ts: number;
}

interface PlayUrlCacheStore {
  // 不通过 set 触发渲染（只是用 store 持有 Map）
  cache: Map<string, CacheEntry>;
  get: (bvid: string, qn: number) => CacheEntry | undefined;
  set: (bvid: string, qn: number, entry: Omit<CacheEntry, 'ts'>) => void;
}

const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 30;

const makeKey = (bvid: string, qn: number) => `${bvid}_${qn}`;

export const usePlayUrlCache = create<PlayUrlCacheStore>((_set, getState) => ({
  cache: new Map(),
  get: (bvid, qn) => {
    const map = getState().cache;
    const entry = map.get(makeKey(bvid, qn));
    if (!entry) return undefined;
    if (Date.now() - entry.ts > TTL_MS) {
      map.delete(makeKey(bvid, qn));
      return undefined;
    }
    return entry;
  },
  set: (bvid, qn, entry) => {
    const map = getState().cache;
    map.set(makeKey(bvid, qn), { ...entry, ts: Date.now() });
    // 简单 LRU：超过容量删最早
    if (map.size > MAX_ENTRIES) {
      const oldestKey = map.keys().next().value;
      if (oldestKey) map.delete(oldestKey);
    }
  },
}));
