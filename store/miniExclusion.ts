/**
 * MiniPlayer ↔ LiveMiniPlayer 互斥协调。
 * 通过 zustand subscribe 在外部串联两个 store，避免它们直接互相 import
 * 造成循环依赖（曾导致 Metro / TS 编译时内存暴涨）。
 *
 * 仅需在 app 启动时 import 一次（_layout.tsx）即可生效。
 */
import { useVideoStore } from './videoStore';
import { useLiveStore } from './liveStore';

let initialized = false;

export function initMiniExclusion() {
  if (initialized) return;
  initialized = true;

  // 视频 mini 激活 → 清掉直播 mini
  useVideoStore.subscribe((state, prev) => {
    if (state.isActive && !prev.isActive && useLiveStore.getState().isActive) {
      useLiveStore.getState().clearLive();
    }
  });

  // 直播 mini 激活 → 清掉视频 mini
  useLiveStore.subscribe((state, prev) => {
    if (state.isActive && !prev.isActive && useVideoStore.getState().isActive) {
      useVideoStore.getState().clearVideo();
    }
  });
}
