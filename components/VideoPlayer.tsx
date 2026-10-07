import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, StyleSheet, Text, Platform, StatusBar, BackHandler, useWindowDimensions, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
// expo-screen-orientation requires a dev build; gracefully degrade in Expo Go
let ScreenOrientation: typeof import('expo-screen-orientation') | null = null;
try { ScreenOrientation = require('expo-screen-orientation'); } catch {}
let NavigationBar: typeof import('expo-navigation-bar') | null = null;
try { NavigationBar = require('expo-navigation-bar'); } catch {}

/** 真正沉浸式：隐藏底部系统导航栏，边缘上滑可临时唤出 */
async function setImmersive(hidden: boolean) {
  try {
    if (hidden) {
      await NavigationBar?.setBehaviorAsync('overlay-swipe');
      await NavigationBar?.setVisibilityAsync('hidden');
    } else {
      await NavigationBar?.setVisibilityAsync('visible');
    }
  } catch {}
}
import { NativeVideoPlayer, type ResizeMode, type VideoPageInfo } from './NativeVideoPlayer';
import type { PlayUrlResponse, DanmakuItem } from '../services/types';
import { useTheme } from '../utils/theme';
import { BottomInputBar } from './BottomInputBar';
import { CommentPanel } from './CommentPanel';
import { toast } from '../utils/toast';

interface Props {
  playData: PlayUrlResponse | null;
  qualities: { qn: number; desc: string }[];
  currentQn: number;
  onQualityChange: (qn: number) => void;
  bvid?: string;
  cid?: number;
  danmakus?: DanmakuItem[];
  onTimeUpdate?: (t: number) => void;
  initialTime?: number;
  /** 详情页将其挂到弹幕 Sheet 的打开动作。仅小窗口生效，全屏暂不显示。 */
  onDanmakuListPress?: () => void;
  /** 播放器左上角返回按钮回调，跟随小窗口控制栏一起显隐。 */
  onBack?: () => void;
  /** 视频封面 URL。playData 未到达 / <Video> 首帧未到达时用作 poster，避免黑闪 */
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
  /** 全屏状态（由外层 [bvid] 持有，以便全屏时关掉 SafeAreaView 的 edges） */
  fullscreen: boolean;
  onFullscreenChange: (v: boolean) => void;
  /** 全屏顶栏 UP 主信息 */
  upName?: string;
  upFace?: string;
  onlineCount?: number;
  /** 点击全屏顶栏 UP 主信息：先退全屏再跳转 */
  onUpPress?: () => void;
  /** 视频 aid：全屏评论面板用 */
  aid: number;
  /** 发弹幕（竖屏/全屏共用）：成功 resolve，发送成功后调用方已把弹幕即时上屏 */
  onSendDanmaku: (msg: string) => Promise<void>;
}

