import { useState, useCallback, useEffect, useRef } from 'react';
import { getVideoRelated } from '../services/bilibili';
import type { VideoItem } from '../services/types';

export function useRelatedVideos(bvid: string) {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  // BUG-M-13: bvid 保鲜 + 在飞请求归属，用于一致性校验与抢占判断
  const bvidRef = useRef(bvid);
  bvidRef.current = bvid;
  const inFlightBvidRef = useRef<string | null>(null);

  // 切到不同 bvid 时立刻清空，避免新页面短暂显示上一支视频的推荐流
  useEffect(() => {
    setVideos([]);
  }, [bvid]);

  const load = useCallback(async () => {
    const reqBvid = bvidRef.current;
    // 同 bvid 的重复请求互斥；bvid 已变化时允许新请求抢占，
    // 在飞的旧请求响应会被下文的一致性校验丢弃（不再永久拦截致空白）
    if (loadingRef.current && inFlightBvidRef.current === reqBvid) return;
    inFlightBvidRef.current = reqBvid;
    loadingRef.current = true;
    setLoading(true);
    try {
      const data = await getVideoRelated(reqBvid);
      if (reqBvid !== bvidRef.current) return; // bvid 已切换：丢弃旧响应
      setVideos(data);
    } catch (e) {
      console.warn('useRelatedVideos: failed', e);
    } finally {
      // 只有最后一次发起的请求才释放锁，避免旧请求提前释放新请求的锁
      if (inFlightBvidRef.current === reqBvid) {
        inFlightBvidRef.current = null;
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, []);

  return { videos, loading, load, hasMore: false };
}
