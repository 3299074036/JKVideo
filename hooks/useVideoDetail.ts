import { useState, useEffect, useRef } from 'react';
import { Platform, ToastAndroid } from 'react-native';
import { getVideoDetail, getPlayUrl } from '../services/bilibili';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { usePlayProgressStore } from '../store/playProgressStore';
import type { VideoItem, PlayUrlResponse } from '../services/types';

export function useVideoDetail(bvid: string) {
  const [video, setVideo] = useState<VideoItem | null>(null);
  const [playData, setPlayData] = useState<PlayUrlResponse | null>(null);
  const [qualities, setQualities] = useState<{ qn: number; desc: string }[]>([]);
  const [currentQn, setCurrentQn] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialTime, setInitialTime] = useState(0);
  // 分 P：当前选中的分 P 下标，默认第 1 个
  const [pageIndex, setPageIndex] = useState(0);
  // 正在切换的分 P 下标（切换信号，驱动播放器转圈浮层）；null = 无切换/切换失败
  const [switchingPageIdx, setSwitchingPageIdx] = useState<number | null>(null);
  const cidRef = useRef<number>(0);
  const qnRef = useRef<number>(0);
  const videoRef = useRef<VideoItem | null>(null);
  const pageIndexRef = useRef(0);
  const isLoggedIn = useAuthStore(s => s.isLoggedIn);
  const trafficSaving = useSettingsStore(s => s.trafficSaving);
  const defaultQn = trafficSaving ? 16 : 126;

  async function fetchPlayData(cid: number, qn: number, updateList = false) {
    const data = await getPlayUrl(bvid, cid, qn);
    setPlayData(data);
    setCurrentQn(data.quality);
    qnRef.current = data.quality;
    if (updateList && data.accept_quality?.length) {
      setQualities(
        data.accept_quality.map((q, i) => ({
          qn: q,
          desc: data.accept_description?.[i] ?? String(q),
        }))
      );
    }
  }

  async function changeQuality(qn: number) {
    await fetchPlayData(cidRef.current, qn);
  }

  /** 切换分 P：按新分 P 的 cid 重拉播放流，进度从 0 开始。
   *  不清空旧 playData：旧画面保留，播放器用转圈浮层盖住切换过程；
   *  失败时回退到原分 P 并 toast，不黑屏。 */
  async function changePage(idx: number) {
    const pages = videoRef.current?.pages;
    if (!pages || idx < 0 || idx >= pages.length || idx === pageIndexRef.current) return;
    const prevIdx = pageIndexRef.current;
    const cid = pages[idx].cid;
    pageIndexRef.current = idx;
    setPageIndex(idx);
    setSwitchingPageIdx(idx);
    setInitialTime(0);
    cidRef.current = cid;
    try {
      await fetchPlayData(cid, qnRef.current || defaultQn, true);
    } catch (e: any) {
      // 回退：留在当前分 P，旧流继续可播；信号清零撤掉转圈浮层
      pageIndexRef.current = prevIdx;
      setPageIndex(prevIdx);
      setSwitchingPageIdx(null);
      cidRef.current = pages[prevIdx].cid;
      if (Platform.OS === 'android') {
        ToastAndroid.show('切换分P失败，请稍后重试', ToastAndroid.SHORT);
      }
    }
  }

  useEffect(() => {
    // bvid 切换时立刻清空旧数据，防止上一支视频的播放器/简介/清晰度短暂"残影"造成抖动
    setVideo(null);
    setPlayData(null);
    setQualities([]);
    setCurrentQn(0);
    setPageIndex(0);
    pageIndexRef.current = 0;
    setSwitchingPageIdx(null);
    videoRef.current = null;
    cidRef.current = 0;
    async function fetchData() {
      try {
        setLoading(true);
        // 读取续播位置
        setInitialTime(usePlayProgressStore.getState().get(bvid));
        const detail = await getVideoDetail(bvid);
        setVideo(detail);
        videoRef.current = detail;
        const cid = detail.pages?.[0]?.cid ?? detail.cid as number;
        cidRef.current = cid;
        await fetchPlayData(cid, defaultQn, true);
      } catch (e: any) {
        setError(e.message ?? 'Load failed');
      } finally {
        setLoading(false);
      }
    }
    if (bvid) fetchData();
  }, [bvid]);

  // 登录状态变化时重新拉取清晰度列表（登录后可能获得更高画质）
  // cancelled flag 防止旧响应（切换登录态后）覆盖新响应
  useEffect(() => {
    if (!cidRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await getPlayUrl(bvid, cidRef.current, defaultQn);
        if (cancelled) return;
        setPlayData(data);
        setCurrentQn(data.quality);
        if (data.accept_quality?.length) {
          setQualities(
            data.accept_quality.map((q, i) => ({
              qn: q,
              desc: data.accept_description?.[i] ?? String(q),
            })),
          );
        }
      } catch (e) {
        if (!cancelled) console.warn('Failed to refresh quality list after login change:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  const pages = video?.pages ?? [];
  const currentCid = video?.pages?.[pageIndex]?.cid ?? (video?.cid as number | undefined);

  return {
    video,
    playData,
    loading,
    error,
    qualities,
    currentQn,
    changeQuality,
    initialTime,
    pages,
    pageIndex,
    changePage,
    switchingPageIdx,
    currentCid,
  };
}
