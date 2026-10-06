import { useState, useCallback, useRef, useMemo } from 'react';
import { getRecommendFeed } from '../services/bilibili';
import type { VideoItem } from '../services/types';

export function useVideoList() {
  const [pages, setPages] = useState<VideoItem[][]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadingRef = useRef(false);
  const freshIdxRef = useRef(0);
  const pendingResetRef = useRef(false); // BUG-M-18: 在飞时到达的 reset，结束后补执行

  const load = useCallback(async (reset = false) => {
    if (loadingRef.current) {
      // BUG-M-18: reset 不再静默丢弃——标记 pending，在飞请求结束后补执行一次
      if (reset) pendingResetRef.current = true;
      return;
    }
    loadingRef.current = true;
    pendingResetRef.current = false;
    const idx = freshIdxRef.current;
    setLoading(true);
    try {
      const data = await getRecommendFeed(idx);
      setPages(prev => reset ? [data] : [...prev, data]);
      freshIdxRef.current = idx + 1;
    } catch (e) {
      console.error('Failed to load videos', e);
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setRefreshing(false);
      if (pendingResetRef.current) {
        pendingResetRef.current = false;
        load(true); // 补执行下拉刷新
      }
    }
  }, []);

  const refresh = useCallback(() => {
    console.log('Refreshing video list');
    setRefreshing(true);
    load(true);
  }, [load]);

  const videos = useMemo(() => pages.flat(), [pages]);
  return { videos, pages, loading, refreshing, load, refresh };
}
