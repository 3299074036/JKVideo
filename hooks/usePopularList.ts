import { useState, useCallback, useRef } from 'react';
import { getPopularVideos } from '../services/bilibili';
import type { VideoItem } from '../services/types';

/** 首页"热门"tab：官方热门接口 /x/web-interface/popular，pn 翻页 */
export function usePopularList() {
  const [pages, setPages] = useState<VideoItem[][]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadingRef = useRef(false);
  const pnRef = useRef(1);
  const pendingResetRef = useRef(false);

  const load = useCallback(async (reset = false) => {
    if (loadingRef.current) {
      if (reset) pendingResetRef.current = true;
      return;
    }
    loadingRef.current = true;
    pendingResetRef.current = false;
    const pn = reset ? 1 : pnRef.current;
    setLoading(true);
    try {
      const data = await getPopularVideos(pn);
      setPages(prev => reset ? [data] : [...prev, data]);
      pnRef.current = pn + 1;
    } catch (e) {
      console.error('Failed to load popular videos', e);
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setRefreshing(false);
      if (pendingResetRef.current) {
        pendingResetRef.current = false;
        load(true);
      }
    }
  }, []);

  const refresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  return { pages, loading, refreshing, load, refresh };
}
