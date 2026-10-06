import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, Text, Platform, Modal, StatusBar, useWindowDimensions } from 'react-native';
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
import { NativeVideoPlayer, type NativeVideoPlayerRef } from './NativeVideoPlayer';
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
  /** 全屏顶栏 UP 主信息 */
  upName?: string;
  upFace?: string;
  onlineCount?: number;
}

export function VideoPlayer({ playData, qualities, currentQn, onQualityChange, bvid, cid, danmakus, onTimeUpdate, initialTime, onDanmakuListPress, onBack, coverUrl, onPrevPage, onNextPage, hasPrevPage, hasNextPage, upName, upFace, onlineCount }: Props) {
  const [fullscreen, setFullscreen] = useState(false);
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
    setFullscreen(true);
    // 命令式隐藏状态栏：_layout 里有全局 expo-status-bar，会盖掉声明式的 hidden
    StatusBar.setHidden(true, 'fade');
    await setImmersive(true);
  };

  const handleExitFullscreen = async () => {
    setFullscreen(false);
    StatusBar.setHidden(false, 'fade');
    await setImmersive(false);
    if (Platform.OS !== 'web')
      await ScreenOrientation?.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
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
        <Modal visible animationType="none" statusBarTranslucent>
          <StatusBar hidden />
          <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
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
                upName={upName}
                upFace={upFace}
                onlineCount={onlineCount}
                style={needsRotation ? { width: height, height: width } : { flex: 1 }}
              />
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  placeholder: { justifyContent: 'center', alignItems: 'center' },
  placeholderText: { fontSize: 14 },
});
