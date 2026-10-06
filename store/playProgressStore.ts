import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'play_progress';
// 持久化最多 200 条记录
const MAX_ENTRIES = 200;
// 视频接近结尾（>= 95%）视为看完，清掉记录
const FINISH_RATIO = 0.95;

interface ProgressEntry {
  bvid: string;
  time: number;       // 秒
  duration: number;   // 秒
  ts: number;         // 写入时间戳
}

interface PlayProgressStore {
  records: Record<string, ProgressEntry>;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  save: (bvid: string, time: number, duration: number) => void;
  get: (bvid: string) => number; // 返回应跳转的秒数（无记录返回 0）
  clear: (bvid: string) => void;
}

const persist = (records: Record<string, ProgressEntry>) => {
  // 控制总量：超量删最早
  const entries = Object.values(records).sort((a, b) => b.ts - a.ts);
  const trimmed = entries.slice(0, MAX_ENTRIES);
  const trimmedMap: Record<string, ProgressEntry> = {};
  trimmed.forEach(e => { trimmedMap[e.bvid] = e; });
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trimmedMap)).catch(() => {});
  return trimmedMap;
};

export const usePlayProgressStore = create<PlayProgressStore>((set, get) => ({
  records: {},
  hydrated: false,
  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const records = JSON.parse(raw);
        set({ records, hydrated: true });
        return;
      }
    } catch {}
    set({ hydrated: true });
  },
  save: (bvid, time, duration) => {
    if (!bvid || !duration || duration <= 0) return;
    // 视频接近结尾，清掉记录
    if (time / duration >= FINISH_RATIO) {
      get().clear(bvid);
      return;
    }
    // 起始 5 秒不必记录
    if (time < 5) return;
    const records = { ...get().records };
    records[bvid] = { bvid, time, duration, ts: Date.now() };
    set({ records: persist(records) });
  },
  get: (bvid) => {
    const r = get().records[bvid];
    return r?.time ?? 0;
  },
  clear: (bvid) => {
    const records = { ...get().records };
    if (records[bvid]) {
      delete records[bvid];
      set({ records: persist(records) });
    }
  },
}));
