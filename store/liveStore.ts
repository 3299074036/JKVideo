import { create } from 'zustand';

interface LiveStore {
  isActive: boolean;
  roomId: number;
  title: string;
  cover: string;       // room.keyframe（直播截图）用于 web 端降级封面
  hlsUrl: string;
  setLive: (roomId: number, title: string, cover: string, hlsUrl: string) => void;
  clearLive: () => void;
}

export const useLiveStore = create<LiveStore>(set => ({
  isActive: false,
  roomId: 0,
  title: '',
  cover: '',
  hlsUrl: '',
  setLive: (roomId, title, cover, hlsUrl) =>
    set({ isActive: true, roomId, title, cover, hlsUrl }),
  clearLive: () =>
    set({ isActive: false, roomId: 0, title: '', cover: '', hlsUrl: '' }),
}));
