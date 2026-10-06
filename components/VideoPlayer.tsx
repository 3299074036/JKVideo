import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, Text, Platform, StatusBar, BackHandler, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
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
import { NativeVideoPlayer, type NativeVideoPlayerRef, type VideoPageInfo } from './NativeVideoPlayer';
import type { PlayUrlResponse, DanmakuItem } from '../services/types';
import { useTheme } from '../utils/theme';

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
}

export function VideoPlayer({ playData, qualities, currentQn, onQualityChange, bvid, cid, danmakus, onTimeUpdate, initialTime, onDanmakuListPress, onBack, coverUrl, onPrevPage, onNextPage, hasPrevPage, hasNextPage, pages, pageIndex, onPageChange, fullscreen, onFullscreenChange, upName, upFace, onlineCount, onUpPress }: Props) {
  const { width, height } = useWindowDimensions();
  const VIDEO_HEIGHT = width * 0.5625;
  const needsRotation = !ScreenOrientation && fullscreen;
  const lastTimeRef = useRef(0);
  const seededRef = useRef(false);
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
  const portraitRef = useRef<NativeVideoPlayerRef>(null);

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
    let orientationSub: { remove(): void } | null = null;
    try {
      orientationSub =
        ScreenOrientation?.addOrientationChangeListener(() => {
          // 转屏落定后再补一次（转屏会重置系统窗口 insets）
          setTimeout(rehide, 300);
        }) ?? null;
    } catch {}
    const timer = setInterval(rehide, 800);
    return () => {
      clearInterval(timer);
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
          ref={portraitRef}
          playData={playData}
          qualities={qualities}
          currentQn={currentQn}
          onQualityChange={onQualityChange}
          onFullscreen={handleEnterFullscreen}
          bvid={bvid}
          cid={cid}
          isFullscreen={false}
          initialTime={lastTimeRef.current}
          onTimeUpdate={(t) => { lastTimeRef.current = t; onTimeUpdate?.(t); }}
          onDanmakuListPress={onDanmakuListPress}
          onBack={onBack}
          coverUrl={coverUrl}
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
                style={needsRotation ? { width: height, height: width } : { flex: 1 }}
              />
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
});
