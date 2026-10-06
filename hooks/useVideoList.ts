import { useState, useCallback, useRef, useMemo } from 'react';
import { getRecommendFeed } from '../services/bilibili';
import type { VideoItem } from '../services/types';

export function useVideoList() {
  const [pages, setPages] = useState<VideoItem[][]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadingRef = useRef(false);
  const freshIdxRef = useRef(0);

  const load = useCallback(async (reset = false) => {
    if (loadingRef.current) {
      if (reset) setRefreshing(false);
      return;
    }
    loadingRef.current = true;
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
