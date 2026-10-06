import { useState, useCallback, useEffect, useRef } from 'react';
import { getVideoRelated } from '../services/bilibili';
import type { VideoItem } from '../services/types';

export function useRelatedVideos(bvid: string) {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);

  // 切到不同 bvid 时立刻清空，避免新页面短暂显示上一支视频的推荐流
  useEffect(() => {
    setVideos([]);
  }, [bvid]);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const data = await getVideoRelated(bvid);
      setVideos(data);
    } catch (e) {
      console.warn('useRelatedVideos: failed', e);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [bvid]);

  return { videos, loading, load, hasMore: false };
}
