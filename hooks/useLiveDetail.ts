import { useState, useEffect, useCallback, useRef } from 'react';
import { getLiveRoomDetail, getLiveAnchorInfo, getLiveStreamUrl } from '../services/bilibili';
import type { LiveRoomDetail, LiveAnchorInfo, LiveStreamInfo } from '../services/types';

interface LiveDetailState {
  room: LiveRoomDetail | null;
  anchor: LiveAnchorInfo | null;
  stream: LiveStreamInfo | null;
  loading: boolean;
  error: string | null;
}

export function useLiveDetail(roomId: number) {
  const [state, setState] = useState<LiveDetailState>({
    room: null,
    anchor: null,
    stream: null,
    loading: true,
    error: null,
  });

  // 用 ref 追踪最新的 roomId，避免 cancelled 闭包问题
  const latestRoomId = useRef(roomId);
  latestRoomId.current = roomId;

  useEffect(() => {
    if (!roomId) return;
    
    setState({ room: null, anchor: null, stream: null, loading: true, error: null });

    const fetchId = roomId; // 捕获当前 roomId

    async function doFetch() {
      try {
        const [room, anchor] = await Promise.all([
          getLiveRoomDetail(fetchId),
          getLiveAnchorInfo(fetchId),
        ]);

        // 仅在 roomId 未变化时更新状态（替代 cancelled 模式）
        if (latestRoomId.current !== fetchId) return;

        let stream: LiveStreamInfo = { hlsUrl: '', flvUrl: '', qn: 0, qualities: [] };
        if (room?.live_status === 1) {
          stream = await getLiveStreamUrl(fetchId);
        }

        if (latestRoomId.current !== fetchId) return;

        setState({ room, anchor, stream, loading: false, error: null });
      } catch (e: any) {
        if (latestRoomId.current !== fetchId) return;
        setState(prev => ({ ...prev, loading: false, error: e?.message ?? '加载失败' }));
      }
    }

    doFetch();
  }, [roomId]);

  const changeQuality = useCallback(async (qn: number) => {
    try {
      const stream = await getLiveStreamUrl(roomId, qn);
      setState(prev => ({ ...prev, stream: { ...stream, qn } }));
    } catch { /* ignore */ }
  }, [roomId]);

  return { ...state, changeQuality };
}
