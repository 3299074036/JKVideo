import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  forwardRef,
} from "react";
import { formatCount, formatDuration } from "../utils/format";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Text,
  Image,
  PanResponder,
  ActivityIndicator,
  Animated,
  AppState,
  useWindowDimensions,
  ScrollView,
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
import { getVideoShot, reportHeartbeat } from "../services/bilibili";
import DanmakuOverlay from "./DanmakuOverlay";
import { useTheme } from "../utils/theme";
import { usePlayProgressStore } from "../store/playProgressStore";
import * as Brightness from "expo-brightness";

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

/** 分 P 信息（全屏分 P 选择按钮用） */
export interface VideoPageInfo {
  cid: number;
  part: string;
  duration?: number;
}

// 填充模式：contain 适应屏幕 / cover 等比裁切铺满 / stretch 拉伸铺满
export type ResizeMode = "contain" | "cover" | "stretch";

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
  /** 以下播放控制状态由外层 VideoPlayer 持有（进/退全屏时保持一致） */
  paused: boolean;
  onPausedChange: (v: boolean) => void;
  rate: number;
  onRateChange: (r: number) => void;
  volume: number;
  onVolumeChange: (v: number) => void;
  showDanmaku: boolean;
  onShowDanmakuChange: (v: boolean) => void;
  resizeMode: ResizeMode;
  onResizeModeChange: (m: ResizeMode) => void;
  locked: boolean;
  onLockedChange: (v: boolean) => void;
  /** 点击播放器右上角"弹幕列表"图标，由外层打开 Sheet。仅在小窗口生效。 */
  onDanmakuListPress?: () => void;
  /** 点击播放器左上角返回箭头，跟随播放器控制栏一起显隐。仅在小窗口生效。 */
  onBack?: () => void;
  /** 视频封面 URL：作为 poster 覆盖在 <Video> 上，首帧出来前用来盖住黑屏 */
  coverUrl?: string;
  /** 上一集 / 下一集（分 P 切换），仅全屏 */
  onPrevPage?: () => void;
  onNextPage?: () => void;
  hasPrevPage?: boolean;
  hasNextPage?: boolean;
  /** 分 P 列表 / 当前下标 / 切换回调（全屏分 P 选择按钮用），仅全屏 */
  pages?: VideoPageInfo[];
  pageIndex?: number;
  onPageChange?: (idx: number) => void;
  /** 全屏顶栏 UP 主信息 */
  upName?: string;
  upFace?: string;
  onlineCount?: number;
  /** 点击全屏顶栏 UP 主头像/昵称，跳转 UP 主页 */
  onUpPress?: () => void;
  /** 全屏控制栏 ⋯ 按钮：打开互动菜单（发弹幕 / 评论）。仅全屏 */
  onMorePress?: () => void;
  /** 视频 aid：播放心跳上报用 */
  aid?: number;
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
      paused,
      onPausedChange,
      rate,
      onRateChange,
      volume,
      onVolumeChange,
      showDanmaku,
      onShowDanmakuChange,
      resizeMode,
      onResizeModeChange,
      locked,
      onLockedChange,
      onDanmakuListPress,
      onBack,
      coverUrl,
      onPrevPage,
      onNextPage,
      hasPrevPage,
      hasNextPage,
      pages,
      pageIndex,
      onPageChange,
      upName,
      upFace,
      onlineCount,
      onUpPress,
      onMorePress,
      aid,
    }: Props,
    ref,
  ) {
    const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
    const VIDEO_H = SCREEN_W * 0.5625;
    const theme = useTheme();
    // BUG-H-02：只创建一次的 PanResponder 闭包不能直接读 SCREEN_W/SCREEN_H（转屏后过期），
    // 宽高存入每渲染更新的 ref，手势闭包统一读 dimRef
    const dimRef = useRef({ w: SCREEN_W, h: SCREEN_H });
    dimRef.current = { w: SCREEN_W, h: SCREEN_H };

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

    // 播放控制状态（paused/rate/volume/showDanmaku/resizeMode/locked）由外层 VideoPlayer
    // 以 props 传入，竖屏/全屏两个实例共享，进/退全屏时保持一致
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
    const [showRate, setShowRate] = useState(false);

    // 清晰度切换：保留进度 + loading 遮罩
    const [switching, setSwitching] = useState(false);
    // 分 P 选择弹窗
    const [showPages, setShowPages] = useState(false);
    const pendingSeekRef = useRef<number | null>(null);
    const prevQnRef = useRef(currentQn);
    const switchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 续播：每 5s 持久化一次
    const lastSaveRef = useRef(0);
    // 云端历史心跳节流：web 播放器约 15s 上报一次
    const lastHeartbeatRef = useRef(0);
    const heartbeatArgsRef = useRef({ aid: 0, bvid: "", cid: 0 });
    heartbeatArgsRef.current = { aid: aid ?? 0, bvid: bvid ?? "", cid: cid ?? 0 };
    // 退出播放时补报一次心跳（playType=4），让云端历史落到最新进度
    useEffect(() => {
      return () => {
        const a = heartbeatArgsRef.current;
        const t = currentTimeRef.current;
        if (a.aid && a.bvid && a.cid && t > 5) {
          reportHeartbeat({ ...a, playedTime: t, playType: 4 });
        }
      };
    }, []);

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

    // 分 P 切换无感化：cid 变化时进度条归零（新分 P 从头播），
    // 旧画面保留继续播，新流就绪后靠封面 + 缓冲转圈自然过渡，不弹阻塞浮层
    const prevPageCidRef = useRef(cid);
    useEffect(() => {
      const prev = prevPageCidRef.current;
      prevPageCidRef.current = cid;
      if (prev && cid && prev !== cid) {
        setCurrentTime(0);
        showAndReset();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cid]);

    const [buffered, setBuffered] = useState(0);
    // 播放中缓冲（onBuffer）：中央小转圈，不盖遮罩
    const [buffering, setBuffering] = useState(false);
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
    // BUG-H-01：onPanResponderRelease 的 gs.moveX 在无 move 事件时无效（恒为 0），
    // 点按无拖动会 seek 到 0:00。这里记录 grant/move 的最后一次有效 x，release 用它兜底
    const lastSeekXRef = useRef(0);
    // 让稳定的 PanResponder 闭包能读到最新 shots
    const shotsRef = useRef<VideoShotData | null>(null);

    const [shots, setShots] = useState<VideoShotData | null>(null);

    const [showResize, setShowResize] = useState(false);
    // 锚定上拉面板：倍速/画质/画面/分P 共用。打开时从控制栏上方滑出，
    // 不再用居中 Modal。panelAnim 只播入场动画，关闭时直接卸载。
    const panelAnim = useRef(new Animated.Value(0)).current;
    const anyPanelOpen = showQuality || showRate || showResize || showPages;
    useEffect(() => {
      if (anyPanelOpen) {
        panelAnim.setValue(0);
        Animated.timing(panelAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }
    }, [anyPanelOpen, panelAnim]);

    const renderPanel = (
      visible: boolean,
      onClose: () => void,
      title: string,
      children: React.ReactNode,
    ) => {
      if (!visible) return null;
      return (
        <View style={styles.panelWrap}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => {
              onClose();
              showAndReset();
            }}
          />
          <Animated.View
            style={[
              styles.panelCard,
              { backgroundColor: theme.modalBg },
              {
                opacity: panelAnim,
                transform: [
                  {
                    translateY: panelAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [24, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text style={[styles.qualityTitle, { color: theme.modalText }]}>{title}</Text>
            {children}
          </Animated.View>
        </View>
      );
    };
    const RESIZE_OPTIONS: { mode: ResizeMode; label: string }[] = [
      { mode: "contain", label: "适应屏幕" },
      { mode: "cover", label: "等比裁切铺满" },
      { mode: "stretch", label: "拉伸铺满" },
    ];
    // 底栏"画面"按钮显示的短标签
    const RESIZE_SHORT: Record<ResizeMode, string> = {
      contain: "适应",
      cover: "铺满",
      stretch: "拉伸",
    };

    // 全屏锁定：锁定后禁用手势和控制栏，只留解锁键
    // locked 由 props 传入，lockedRef 供只创建一次的手势闭包读取，每渲染同步
    const lockedRef = useRef(locked);
    useEffect(() => {
      lockedRef.current = locked;
    }, [locked]);

    // 播放器音量（手势调节用，0..1）：volume 由 props 传入，volumeRef 供手势闭包读取
    const volumeRef = useRef(volume);
    useEffect(() => {
      volumeRef.current = volume;
    }, [volume]);

    // 双击快进/快退指示
    const [seekFlash, setSeekFlash] = useState<{
      dir: "back" | "fwd";
      key: number;
    } | null>(null);
    const seekFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 手势过程指示：亮度 / 音量 / 横滑进度
    const [gestureOverlay, setGestureOverlay] = useState<
      | null
      | { kind: "brightness" | "volume"; value: number }
      | { kind: "seek"; target: number; delta: number }
    >(null);
    // 亮度权限被拒时的提示（Android 需要"修改系统设置"权限）
    const [brightnessHint, setBrightnessHint] = useState(false);
    const brightDeniedRef = useRef(false);
    const brightHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // BUG-M-08：onLoad 的 initialTime-seek 只在首次挂载执行一次；
    // 切分 P 时 <Video> 因 key 变化重挂载会再次触发 onLoad，此时 initialTime 可能是旧分 P 的残留，
    // 必须跳过，否则新分 P 开场会被 seek 到旧位置（清晰度切换走 pendingSeekRef 分支，不受影响）
    const initialSeekDoneRef = useRef(false);

    // BUG-L-13：命令式 API（seek/pause/resume/getCurrentTime/setPaused）经核查无任何调用方，
    // 已删除 useImperativeHandle；ref 透传保留以兼容 forwardRef 签名。
    // 注意：videoRef 本体必须保留——<Video ref={videoRef}> 与各处 videoRef.current?.seek() 都依赖它，
    // 删 useImperativeHandle 时误删声明会导致运行时 ReferenceError（2026-10-06 已踩坑）。
    const videoRef = useRef<VideoRef>(null);

    const currentDesc =
      qualities.find((q) => q.qn === currentQn)?.desc ??
      String(currentQn || "HD");

    // 解析播放链接，dash 需要构建 mpd uri，普通链接直接取第一个 durl。使用 useEffect 监听 playData 和 currentQn 变化，确保每次切换视频或清晰度时都能正确更新播放链接。错误处理逻辑保证即使 dash mpd 构建失败也能回退到普通链接，提升兼容性。
    // BUG-M-07：单调请求序号，只接受最新一次 resolve，旧的 in-flight promise  resolve 后直接丢弃
    const mpdReqRef = useRef(0);
    useEffect(() => {
      if (!playData) {
        mpdReqRef.current++;
        setResolvedUrl(undefined);
        return;
      }
      if (isDash) {
        const reqId = ++mpdReqRef.current;
        buildDashMpdUri(playData, currentQn, bvid, cid)
          .then((url) => {
            if (mpdReqRef.current === reqId) setResolvedUrl(url);
          })
          .catch(() => {
            if (mpdReqRef.current === reqId)
              setResolvedUrl(playData.dash!.video[0]?.baseUrl);
          });
      } else {
        mpdReqRef.current++;
        setResolvedUrl(playData.durl?.[0]?.url);
      }
      // BUG-L-10：effect 内部用了 bvid/cid，补全依赖
    }, [playData, currentQn, bvid, cid]);
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

    // 锁定/解锁切换：锁定后隐藏控制栏，只留右侧解锁键
    const toggleLock = useCallback(() => {
      const next = !lockedRef.current;
      onLockedChange(next);
      if (next) {
        if (hideTimer.current) clearTimeout(hideTimer.current);
        setShowControls(false);
      } else {
        showAndReset();
      }
    }, [showAndReset, onLockedChange]);

    // 组件卸载时清理隐藏计时器，避免内存泄漏和潜在的状态更新错误。依赖项为空数组确保只在挂载和卸载时执行一次。
    useEffect(() => {
      resetHideTimer();
      return () => {
        if (hideTimer.current) clearTimeout(hideTimer.current);
        if (seekFlashTimer.current) clearTimeout(seekFlashTimer.current);
        if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
        if (brightHintTimer.current) clearTimeout(brightHintTimer.current);
      };
    }, []);

    // BUG-M-09：切后台/锁屏自动暂停（记住切后台前是否在播），回前台恢复播放；
    // 用户手动暂停的不恢复。原 forcePaused prop 无任何调用方传递，已删除死通道，改走内部监听。
    const bgPausedRef = useRef(false);
    useEffect(() => {
      const sub = AppState.addEventListener("change", (state) => {
        if (state === "background" || state === "inactive") {
          if (!paused) {
            bgPausedRef.current = true;
            onPausedChange(true);
          }
        } else if (state === "active") {
          if (bgPausedRef.current) {
            bgPausedRef.current = false;
            onPausedChange(false);
          }
        }
      });
      return () => sub.remove();
    }, [paused, onPausedChange]);

    // 按 delta 秒快进/快退（双击手势用）
    const seekBy = useCallback((delta: number) => {
      const dur = durationRef.current;
      if (dur <= 0) return;
      const t = clamp(currentTimeRef.current + delta, 0, dur);
      videoRef.current?.seek(t);
      setCurrentTime(t);
    }, []);

    // 双击指示：显示 -10秒 / +10秒 徽章后自动消失
    const flashSeek = useCallback((dir: "back" | "fwd") => {
      setSeekFlash({ dir, key: Date.now() });
      if (seekFlashTimer.current) clearTimeout(seekFlashTimer.current);
      seekFlashTimer.current = setTimeout(() => setSeekFlash(null), 700);
    }, []);

    // 全屏单击/双击：300ms 内同一半屏点两次 = 双击快进/快退，否则单击切换控制栏
    const tapRef = useRef<{ time: number; half: "l" | "r" } | null>(null);
    const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const handleFsTap = useCallback(
      (x: number) => {
        // 锁定时单击不做任何事，只能点右侧解锁键
        if (lockedRef.current) return;
        const half = x < SCREEN_W / 2 ? "l" : "r";
        const now = Date.now();
        const last = tapRef.current;
        if (last && now - last.time < 300 && last.half === half) {
          if (singleTapTimer.current) {
            clearTimeout(singleTapTimer.current);
            singleTapTimer.current = null;
          }
          tapRef.current = null;
          if (half === "l") {
            seekBy(-10);
            flashSeek("back");
          } else {
            seekBy(10);
            flashSeek("fwd");
          }
          showAndReset();
        } else {
          tapRef.current = { time: now, half };
          if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
          singleTapTimer.current = setTimeout(() => {
            handleTap();
            singleTapTimer.current = null;
            tapRef.current = null;
          }, 300);
        }
      },
      [SCREEN_W, handleTap, seekBy, flashSeek, showAndReset],
    );

    // 全屏手势：左半屏上下=亮度，右半屏上下=音量，左右滑=进度
    const gestRef = useRef<{
      active: boolean;
      type: "vl" | "vr" | "h" | null;
      sx: number;
      sy: number;
      startB: number;
      startV: number;
      startT: number;
      hTarget: number;
    }>({ active: false, type: null, sx: 0, sy: 0, startB: 0.5, startV: 1, startT: 0, hTarget: 0 });
    const fsPan = useRef(
      PanResponder.create({
        onStartShouldSetPanResponder: () => !lockedRef.current,
        onMoveShouldSetPanResponder: () => !lockedRef.current,
        onPanResponderGrant: (e) => {
          const g = gestRef.current;
          g.active = false;
          g.type = null;
          g.sx = e.nativeEvent.pageX;
          g.sy = e.nativeEvent.pageY;
          g.startV = volumeRef.current;
          g.startT = currentTimeRef.current;
          g.hTarget = currentTimeRef.current;
          Brightness.getBrightnessAsync()
            .then((b) => {
              g.startB = b;
            })
            .catch(() => {
              g.startB = 0.5;
            });
        },
        onPanResponderMove: (e) => {
          const g = gestRef.current;
          const dx = e.nativeEvent.pageX - g.sx;
          const dy = e.nativeEvent.pageY - g.sy;
          if (!g.active) {
            if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
            g.active = true;
            g.type =
              Math.abs(dy) > Math.abs(dx)
                ? g.sx < dimRef.current.w / 2
                  ? "vl"
                  : "vr"
                : "h";
          }
          if (g.type === "vl") {
            const b = clamp(g.startB + (-dy / dimRef.current.h) * 1.5, 0.01, 1);
            Brightness.setBrightnessAsync(b)
              .then(() => setGestureOverlay({ kind: "brightness", value: b }))
              .catch(() => {
                // Android 需要"修改系统设置"权限，被拒时只提示一次
                if (!brightDeniedRef.current) {
                  brightDeniedRef.current = true;
                  setBrightnessHint(true);
                  // BUG-L-11：定时器存 ref，卸载时清理，避免已卸载组件 setState
                  if (brightHintTimer.current) clearTimeout(brightHintTimer.current);
                  brightHintTimer.current = setTimeout(() => setBrightnessHint(false), 2500);
                }
              });
          } else if (g.type === "vr") {
            const v = clamp(g.startV + (-dy / dimRef.current.h) * 1.5, 0, 1);
            onVolumeChange(v);
            setGestureOverlay({ kind: "volume", value: v });
          } else if (g.type === "h") {
            const dur = durationRef.current;
            if (dur <= 0) return;
            const target = clamp(g.startT + (dx / dimRef.current.w) * dur, 0, dur);
            g.hTarget = target;
            setGestureOverlay({
              kind: "seek",
              target,
              delta: target - g.startT,
            });
          }
        },
        onPanResponderRelease: (e) => {
          const g = gestRef.current;
          if (g.active) {
            if (g.type === "h") {
              videoRef.current?.seek(g.hTarget);
              setCurrentTime(g.hTarget);
            }
            setGestureOverlay(null);
            showAndReset();
            g.active = false;
            g.type = null;
          } else {
            handleFsTap(e.nativeEvent.pageX);
          }
        },
        onPanResponderTerminate: () => {
          gestRef.current.active = false;
          gestRef.current.type = null;
          setGestureOverlay(null);
        },
      }),
    ).current;

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
        onStartShouldSetPanResponder: () => !lockedRef.current,
        onMoveShouldSetPanResponder: () => !lockedRef.current,
        onPanResponderGrant: (_, gs) => {
          isSeekingRef.current = true;
          setIsSeeking(true);
          setShowControls(true);
          if (hideTimer.current) clearTimeout(hideTimer.current);
          const x = clamp(gs.x0 - barOffsetX.current, 0, barWidthRef.current);
          lastSeekXRef.current = x;
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
          lastSeekXRef.current = x;
          // 关键：setValue 不触发 React 渲染，进度球/进度填充由原生层直接刷新
          touchAnimX.setValue(x);
          const now = Date.now();
          if (now - thumbThrottleRef.current >= 50) {
            thumbThrottleRef.current = now;
            updateThumbFrame(x);
          }
        },
        // 用户松开拖动，或拖动被中断（如来电），都视为结束拖动
        onPanResponderRelease: () => {
          // BUG-H-01：不用 gs.moveX（无 move 事件时无效为 0），用最后一次有效 x
          const x = clamp(
            lastSeekXRef.current,
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

    // 进度条：小窗口独占一行，全屏时嵌在"时间 / 进度条 / 时长"第一行里
    const trackView = (extraStyle?: object) => (
      <View
        ref={trackRef}
        style={[styles.trackWrapper, extraStyle]}
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
    );

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
            resizeMode={resizeMode}
            controls={false}
            paused={!!(paused || seekHackPaused)}
            rate={rate}
            volume={volume}
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
                // 云端观看历史心跳（15s 节流，fire-and-forget）
                if (nowSave - lastHeartbeatRef.current > 15000) {
                  lastHeartbeatRef.current = nowSave;
                  reportHeartbeat({
                    aid: aid ?? 0,
                    bvid,
                    cid: cid ?? 0,
                    playedTime: ct,
                    playType: 0,
                  });
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
              } else if (!initialSeekDoneRef.current && initialTime && initialTime > 0) {
                videoRef.current?.seek(initialTime);
                didSeek = true;
              }
              initialSeekDoneRef.current = true;
              if (switching) {
                setSwitching(false);
                if (switchTimeoutRef.current) {
                  clearTimeout(switchTimeoutRef.current);
                  switchTimeoutRef.current = null;
                }
              }
              // seek 后部分播放器不自动恢复播放，需短暂 paused→false 触发 prop 变化
              // 仅在确实 seek 时执行；走 seekHackPaused（不污染图标显示态），避免播放/暂停图标闪烁
              if (didSeek && !paused) {
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
            onBuffer={({ isBuffering }: { isBuffering: boolean }) =>
              setBuffering(isBuffering)
            }
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

        {/* 播放中缓冲：中央小转圈（切换浮层/封面挡片显示时不重复） */}
        {buffering && !switching && !coverVisible && (
          <View style={styles.bufferOverlay} pointerEvents="none">
            <ActivityIndicator color="#fff" size="small" />
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

        {isFullscreen ? (
          /* 全屏：手势层（单击/双击/滑动），渲染在控制栏之下 */
          <View style={StyleSheet.absoluteFill} {...fsPan.panHandlers} />
        ) : (
          <TouchableWithoutFeedback onPress={handleTap}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
        )}

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
              {isFullscreen && (
                <TouchableOpacity
                  style={styles.topBtn}
                  onPress={() => {
                    onFullscreen();
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

            {/* 全屏：返回键下方的 UP 主头像 / 昵称 / 在线人数，点击跳转 UP 主页 */}
            {isFullscreen && !!upName && (
              <TouchableOpacity
                style={styles.fsUpInfo}
                onPress={() => {
                  onUpPress?.();
                  showAndReset();
                }}
                hitSlop={8}
              >
                {!!upFace && (
                  <Image source={{ uri: upFace }} style={styles.upAvatar} />
                )}
                <View>
                  <Text style={styles.upName} numberOfLines={1}>
                    {upName}
                  </Text>
                  {!!onlineCount && onlineCount > 0 && (
                    <Text style={styles.upOnline}>
                      {formatCount(onlineCount)}人正在看
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.centerBtn}
              onPress={() => {
                onPausedChange(!paused);
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
              {isFullscreen ? (
                <>
                  {/* 第一行：当前时间 / 进度条 / 总时长 */}
                  <View style={styles.fsTimeRow}>
                    <Text style={styles.timeText}>
                      {formatDuration(Math.floor(currentTime))}
                    </Text>
                    {trackView(styles.fsTrack)}
                    <Text style={styles.timeText}>
                      {formatDuration(duration)}
                    </Text>
                  </View>
                  {/* 第二行：左暂停/上一集/下一集/弹幕，右倍速值/画质值/画面值/退出全屏 */}
                  <View style={styles.ctrlRow}>
                    <TouchableOpacity
                      onPress={() => {
                        onPausedChange(!paused);
                        showAndReset();
                      }}
                      style={styles.ctrlBtn}
                    >
                      <Ionicons
                        name={paused ? "play" : "pause"}
                        size={20}
                        color="#fff"
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        onPrevPage?.();
                        showAndReset();
                      }}
                      disabled={!hasPrevPage}
                      style={[
                        styles.ctrlBtn,
                        !hasPrevPage && styles.disabledBtn,
                      ]}
                    >
                      <Ionicons
                        name="play-skip-back"
                        size={18}
                        color="#fff"
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        onNextPage?.();
                        showAndReset();
                      }}
                      disabled={!hasNextPage}
                      style={[
                        styles.ctrlBtn,
                        !hasNextPage && styles.disabledBtn,
                      ]}
                    >
                      <Ionicons
                        name="play-skip-forward"
                        size={18}
                        color="#fff"
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.ctrlBtn}
                      onPress={() => {
                        onShowDanmakuChange(!showDanmaku);
                        showAndReset();
                      }}
                    >
                      <Ionicons
                        name={
                          showDanmaku
                            ? "chatbubbles"
                            : "chatbubbles-outline"
                        }
                        size={18}
                        color="#fff"
                      />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }} />
                    {/* 分 P 选择：多分 P 时显示当前 P/总数，紧贴倍速左边 */}
                    {(pages?.length ?? 0) > 1 && (
                      <TouchableOpacity
                        style={styles.ctrlBtn}
                        onPress={() => {
                          setShowPages(true);
                          showAndReset();
                        }}
                      >
                        <Text style={styles.qualityText}>
                          {`${(pageIndex ?? 0) + 1}/${pages!.length}`}
                        </Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.ctrlBtn}
                      onPress={() => setShowRate(true)}
                    >
                      <Text style={styles.qualityText}>{`${rate}x`}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.ctrlBtn}
                      onPress={() => setShowQuality(true)}
                    >
                      <Text style={styles.qualityText}>{currentDesc}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.ctrlBtn}
                      onPress={() => {
                        setShowResize(true);
                        showAndReset();
                      }}
                    >
                      <Text style={styles.qualityText}>
                        {RESIZE_SHORT[resizeMode]}
                      </Text>
                    </TouchableOpacity>
                    {/* 互动菜单：发弹幕 / 评论，紧贴退出全屏左边 */}
                    {onMorePress && (
                      <TouchableOpacity
                        style={styles.ctrlBtn}
                        onPress={() => {
                          onMorePress();
                          showAndReset();
                        }}
                      >
                        <Ionicons name="ellipsis-horizontal" size={18} color="#fff" />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.ctrlBtn}
                      onPress={onFullscreen}
                    >
                      <Ionicons name="contract" size={18} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  {trackView()}
                  {/* Controls */}
                  <View style={styles.ctrlRow}>
                    <TouchableOpacity
                      onPress={() => {
                        onPausedChange(!paused);
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
                    <Text style={styles.timeText}>
                      {formatDuration(duration)}
                    </Text>
                    <TouchableOpacity
                      style={styles.ctrlBtn}
                      onPress={() => setShowRate(true)}
                    >
                      <Text style={styles.qualityText}>
                        {rate === 1 ? "倍速" : `${rate}x`}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.ctrlBtn}
                      onPress={() => setShowQuality(true)}
                    >
                      <Text style={styles.qualityText}>{currentDesc}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.ctrlBtn}
                      onPress={onFullscreen}
                    >
                      <Ionicons name="expand" size={18} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </LinearGradient>
          </>
        )}

        {/* 全屏锁定键：右侧边缘，不跟随控制栏显隐，锁定时也要能点到 */}
        {isFullscreen && (
          <TouchableOpacity
            style={styles.lockBtn}
            onPress={toggleLock}
            hitSlop={10}
          >
            <Ionicons
              name={locked ? "lock-closed" : "lock-open-outline"}
              size={20}
              color="#fff"
            />
          </TouchableOpacity>
        )}

        {renderThumbnail()}

        {/* 双击快进/快退指示 */}
        {isFullscreen && seekFlash && (
          <View
            key={seekFlash.key}
            style={[
              styles.seekFlash,
              seekFlash.dir === "back" ? { left: 64 } : { right: 64 },
            ]}
            pointerEvents="none"
          >
            <Ionicons
              name={seekFlash.dir === "back" ? "arrow-undo" : "arrow-redo"}
              size={26}
              color="#fff"
            />
            <Text style={styles.seekFlashText}>
              {seekFlash.dir === "back" ? "-10秒" : "+10秒"}
            </Text>
          </View>
        )}

        {/* 手势：亮度 / 音量竖条 */}
        {isFullscreen &&
          gestureOverlay &&
          (gestureOverlay.kind === "brightness" ||
            gestureOverlay.kind === "volume") && (
            <View
              style={[
                styles.gestureBar,
                gestureOverlay.kind === "brightness"
                  ? { left: 36 }
                  : { right: 36 },
              ]}
              pointerEvents="none"
            >
              <Ionicons
                name={
                  gestureOverlay.kind === "brightness"
                    ? "sunny"
                    : gestureOverlay.value <= 0.01
                      ? "volume-mute"
                      : gestureOverlay.value < 0.5
                        ? "volume-low"
                        : "volume-high"
                }
                size={20}
                color="#fff"
              />
              <View style={styles.gestureTrack}>
                <View
                  style={[
                    styles.gestureFill,
                    { height: `${clamp(gestureOverlay.value, 0, 1) * 100}%` as any },
                  ]}
                />
              </View>
            </View>
          )}

        {/* 手势：横滑进度 */}
        {isFullscreen && gestureOverlay?.kind === "seek" && (
          <View style={styles.seekPill} pointerEvents="none">
            <Text style={styles.seekPillText}>
              {gestureOverlay.delta >= 0 ? "快进 " : "快退 "}
              {formatDuration(Math.floor(gestureOverlay.target))}
            </Text>
          </View>
        )}

        {/* 亮度权限提示 */}
        {isFullscreen && brightnessHint && (
          <View style={styles.brightHint} pointerEvents="none">
            <Text style={styles.brightHintText}>
              亮度调节需要在系统设置中允许「修改系统设置」
            </Text>
          </View>
        )}

        {/* 选画面填充模式：锚定在控制栏上方的上拉面板 */}
        {renderPanel(
          showResize,
          () => setShowResize(false),
          "画面",
          RESIZE_OPTIONS.map((o) => (
            <TouchableOpacity
              key={o.mode}
              style={[styles.qualityItem, { borderTopColor: theme.modalBorder }]}
              onPress={() => {
                onResizeModeChange(o.mode);
                setShowResize(false);
                showAndReset();
              }}
            >
              <Text
                style={[
                  styles.qualityItemText,
                  { color: theme.modalTextSub },
                  o.mode === resizeMode && styles.qualityItemActive,
                ]}
              >
                {o.label}
              </Text>
              {o.mode === resizeMode && (
                <Ionicons name="checkmark" size={16} color="#00AEEC" />
              )}
            </TouchableOpacity>
          )),
        )}

        {/* 选清晰度：锚定在控制栏上方的上拉面板 */}
        {renderPanel(
          showQuality,
          () => setShowQuality(false),
          "选择清晰度",
          qualities.map((q) => (
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
          )),
        )}

        {/* 选倍速：锚定在控制栏上方的上拉面板 */}
        {renderPanel(
          showRate,
          () => setShowRate(false),
          "选择倍速",
          RATE_OPTIONS.map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.qualityItem, { borderTopColor: theme.modalBorder }]}
              onPress={() => {
                onRateChange(r);
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
          )),
        )}

        {/* 选分 P：锚定在控制栏上方的上拉面板 */}
        {renderPanel(
          showPages,
          () => setShowPages(false),
          `分P（${pages?.length ?? 0}）`,
          <ScrollView style={{ maxHeight: 300 }}>
            {(pages ?? []).map((p, i) => (
              <TouchableOpacity
                key={p.cid}
                style={[styles.qualityItem, { borderTopColor: theme.modalBorder }]}
                onPress={() => {
                  setShowPages(false);
                  if (i !== pageIndex) onPageChange?.(i);
                  showAndReset();
                }}
              >
                <Text
                  style={[
                    styles.qualityItemText,
                    styles.pageItemText,
                    { color: theme.modalTextSub },
                    i === pageIndex && styles.qualityItemActive,
                  ]}
                  numberOfLines={1}
                >
                  {`P${i + 1} ${p.part}`}
                </Text>
                {!!p.duration && p.duration > 0 && (
                  <Text style={[styles.pageDuration, { color: theme.modalTextSub }]}>
                    {formatDuration(p.duration)}
                  </Text>
                )}
                {i === pageIndex && (
                  <Ionicons name="checkmark" size={16} color="#00AEEC" />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>,
        )}
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
  // 播放中缓冲：中央小转圈（无遮罩）
  bufferOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  // 分 P 弹窗：标题占满剩余宽度、时长靠右
  pageItemText: { flex: 1, marginRight: 8 },
  pageDuration: { fontSize: 11, marginRight: 6 },
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
  // 全屏第一行：时间 / 进度条 / 时长
  fsTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  fsTrack: {
    flex: 1,
    marginHorizontal: 8,
  },
  disabledBtn: { opacity: 0.3 },
  // 全屏右侧边缘锁定键
  lockBtn: {
    position: "absolute",
    right: 0,
    top: "50%",
    marginTop: -32,
    width: 40,
    height: 64,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  // 全屏顶栏：返回键下方的 UP 主信息，左边缘与返回箭头同列对齐
  // （topBar paddingHorizontal 12 + topBtn padding 6 = 18）
  fsUpInfo: {
    position: "absolute",
    top: 58,
    left: 18,
    flexDirection: "row",
    alignItems: "center",
  },
  upAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 7,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  upName: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    maxWidth: 200,
  },
  upOnline: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 10,
    marginTop: 1,
  },
  ctrlBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  timeText: {
    color: "#fff",
    fontSize: 11,
    marginHorizontal: 2,
    fontWeight: "600",
  },
  qualityText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  // 锚定上拉面板：盖住播放器区域，点外部关闭；面板贴在控制栏上方、按钮附近
  panelWrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 60,
    elevation: 60,
  },
  panelCard: {
    position: "absolute",
    right: 10,
    bottom: 64,
    width: 200,
    maxHeight: "78%",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
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
  // 双击快进/快退徽章
  seekFlash: {
    position: "absolute",
    top: "50%",
    marginTop: -52,
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  seekFlashText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    marginTop: 4,
  },
  // 手势亮度/音量竖条
  gestureBar: {
    position: "absolute",
    top: "50%",
    marginTop: -80,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  gestureTrack: {
    width: 5,
    height: 110,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.25)",
    marginTop: 8,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  gestureFill: {
    width: "100%",
    backgroundColor: "#00AEEC",
  },
  // 横滑进度胶囊
  seekPill: {
    position: "absolute",
    bottom: 76,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  seekPillText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  // 亮度权限提示
  brightHint: {
    position: "absolute",
    top: 64,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  brightHintText: { color: "#fff", fontSize: 12 },
});
