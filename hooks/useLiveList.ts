import { useState, useCallback, useRef } from 'react';
import { getLiveList } from '../services/bilibili';
import type { LiveRoom } from '../services/types';

export function useLiveList() {
  const [rooms, setRooms] = useState<LiveRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true); // BUG-M-19: 到底标记

  const loadingRef = useRef(false);
  const pendingRef = useRef(false);
  const pendingResetRef = useRef<{ areaId?: number } | null>(null); // BUG-M-18: 在飞时到达的 reset，结束后补执行
  const pageRef = useRef(1);
  const areaIdRef = useRef(0);
  const seqRef = useRef(0); // BUG-M-17: 请求序号；reset 递增以作废旧响应
  const hasMoreRef = useRef(true);

  const load = useCallback(async (reset = false, parentAreaId?: number) => {
    if (loadingRef.current) {
      if (reset) {
        // BUG-M-17/M-18: reset 抢占——作废在飞请求的响应，并在结束后补执行本次 reset（而非丢弃）
        seqRef.current += 1;
        pendingResetRef.current = { areaId: parentAreaId };
      } else {
        pendingRef.current = true;
      }
      return;
    }
    loadingRef.current = true;
    pendingRef.current = false;

    const seq = seqRef.current;
    if (parentAreaId !== undefined) {
      areaIdRef.current = parentAreaId;
    }

    if (reset) {
      pageRef.current = 1;
      hasMoreRef.current = true;
      setHasMore(true);
      setRooms([]);
    } else if (!hasMoreRef.current) {
      // BUG-M-19: 已到底，不再发翻页请求
      loadingRef.current = false;
      return;
    }

    const page = pageRef.current;
    const areaId = areaIdRef.current;
    setLoading(true);
    try {
      const data = await getLiveList(page, areaId);
      if (seq !== seqRef.current) return; // BUG-M-17: 已被更新的 reset 作废，丢弃旧响应
      setRooms(prev => reset ? data : [...prev, ...data]);
      pageRef.current = page + 1;
      if (data.length === 0) {
        // BUG-M-19: 服务端返回空数组说明到底
        hasMoreRef.current = false;
        setHasMore(false);
      }
    } catch (e) {
      console.error('Failed to load live rooms', e);
    } finally {
      loadingRef.current = false;
      const pendingReset = pendingResetRef.current;
      pendingResetRef.current = null;
      if (pendingReset) {
        // BUG-M-18: 补执行在飞时到达的 reset（refreshing 由它自己的 finally 清理）
        load(true, pendingReset.areaId);
      } else {
        setRefreshing(false);
        if (pendingRef.current) {
          pendingRef.current = false;
          load();
        } else {
          setLoading(false);
        }
      }
    }
  }, []);

  const refresh = useCallback((parentAreaId?: number) => {
    setRefreshing(true);
    load(true, parentAreaId);
  }, [load]);

  return { rooms, loading, refreshing, load, refresh, hasMore };
}
