import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface DownloadTask {
  bvid: string;
  title: string;
  cover: string;
  qn: number;
  qdesc: string;
  status: 'downloading' | 'done' | 'error';
  progress: number; // 0-1
  fileSize?: number; // bytes
  localUri?: string;
  error?: string;
  createdAt: number;
}

interface DownloadStore {
  tasks: Record<string, DownloadTask>; // key: `${bvid}_${qn}`
  hasLoaded: boolean;
  addTask: (key: string, task: DownloadTask) => void;
  updateTask: (key: string, patch: Partial<DownloadTask>) => void;
  removeTask: (key: string) => void;
  loadFromStorage: () => Promise<void>;
}

const STORAGE_KEY = 'download_tasks';

export const useDownloadStore = create<DownloadStore>((set, get) => ({
  tasks: {},
  hasLoaded: false,

  addTask: (key, task) => {
    const next = { ...get().tasks, [key]: task };
    set({ tasks: next });
    persistTasks(next);
  },

  updateTask: (key, patch) => {
    set((s) => {
      const prev = s.tasks[key];
      if (!prev) return s;
      const updated = { ...prev, ...patch };
      const next = { ...s.tasks, [key]: updated };
      // 只在状态/localUri变化时持久化，progress 不持久化（避免高频写 AsyncStorage）
      if (patch.status !== undefined || patch.localUri !== undefined || patch.error !== undefined || patch.fileSize !== undefined) {
        persistTasks(next);
      }
      return { tasks: next };
    });
  },

  removeTask: (key) => {
    set((s) => {
      const next = { ...s.tasks };
      delete next[key];
      persistTasks(next);
      return { tasks: next };
    });
  },

  loadFromStorage: async () => {
    // 已加载过则跳过，防止重复调用覆盖正在进行的下载状态
    if (get().hasLoaded) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved: Record<string, DownloadTask> = JSON.parse(raw);
        // 重启后 downloading 任务无法续传，标记为 error
        Object.keys(saved).forEach((k) => {
          if (saved[k].status === 'downloading') {
            saved[k].status = 'error';
            saved[k].error = '下载被中断，请重试';
            saved[k].progress = 0;
          }
        });
        set({ tasks: saved, hasLoaded: true });
      } else {
        set({ hasLoaded: true });
      }
    } catch {
      set({ hasLoaded: true });
    }
  },
}));

function persistTasks(tasks: Record<string, DownloadTask>) {
  // 只持久化 done/error，downloading 重启后无法续传无需保存
  const toSave: Record<string, DownloadTask> = {};
  Object.keys(tasks).forEach((k) => {
    if (tasks[k].status !== 'downloading') {
      toSave[k] = tasks[k];
    }
  });
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toSave)).catch(() => {});
}
