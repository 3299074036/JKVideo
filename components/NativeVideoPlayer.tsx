import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { formatDuration } from "../utils/format";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Text,
  Modal,
  Image,
  PanResponder,
  ActivityIndicator,
  Animated,
  useWindowDimensions,
} from "react-native";
import Video, { VideoRef } from "react-native-video";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import type {
  PlayUrlResponse,
  VideoShotData,
  DanmakuItem,
  IVideoPlayer,
} from "../services/types";
import { buildDashMpdUri } from "../utils/dash";
import { getVideoShot } from "../services/bilibili";
import DanmakuOverlay from "./DanmakuOverlay";
import { useTheme } from "../utils/theme";
import { usePlayProgressStore } from "../store/playProgressStore";

const BAR_H = 3;
// 进度球尺寸
const BALL = 12;
// 活跃状态下的拖动球增大尺寸，提升触控体验
const BALL_ACTIVE = 16;
const HIDE_DELAY = 3000;

const HEADERS = {
  Referer: "https://www.bilibili.com",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
//
function findFrameByTime(index: number[], seekTime: number): number {
  let lo = 0,
    hi = index.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (index[mid] <= seekTime) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export interface NativeVideoPlayerRef extends IVideoPlayer {
  /** @deprecated 用 pause()/resume() 代替 */
  setPaused: (v: boolean) => void;
}

interface Props {
  playData: PlayUrlResponse | null;
  qualities: { qn: number; desc: string }[];
  currentQn: number;
  onQualityChange: (qn: number) => void;
  onFullscreen: () => void;
  style?: object;
  bvid?: string;
  cid?: number;
  danmakus?: DanmakuItem[];
  isFullscreen?: boolean;
  onTimeUpdate?: (t: number) => void;
  initialTime?: number;
  forcePaused?: boolean;
  /** 点击播放器右上角"弹幕列表"图标，由外层打开 Sheet。仅在小窗口生效。 */
  onDanmakuListPress?: () => void;
  /** 点击播放器左上角返回箭头，跟随播放器控制栏一起显隐。仅在小窗口生效。 */
  onBack?: () => void;
  /** 视频封面 URL：作为 poster 覆盖在 <Video> 上，首帧出来前用来盖住黑屏 */
  coverUrl?: string;
}

export const NativeVideoPlayer = forwardRef<NativeVideoPlayerRef, Props>(
  function NativeVideoPlayer(
    {
      playData,
      qualities,
      currentQn,
      onQualityChange,
      onFullscreen,
      style,
      bvid,
      cid,
      danmakus,
      isFullscreen,
      onTimeUpdate,
      initialTime,
      forcePaused,
      onDanmakuListPress,
      onBack,
      coverUrl,
    }: Props,
    ref,
  ) {
    const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
    const VIDEO_H = SCREEN_W * 0.5625;
    const theme = useTheme();

    const [resolvedUrl, setResolvedUrl] = useState<string | undefined>();
    const isDash = !!playData?.dash;
    // 封面挡片：用于盖住 <Video> 从挂载到 onLoad 出首帧之间的黑屏
    // resolvedUrl 变化（新视频 / 换清晰度）时重新置 true，等下一次 onLoad 再撤
    const [coverVisible, setCoverVisible] = useState(true);
    useEffect(() => {
      setCoverVisible(true);
    }, [resolvedUrl]);

    const [showControls, setShowControls] = useState(true);
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [paused, setPaused] = useState(false);
    // seek 后强制触发 react-native-video 重新评估 paused prop 的 hack 用的瞬时叠加态
    // 单独存储以避免污染 paused（用于图标显示）：seek 完成的一瞬间不让"播放/暂停"图标闪
    const [seekHackPaused, setSeekHackPaused] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const currentTimeRef = useRef(0);
    const [duration, setDuration] = useState(0);
    const durationRef = useRef(0);
    const lastProgressUpdate = useRef(0);

    const [showQuality, setShowQuality] = useState(false);

    // 倍速
    const RATE_OPTIONS = [0.75, 1, 1.25, 1.5, 2];
    const [rate, setRate] = useState(1);
    const [showRate, setShowRate] = useState(false);

    // 清晰度切换：保留进度 + loading 遮罩
    const [switching, setSwitching] = useState(false);
    const pendingSeekRef = useRef<number | null>(null);
    const prevQnRef = useRef(currentQn);
    const switchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 续播：每 5s 持久化一次
    const lastSaveRef = useRef(0);

    useEffect(() => {
      // 排除初始挂载（prevQn 或 currentQn === 0）
      if (
        prevQnRef.current !== 0 &&
        currentQn !== 0 &&
        prevQnRef.current !== currentQn
      ) {
        pendingSeekRef.current = currentTimeRef.current;
        setSwitching(true);
        // 兜底：8s 内 onLoad 没触发就强制收起遮罩
        if (switchTimeoutRef.current) clearTimeout(switchTimeoutRef.current);
        switchTimeoutRef.current = setTimeout(() => setSwitching(false), 8000);
      }
      prevQnRef.current = currentQn;
    }, [currentQn]);

    useEffect(() => {
      return () => {
        if (switchTimeoutRef.current) clearTimeout(switchTimeoutRef.current);
      };
    }, []);

    const [buffered, setBuffered] = useState(0);
    const [isSeeking, setIsSeeking] = useState(false);
    const isSeekingRef = useRef(false);
    // 拖动球位置用 Animated.Value 驱动：setValue 不触发 React 重渲染，
    // 原生层直接更新坐标，跟手 60fps。消除老方案 setState+60ms 节流导致的"段落感"。
    const touchAnimX = useRef(new Animated.Value(0)).current;
    // 缩略图换帧仍走 state（精灵图位移涉及 RN 视图属性变化），50ms 节流足够
    const [thumbFrame, setThumbFrame] = useState<{
      sheetIdx: number;
      col: number;
      row: number;
      seekTime: number;
    } | null>(null);
    const thumbThrottleRef = useRef(0);
    const barOffsetX = useRef(0);
    const barWidthRef = useRef(300);
    const trackRef = useRef<View>(null);
    // 让稳定的 PanResponder 闭包能读到最新 shots
    const shotsRef = useRef<VideoShotData | null>(null);

    const [shots, setShots] = useState<VideoShotData | null>(null);
    const [showDanmaku, setShowDanmaku] = useState(true);

    const videoRef = useRef<VideoRef>(null);

    useImperativeHandle(ref, () => ({
      seek: (t: number) => {
        videoRef.current?.seek(t);
      },
      pause: () => setPaused(true),
      resume: () => setPaused(false),
      getCurrentTime: () => currentTimeRef.current,
      setPaused: (v: boolean) => {
        setPaused(v);
      },
    }));

    const currentDesc =
      qualities.find((q) => q.qn === currentQn)?.desc ??
      String(currentQn || "HD");

    // 解析播放链接，dash 需要构建 mpd uri，普通链接直接取第一个 durl。使用 useEffect 监听 playData 和 currentQn 变化，确保每次切换视频或清晰度时都能正确更新播放链接。错误处理逻辑保证即使 dash mpd 构建失败也能回退到普通链接，提升兼容性。
    useEffect(() => {
      if (!playData) {
        setResolvedUrl(undefined);
        return;
      }
      if (isDash) {
        buildDashMpdUri(playData, currentQn, bvid)
          .then(setResolvedUrl)
          .catch(() => setResolvedUrl(playData.dash!.video[0]?.baseUrl));
      } else {
        setResolvedUrl(playData.durl?.[0]?.url);
      }
    }, [playData, currentQn]);
    // 获取视频截图数据，供进度条预览使用。依赖 bvid 和 cid，确保在视频切换时重新获取截图。使用 cancelled 标志避免在组件卸载后更新状态，防止内存泄漏和潜在的错误。
    useEffect(() => {
      if (!bvid || !cid) return;
      let cancelled = false;
      getVideoShot(bvid, cid).then((shotData) => {
        if (cancelled) return;
        if (shotData?.image?.length) {
          setShots(shotData);
        }
      });
      return () => {
        cancelled = true;
      };
    }, [bvid, cid]);

    useEffect(() => {
      durationRef.current = duration;
    }, [duration]);

    useEffect(() => {
      shotsRef.current = shots;
    }, [shots]);

    // 非拖动时，球/进度填充随 currentTime 同步（onProgress 驱动）
    useEffect(() => {
      if (isSeekingRef.current) return;
      if (durationRef.current <= 0 || barWidthRef.current <= 0) {
        touchAnimX.setValue(0);
        return;
      }
      const x = clamp(
        (currentTime / durationRef.current) * barWidthRef.current,
        0,
        barWidthRef.current,
      );
      touchAnimX.setValue(x);
    }, [currentTime, duration]);

    // 控制栏自动隐藏逻辑：每次用户交互后重置计时器，3秒无交互则隐藏。使用 useRef 存储计时器 ID 和拖动状态，避免闭包问题导致的计时器失效或误触发。
    const resetHideTimer = useCallback(() => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (!isSeekingRef.current) {
        hideTimer.current = setTimeout(
          () => setShowControls(false),
          HIDE_DELAY,
        );
      }
    }, []);
    // 显示控制栏并重置隐藏计时器，确保用户每次交互后都有足够时间查看控制栏。依赖 resetHideTimer 保持稳定引用，避免不必要的重新渲染。
    const showAndReset = useCallback(() => {
      setShowControls(true);
      resetHideTimer();
    }, [resetHideTimer]);

    // 点击视频区域切换控制栏显示状态，显示时重置隐藏计时器，隐藏时直接隐藏。使用 useCallback 优化性能，避免不必要的函数重新创建。
    const handleTap = useCallback(() => {
      setShowControls((prev) => {
        if (!prev) {
          resetHideTimer();
          return true;
        }
        if (hideTimer.current) clearTimeout(hideTimer.current);
        return false;
      });
    }, [resetHideTimer]);

    // 组件卸载时清理隐藏计时器，避免内存泄漏和潜在的状态更新错误。依赖项为空数组确保只在挂载和卸载时执行一次。
    useEffect(() => {
      resetHideTimer();
      return () => {
        if (hideTimer.current) clearTimeout(hideTimer.current);
      };
    }, []);

    const measureTrack = useCallback(() => {
      trackRef.current?.measureInWindow((x, _y, w) => {
        if (w > 0) {
          barOffsetX.current = x;
          barWidthRef.current = w;
        }
      });
    }, []);
    // 拖动中按 50ms 节流计算精灵图帧索引；球位置不走这里，由 Animated.setValue 直接更新
    const updateThumbFrame = useCallback((x: number) => {
      const shotsData = shotsRef.current;
      if (!shotsData || durationRef.current <= 0 || barWidthRef.current <= 0) return;
      const ratio = clamp(x / barWidthRef.current, 0, 1);
      const seekTime = ratio * durationRef.current;
      const { img_x_len, img_y_len, image, index } = shotsData;
      const framesPerSheet = img_x_len * img_y_len;
      const totalFrames = framesPerSheet * image.length;
      const frameIdx = index?.length
        ? clamp(findFrameByTime(index, seekTime), 0, index.length - 1)
        : clamp(Math.floor(ratio * (totalFrames - 1)), 0, totalFrames - 1);
      const local = frameIdx % framesPerSheet;
      setThumbFrame({
        sheetIdx: Math.floor(frameIdx / framesPerSheet),
        col: local % img_x_len,
        row: Math.floor(local / img_x_len),
        seekTime,
      });
    }, []);

    // PanResponder 进度条拖动：球/进度填充走 Animated.setValue（无 React 渲染），
    // 缩略图换帧 50ms 节流；松手时 seek 到目标时间并恢复自动同步。
    const panResponder = useRef(
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (_, gs) => {
          isSeekingRef.current = true;
          setIsSeeking(true);
          setShowControls(true);
          if (hideTimer.current) clearTimeout(hideTimer.current);
          const x = clamp(gs.x0 - barOffsetX.current, 0, barWidthRef.current);
          touchAnimX.setValue(x);
          thumbThrottleRef.current = 0;
          updateThumbFrame(x);
        },
        onPanResponderMove: (_, gs) => {
          const x = clamp(
            gs.moveX - barOffsetX.current,
            0,
            barWidthRef.current,
          );
          // 关键：setValue 不触发 React 渲染，进度球/进度填充由原生层直接刷新
          touchAnimX.setValue(x);
          const now = Date.now();
          if (now - thumbThrottleRef.current >= 50) {
            thumbThrottleRef.current = now;
            updateThumbFrame(x);
          }
        },
        // 用户松开拖动，或拖动被中断（如来电），都视为结束拖动
        onPanResponderRelease: (_, gs) => {
          const x = clamp(
            gs.moveX - barOffsetX.current,
            0,
            barWidthRef.current,
          );
          const ratio = barWidthRef.current > 0 ? x / barWidthRef.current : 0;
          const t = ratio * durationRef.current;
          touchAnimX.setValue(x);
          videoRef.current?.seek(t);
          setCurrentTime(t);
          isSeekingRef.current = false;
          setIsSeeking(false);
          setThumbFrame(null);
          if (hideTimer.current) clearTimeout(hideTimer.current);
          hideTimer.current = setTimeout(
            () => setShowControls(false),
            HIDE_DELAY,
          );
        },
        onPanResponderTerminate: () => {
          isSeekingRef.current = false;
          setIsSeeking(false);
          setThumbFrame(null);
        },
      }),
    ).current;
    const bufferedRatio = duration > 0 ? clamp(buffered / duration, 0, 1) : 0;

    // 缩略图尺寸：竖屏播放器较窄给 160，全屏给 220 提升可读性
    const THUMB_DISPLAY_W = isFullscreen ? 220 : 160;

    // 进度球水平偏移：active 态球更大，translate 偏移需对齐圆心
    const ballTranslate = React.useMemo(
      () => Animated.subtract(touchAnimX, (isSeeking ? BALL_ACTIVE : BALL) / 2),
      [isSeeking, touchAnimX],
    );

    const renderThumbnail = () => {
      if (!thumbFrame || !shots || !isSeeking) return null;
      const {
        img_x_size: TW,
        img_y_size: TH,
        img_x_len,
        img_y_len,
        image,
      } = shots;
      const { sheetIdx, col, row, seekTime } = thumbFrame;
      // 根据单帧图尺寸和预设的显示宽度计算缩放后的显示尺寸，保持宽高比
      const scale = THUMB_DISPLAY_W / TW;
      const DW = THUMB_DISPLAY_W;
      const DH = Math.round(TH * scale);
      // 缩略图固定到播放器水平中点，不跟随手指 / 进度球移动
      const fixedLeft = Math.round(SCREEN_W / 2 - DW / 2);
      const raw = image[sheetIdx];
      if (!raw) return null;
      // 兼容处理图床地址，确保以 http(s) 协议开头
      const sheetUrl = raw.startsWith("//") ? `https:${raw}` : raw;
      return (
        <View
          style={[styles.thumbPreview, { left: fixedLeft, width: DW }]}
          pointerEvents="none"
        >
          <View
            style={{
              width: DW,
              height: DH,
              overflow: "hidden",
              borderRadius: 6,
            }}
          >
            <Image
              source={{ uri: sheetUrl, headers: HEADERS }}
              style={{
                position: "absolute",
                width: TW * img_x_len * scale,
                height: TH * img_y_len * scale,
                left: -col * DW,
                top: -row * DH,
              }}
            />
          </View>
          <Text style={styles.thumbTime}>
            {formatDuration(Math.floor(seekTime))}
          </Text>
        </View>
      );
    };

    return (
      <View
        style={[
          isFullscreen
            ? styles.fsContainer
            : [styles.container, { width: SCREEN_W, height: VIDEO_H }],
          style,
        ]}
      >
        {resolvedUrl ? (
          <Video
            key={resolvedUrl}
            ref={videoRef}
            source={
              isDash
                ? { uri: resolvedUrl, type: "mpd", headers: HEADERS }
                : { uri: resolvedUrl, headers: HEADERS }
            }
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
            controls={false}
            paused={!!(forcePaused || paused || seekHackPaused)}
            rate={rate}
            progressUpdateInterval={500}
            onProgress={({
              currentTime: ct,
              seekableDuration: dur,
              playableDuration: buf,
            }) => {
              currentTimeRef.current = ct;
              onTimeUpdate?.(ct);
              // 续播持久化（5s 节流）
              if (bvid && dur > 0) {
                const nowSave = Date.now();
                if (nowSave - lastSaveRef.current > 5000) {
                  lastSaveRef.current = nowSave;
                  usePlayProgressStore.getState().save(bvid, ct, dur);
                }
              }
              // 拖动进度条时跳过 UI 更新，避免与用户拖动冲突
              if (isSeekingRef.current) return;
              const now = Date.now();
              if (now - lastProgressUpdate.current < 450) return;
              lastProgressUpdate.current = now;
              setCurrentTime(ct);
              if (dur > 0 && Math.abs(dur - durationRef.current) > 1) setDuration(dur);
              setBuffered(buf);
            }}
            onLoad={() => {
              // 首帧已就绪，撤掉 poster 挡片，让 <Video> 透出
              setCoverVisible(false);
              // 切清晰度后跳回原进度
              const pending = pendingSeekRef.current;
              let didSeek = false;
              if (pending !== null && pending > 0) {
                videoRef.current?.seek(pending);
                pendingSeekRef.current = null;
                didSeek = true;
              } else if (initialTime && initialTime > 0) {
                videoRef.current?.seek(initialTime);
                didSeek = true;
              }
              if (switching) {
                setSwitching(false);
                if (switchTimeoutRef.current) {
                  clearTimeout(switchTimeoutRef.current);
                  switchTimeoutRef.current = null;
                }
              }
              // seek 后部分播放器不自动恢复播放，需短暂 paused→false 触发 prop 变化
              // 仅在确实 seek 时执行；走 seekHackPaused（不污染图标显示态），避免播放/暂停图标闪烁
              if (didSeek && !forcePaused && !paused) {
                setSeekHackPaused(true);
                requestAnimationFrame(() => setSeekHackPaused(false));
              }
            }}
            onError={(e) => {
              // 按降级链找下一档可用清晰度（从当前档位的下一档起，跳过不在 qualities 列表里的）
              const FALLBACK_CHAIN = [126, 112, 80, 64, 32, 16];
              const idx = FALLBACK_CHAIN.indexOf(currentQn);
              if (idx >= 0) {
                const acceptable = new Set(qualities.map(q => q.qn));
                for (let i = idx + 1; i < FALLBACK_CHAIN.length; i++) {
                  const next = FALLBACK_CHAIN[i];
                  if (acceptable.has(next)) {
                    onQualityChange(next);
                    return;
                  }
                }
              }
              console.warn("Video playback error:", e);
            }}
          />
        ) : (
          // 没拿到 resolvedUrl 之前用主题色 + 封面占位，避免页面背景 → 纯黑的撞色
          <View style={[styles.placeholder, { backgroundColor: theme.card }]}>
            {!!coverUrl && (
              <Image
                source={{ uri: coverUrl }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
              />
            )}
          </View>
        )}

        {/* poster 挡片：<Video> 已挂载但首帧未到达时显示封面 */}
        {!!resolvedUrl && coverVisible && !!coverUrl && (
          <Image
            source={{ uri: coverUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            pointerEvents="none"
          />
        )}

        {switching && (
          <View style={styles.switchOverlay} pointerEvents="none">
            <ActivityIndicator color="#fff" size="small" />
            <Text style={styles.switchText}>切换到 {currentDesc}…</Text>
          </View>
        )}

        {isFullscreen && !!danmakus?.length && (
          <DanmakuOverlay
            danmakus={danmakus}
            currentTime={currentTime}
            screenWidth={SCREEN_W}
            screenHeight={SCREEN_H}
            visible={showDanmaku}
          />
        )}

        <TouchableWithoutFeedback onPress={handleTap}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>

        {showControls && (
          <>
            {/*  小窗口 */}
            <LinearGradient
              colors={["rgba(0,0,0,0.55)", "transparent"]}
              style={styles.topBar}
              pointerEvents="box-none"
            >
              {onBack && (
                <TouchableOpacity
                  style={styles.topBtn}
                  onPress={() => {
                    onBack();
                    showAndReset();
                  }}
                  hitSlop={6}
                >
                  <Ionicons name="chevron-back" size={22} color="#fff" />
                </TouchableOpacity>
              )}
              <View style={{ flex: 1 }} />
              {onDanmakuListPress && (
                <TouchableOpacity
                  style={styles.topBtn}
                  onPress={() => {
                    onDanmakuListPress();
                    showAndReset();
                  }}
                >
                  <Ionicons name="list-outline" size={20} color="#fff" />
                </TouchableOpacity>
              )}
            </LinearGradient>

            <TouchableOpacity
              style={styles.centerBtn}
              onPress={() => {
                setPaused((p) => !p);
                showAndReset();
              }}
            >
              <View style={styles.centerBtnBg}>
                <Ionicons
                  name={paused ? "play" : "pause"}
                  size={28}
                  color="#fff"
                />
              </View>
            </TouchableOpacity>

            <LinearGradient
              colors={["transparent", "rgba(0,0,0,0.7)"]}
              style={styles.bottomBar}
              pointerEvents="box-none"
            >
              <View
                ref={trackRef}
                style={styles.trackWrapper}
                onLayout={measureTrack}
                {...panResponder.panHandlers}
              >
                <View style={styles.track}>
                  <View
                    style={[
                      styles.trackLayer,
                      {
                        width: `${bufferedRatio * 100}%` as any,
                        backgroundColor: "rgba(255,255,255,0.35)",
                      },
                    ]}
                  />
                  <Animated.View
                    style={[
                      styles.trackLayer,
                      {
                        width: touchAnimX,
                        backgroundColor: "#00AEEC",
                      },
                    ]}
                  />
                </View>
                <Animated.View
                  style={[
                    styles.ball,
                    isSeeking && styles.ballActive,
                    {
                      left: 0,
                      transform: [{ translateX: ballTranslate }],
                    },
                  ]}
                />
              </View>
              {/* Controls */}

              <View style={styles.ctrlRow}>
                <TouchableOpacity
                  onPress={() => {
                    setPaused((p) => !p);
                    showAndReset();
                  }}
                  style={styles.ctrlBtn}
                >
                  <Ionicons
                    name={paused ? "play" : "pause"}
                    size={16}
                    color="#fff"
                  />
                </TouchableOpacity>
                <Text style={styles.timeText}>
                  {formatDuration(Math.floor(currentTime))}
                </Text>
                <View style={{ flex: 1 }} />
                <Text style={styles.timeText}>{formatDuration(duration)}</Text>
                <TouchableOpacity
                  style={styles.ctrlBtn}
                  onPress={() => setShowRate(true)}
                >
                  <Text style={styles.qualityText}>{rate === 1 ? "倍速" : `${rate}x`}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.ctrlBtn}
                  onPress={() => setShowQuality(true)}
                >
                  <Text style={styles.qualityText}>{currentDesc}</Text>
                </TouchableOpacity>
                {isFullscreen && (
                  <TouchableOpacity
                    style={styles.ctrlBtn}
                    onPress={() => setShowDanmaku((v) => !v)}
                  >
                    <Ionicons
                      name={showDanmaku ? "chatbubbles" : "chatbubbles-outline"}
                      size={16}
                      color="#fff"
                    />
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.ctrlBtn} onPress={onFullscreen}>
                  <Ionicons name="expand" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </>
        )}

        {renderThumbnail()}
        {/* 选清晰度 */}
        <Modal visible={showQuality} transparent animationType="fade">
          <TouchableOpacity
            style={styles.modalOverlay}
            onPress={() => setShowQuality(false)}
          >
            <View style={[styles.qualityList, { backgroundColor: theme.modalBg }]}>
              <Text style={[styles.qualityTitle, { color: theme.modalText }]}>选择清晰度</Text>
              {qualities.map((q) => (
                <TouchableOpacity
                  key={q.qn}
                  style={[styles.qualityItem, { borderTopColor: theme.modalBorder }]}
                  onPress={() => {
                    setShowQuality(false);
                    onQualityChange(q.qn);
                    showAndReset();
                  }}
                >
                  <Text
                    style={[
                      styles.qualityItemText,
                      { color: theme.modalTextSub },
                      q.qn === currentQn && styles.qualityItemActive,
                    ]}
                  >
                    {q.desc}
                    {q.qn === 126 ? " DV" : ""}
                  </Text>
                  {q.qn === currentQn && (
                    <Ionicons name="checkmark" size={16} color="#00AEEC" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>

        {/* 选倍速 */}
        <Modal visible={showRate} transparent animationType="fade">
          <TouchableOpacity
            style={styles.modalOverlay}
            onPress={() => setShowRate(false)}
          >
            <View style={[styles.qualityList, { backgroundColor: theme.modalBg }]}>
              <Text style={[styles.qualityTitle, { color: theme.modalText }]}>选择倍速</Text>
              {RATE_OPTIONS.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.qualityItem, { borderTopColor: theme.modalBorder }]}
                  onPress={() => {
                    setRate(r);
                    setShowRate(false);
                    showAndReset();
                  }}
                >
                  <Text
                    style={[
                      styles.qualityItemText,
                      { color: theme.modalTextSub },
                      r === rate && styles.qualityItemActive,
                    ]}
                  >
                    {r === 1 ? "正常" : `${r}x`}
                  </Text>
                  {r === rate && (
                    <Ionicons name="checkmark" size={16} color="#00AEEC" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: { backgroundColor: "#000" },
  fsContainer: { flex: 1, backgroundColor: "#000" },
  placeholder: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000" },
  switchOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  switchText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "500",
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 56,
    paddingHorizontal: 12,
    paddingTop: 10,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  topBtn: { padding: 6 },
  centerBtn: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: [{ translateX: -28 }, { translateY: -28 }],
  },
  centerBtnBg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 8,
    paddingTop: 32,
  },
  thumbPreview: { position: "absolute", bottom: 64, alignItems: "center" },
  thumbTime: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  trackWrapper: {
    marginHorizontal: 8,
    height: BAR_H + BALL_ACTIVE,
    justifyContent: "center",
    position: "relative",
  },
  track: {
    height: BAR_H,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  trackLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    height: BAR_H,
  },
  ball: {
    position: "absolute",
    top: (BAR_H + BALL_ACTIVE) / 2 - BALL / 2,
    width: BALL,
    height: BALL,
    borderRadius: BALL / 2,
    backgroundColor: "#fff",
    elevation: 3,
  },
  ballActive: {
    width: BALL_ACTIVE,
    height: BALL_ACTIVE,
    borderRadius: BALL_ACTIVE / 2,
    backgroundColor: "#00AEEC",
    top: 0,
  },
  ctrlRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    marginTop: 4,
  },
  ctrlBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  timeText: {
    color: "#fff",
    fontSize: 11,
    marginHorizontal: 2,
    fontWeight: "600",
  },
  qualityText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  qualityList: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    minWidth: 180,
  },
  qualityTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#212121",
    paddingVertical: 10,
    textAlign: "center",
  },
  qualityItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#eee",
  },
  qualityItemText: { fontSize: 14, color: "#333" },
  qualityItemActive: { color: "#00AEEC", fontWeight: "700" },
});