export function VideoPlayer({ playData, qualities, currentQn, onQualityChange, bvid, cid, danmakus, onTimeUpdate, initialTime, onDanmakuListPress, onBack, coverUrl, onPrevPage, onNextPage, hasPrevPage, hasNextPage, pages, pageIndex, onPageChange, fullscreen, onFullscreenChange, upName, upFace, onlineCount, onUpPress, aid, onSendDanmaku }: Props) {
  const { width, height } = useWindowDimensions();
  const VIDEO_HEIGHT = width * 0.5625;
  const needsRotation = !ScreenOrientation && fullscreen;
  const lastTimeRef = useRef(0);
  const seededRef = useRef(false);
  // BUG-L-12：转屏补隐藏的定时器 id，退出全屏时清理
  const rehideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const theme = useTheme();
  // 续播：第一次拿到 initialTime 时塞进 lastTimeRef
  if (!seededRef.current && typeof initialTime === 'number' && initialTime > 0) {
    lastTimeRef.current = initialTime;
    seededRef.current = true;
  }
  // 切分 P（两个真实 cid 之间切换）时续播位置清零，新分 P 从头播；
  // 首次加载 cid 从空变有值时不重置，避免吞掉续播位置
  const cidRef = useRef(cid);
  useEffect(() => {
    if (cid && cidRef.current && cidRef.current !== cid) {
      lastTimeRef.current = 0;
    }
    cidRef.current = cid;
  }, [cid]);
  // BUG-H-03：播放控制状态上提到这里，竖屏/全屏两个 NativeVideoPlayer 实例共享，
  // 进/退全屏时暂停/倍速/音量/弹幕开关/画面模式/锁定保持一致
  const [paused, setPaused] = useState(false);
  const [rate, setRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [showDanmaku, setShowDanmaku] = useState(true);
  const [resizeMode, setResizeMode] = useState<ResizeMode>("contain");
  const [locked, setLocked] = useState(false);
  // 全屏互动：⋯ 菜单 / 弹幕输入条 / 评论侧栏
  const [moreVisible, setMoreVisible] = useState(false);
  const [fsDmInput, setFsDmInput] = useState(false);
  const [fsComments, setFsComments] = useState(false);

  const handleFsSendDanmaku = useCallback(
    async (msg: string) => {
      await onSendDanmaku(msg);
      setFsDmInput(false);
      toast("弹幕发送成功");
    },
    [onSendDanmaku],
  );

  // 退出全屏时关掉互动层，避免竖屏实例残留
  useEffect(() => {
    if (!fullscreen) {
      setMoreVisible(false);
      setFsDmInput(false);
      setFsComments(false);
    }
  }, [fullscreen]);
  // BUG-L-13：portraitRef 及 useImperativeHandle 命令式 API 经核查无任何调用方，已删除

  const handleEnterFullscreen = async () => {
    if (Platform.OS !== 'web')
      await ScreenOrientation?.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT);
    onFullscreenChange(true);
    // 命令式隐藏状态栏：_layout 里有全局 expo-status-bar，会盖掉声明式的 hidden
    StatusBar.setHidden(true, 'fade');
    await setImmersive(true);
  };

  const handleExitFullscreen = async () => {
    onFullscreenChange(false);
    StatusBar.setHidden(false, 'fade');
    await setImmersive(false);
    // 锁定是全屏专属能力：退出全屏时解锁，避免竖屏实例继承锁定态后无解锁入口
    setLocked(false);
    if (Platform.OS !== 'web')
      await ScreenOrientation?.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  };

  // 全屏状态栏隐藏：转屏（orientation 变化）会重置系统窗口的 insets 状态，
  // 把 hide 掉的状态栏重新顶出来，而且转屏落定的时机各机型不一，固定延迟盖不住。
  // 改成三保险：① pushStackEntry 让 hidden 在声明式栈里置顶（RN 官方推荐做法，
  // 退出时 pop 恢复）；② 监听转屏完成事件，落定后补一次隐藏；③ 全屏期间每 800ms
  // 兜底重申一次原生隐藏，确保状态栏不会被任何时机顶回来。
  useEffect(() => {
    if (!fullscreen) return;
    const entry = StatusBar.pushStackEntry({ hidden: true });
    const rehide = () => StatusBar.setHidden(true);
    rehide();
    // BUG-L-12：转屏补隐藏的定时器存 ref，退出全屏时清理，
    // 避免 300ms 内退出全屏后 rehide 仍执行导致竖屏状态栏被隐藏
    let orientationSub: { remove(): void } | null = null;
    try {
      orientationSub =
        ScreenOrientation?.addOrientationChangeListener(() => {
          // 转屏落定后再补一次（转屏会重置系统窗口 insets）
          if (rehideTimerRef.current) clearTimeout(rehideTimerRef.current);
          rehideTimerRef.current = setTimeout(rehide, 300);
        }) ?? null;
    } catch {}
    const timer = setInterval(rehide, 800);
    return () => {
      clearInterval(timer);
      if (rehideTimerRef.current) {
        clearTimeout(rehideTimerRef.current);
        rehideTimerRef.current = null;
      }
      try {
        orientationSub?.remove();
      } catch {}
      StatusBar.popStackEntry(entry);
    };
  }, [fullscreen]);

  // 全屏时拦截系统返回键：先退全屏，而不是直接退出页面
  useEffect(() => {
    if (!fullscreen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleExitFullscreen();
      return true;
    });
    return () => sub.remove();
  }, [fullscreen]);

  // 点击全屏顶栏 UP 主信息：先退全屏（恢复状态栏/方向），再跳转 UP 主页
  const handleUpPress = async () => {
    if (fullscreen) await handleExitFullscreen();
    onUpPress?.();
  };

  useEffect(() => {
    return () => {
      if (Platform.OS !== 'web')
        ScreenOrientation?.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      StatusBar.setHidden(false);
      setImmersive(false);
    };
  }, []);

  if (!playData) {
    // 没拿到 playData 时背景用主题色（与页面同色，消除"页面→纯黑"撞色），有封面则铺封面
    return (
      <View style={[{ width, height: VIDEO_HEIGHT, backgroundColor: theme.card }, styles.placeholder]}>
        {!!coverUrl && (
          <Image source={{ uri: coverUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
        )}
        <Text style={[styles.placeholderText, { color: coverUrl ? '#fff' : theme.textSub }]}>视频加载中...</Text>
      </View>
    );
  }

  if (Platform.OS === 'web') {
    const url = playData.durl?.[0]?.url ?? '';
    return (
      <View style={{ width, height: VIDEO_HEIGHT, backgroundColor: '#000' }}>
        <video
          src={url}
          poster={coverUrl}
          style={{ width: '100%', height: '100%', backgroundColor: '#000' } as any}
          controls
          playsInline
        />
      </View>
    );
  }

  return (
    <>
      {/* 竖屏和全屏互斥渲染，避免同时挂载两个视频解码器 */}
      {!fullscreen && (
        <NativeVideoPlayer
          playData={playData}
          qualities={qualities}
          currentQn={currentQn}
          onQualityChange={onQualityChange}
          onFullscreen={handleEnterFullscreen}
          bvid={bvid}
          cid={cid}
          aid={aid}
          isFullscreen={false}
          initialTime={lastTimeRef.current}
          onTimeUpdate={(t) => { lastTimeRef.current = t; onTimeUpdate?.(t); }}
          onDanmakuListPress={onDanmakuListPress}
          onBack={onBack}
          coverUrl={coverUrl}
          paused={paused}
          onPausedChange={setPaused}
          rate={rate}
          onRateChange={setRate}
          volume={volume}
          onVolumeChange={setVolume}
          showDanmaku={showDanmaku}
          onShowDanmakuChange={setShowDanmaku}
          resizeMode={resizeMode}
          onResizeModeChange={setResizeMode}
          locked={locked}
          onLockedChange={setLocked}
        />
      )}

      {fullscreen && (
        // 全屏层直接画在 Activity 同一窗口（不用 RN Modal）：
        // Modal 在 Android 上是独立 Dialog 窗口，有自己的状态栏控制器，
        // StatusBar.setHidden 只作用于 Activity 窗口，会被 Dialog 盖掉失效。
        // 全屏时外层 SafeAreaView 的 edges 已关掉，这里 plain absoluteFill 即真全屏。
        <View style={styles.fsOverlay}>
          <StatusBar hidden />
          <View style={needsRotation
            ? { width: height, height: width, transform: [{ rotate: '90deg' }] }
            : { flex: 1, width: '100%' }
          }>
              <NativeVideoPlayer
                playData={playData}
                qualities={qualities}
                currentQn={currentQn}
                onQualityChange={onQualityChange}
                onFullscreen={handleExitFullscreen}
                bvid={bvid}
                cid={cid}
                aid={aid}
                danmakus={danmakus}
                isFullscreen={true}
                initialTime={lastTimeRef.current}
                onTimeUpdate={(t) => { lastTimeRef.current = t; onTimeUpdate?.(t); }}
                coverUrl={coverUrl}
                onPrevPage={onPrevPage}
                onNextPage={onNextPage}
                hasPrevPage={hasPrevPage}
                hasNextPage={hasNextPage}
                pages={pages}
                pageIndex={pageIndex}
                onPageChange={onPageChange}
                upName={upName}
                upFace={upFace}
                onlineCount={onlineCount}
                onUpPress={handleUpPress}
                paused={paused}
                onPausedChange={setPaused}
                rate={rate}
                onRateChange={setRate}
                volume={volume}
                onVolumeChange={setVolume}
                showDanmaku={showDanmaku}
                onShowDanmakuChange={setShowDanmaku}
                resizeMode={resizeMode}
                onResizeModeChange={setResizeMode}
                locked={locked}
                onLockedChange={setLocked}
                onMorePress={() => setMoreVisible(true)}
                style={needsRotation ? { width: height, height: width } : { flex: 1 }}
              />
              {/* 全屏互动层：⋯ 菜单 */}
              {moreVisible && (
                <>
                  <TouchableOpacity
                    style={styles.fsMoreDim}
                    activeOpacity={1}
                    onPress={() => setMoreVisible(false)}
                  />
                  <View style={styles.fsMoreMenu}>
                    <TouchableOpacity
                      style={styles.fsMoreItem}
                      onPress={() => {
                        setMoreVisible(false);
                        setFsDmInput(true);
                      }}
                    >
                      <Ionicons name="mail-outline" size={18} color="#333" />
                      <Text style={styles.fsMoreTxt}>发弹幕</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.fsMoreItem, { borderBottomWidth: 0 }]}
                      onPress={() => {
                        setMoreVisible(false);
                        setFsComments(true);
                      }}
                    >
                      <Ionicons name="chatbubble-outline" size={18} color="#333" />
                      <Text style={styles.fsMoreTxt}>评论</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
              {/* 全屏互动层：弹幕输入条 */}
              {fsDmInput && (
                <View style={styles.fsDmBar}>
                  <BottomInputBar
                    dark
                    placeholder="发个友善的弹幕吧…"
                    onSend={handleFsSendDanmaku}
                  />
                </View>
              )}
              {/* 全屏互动层：评论侧栏 */}
              {fsComments && (
                <View style={styles.fsCommentSheet}>
                  <View style={styles.fsCommentHead}>
                    <Text style={styles.fsCommentTitle}>评论</Text>
                    <TouchableOpacity
                      onPress={() => setFsComments(false)}
                      hitSlop={8}
                      style={styles.fsCommentClose}
                    >
                      <Ionicons name="close" size={20} color="#666" />
                    </TouchableOpacity>
                  </View>
                  <CommentPanel aid={aid} showSort={false} />
                </View>
              )}
            </View>
          </View>
        )}
    </>
  );
}

const styles = StyleSheet.create({
  placeholder: { justifyContent: 'center', alignItems: 'center' },
  placeholderText: { fontSize: 14 },
  // 全屏覆盖层：同一 Activity 窗口内的绝对定位层，盖住页面一切内容
  fsOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    elevation: 999,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // 全屏 ⋯ 菜单
  fsMoreDim: { ...StyleSheet.absoluteFillObject },
  fsMoreMenu: {
    position: 'absolute',
    right: 12,
    bottom: 64,
    width: 150,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  fsMoreItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  fsMoreTxt: { fontSize: 14, color: '#333' },
  // 全屏弹幕输入条：贴底，键盘弹起时 BottomInputBar 内部上移
  fsDmBar: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  // 全屏评论侧栏
  fsCommentSheet: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 340,
    backgroundColor: '#fff',
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  fsCommentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  fsCommentTitle: { fontSize: 15, fontWeight: '700', color: '#222' },
  fsCommentClose: { position: 'absolute', right: 8, padding: 6 },
});
