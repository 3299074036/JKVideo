import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, Text, Platform, Modal, StatusBar, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
// expo-screen-orientation requires a dev build; gracefully degrade in Expo Go
let ScreenOrientation: typeof import('expo-screen-orientation') | null = null;
try { ScreenOrientation = require('expo-screen-orientation'); } catch {}
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
}

export function VideoPlayer({ playData, qualities, currentQn, onQualityChange, bvid, cid, danmakus, onTimeUpdate, initialTime, onDanmakuListPress, onBack, coverUrl }: Props) {
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
  const portraitRef = useRef<NativeVideoPlayerRef>(null);

  const handleEnterFullscreen = async () => {
    if (Platform.OS !== 'web')
      await ScreenOrientation?.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT);
    setFullscreen(true);
  };

  const handleExitFullscreen = async () => {
    setFullscreen(false);
    if (Platform.OS !== 'web')
      await ScreenOrientation?.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  };

  useEffect(() => {
    return () => {
      if (Platform.OS !== 'web')
        ScreenOrientation?.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
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
