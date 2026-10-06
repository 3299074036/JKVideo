import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLiveStore } from '../store/liveStore';
import { useVideoStore } from '../store/videoStore';
import { proxyImageUrl } from '../utils/imageUrl';
import { useMiniDrag } from '../hooks/useMiniDrag';

const MINI_W = 160;
const MINI_H = 90;

const LIVE_HEADERS = {
  Referer: 'https://live.bilibili.com',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

export function LiveMiniPlayer() {
  const { isActive, roomId, title, cover, hlsUrl, clearLive } = useLiveStore();
  const videoMiniActive = useVideoStore(s => s.isActive);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // 关闭时先把 Video 暂停一帧，让 native 释放连接，再 unmount
  const [paused, setPaused] = useState(false);

  // 切换到不同直播间时重置 paused
  useEffect(() => {
    if (isActive) setPaused(false);
  }, [hlsUrl, isActive]);

  const { pan, panHandlers } = useMiniDrag({
    width: MINI_W,
    height: MINI_H,
    hitClose: (x, y) => x > MINI_W - 28 && y < 28,
    onTap: () => router.push(`/live/${roomId}` as any),
    onClose: () => {
      setPaused(true);
      requestAnimationFrame(() => clearLive());
    },
  });

  if (!isActive) return null;

  const bottomOffset = insets.bottom + 16 + (videoMiniActive ? 106 : 0);

  // Web 端降级：封面图 + LIVE 徽标
  if (Platform.OS === 'web') {
    return (
      <Animated.View
        style={[styles.container, { bottom: bottomOffset, transform: pan.getTranslateTransform() }]}
        {...panHandlers}
      >
        <Image source={{ uri: proxyImageUrl(cover) }} style={styles.videoArea} />
        <View style={styles.liveBadge} pointerEvents="none">
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
        <Text style={styles.titleText} numberOfLines={1}>{title}</Text>
        <View style={styles.closeBtn}>
          <Ionicons name="close" size={14} color="#fff" />
        </View>
      </Animated.View>
    );
  }

  // Native：实际 HLS 流播放
  const Video = require('react-native-video').default;

  return (
    <Animated.View
      style={[styles.container, { bottom: bottomOffset, transform: pan.getTranslateTransform() }]}
      {...panHandlers}
    >
      {/* pointerEvents="none" 防止 Video 原生层吞噬触摸事件 */}
      <View style={styles.videoArea} pointerEvents="none">
        <Video
          key={hlsUrl}
          source={{ uri: hlsUrl, headers: LIVE_HEADERS }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          controls={false}
          muted={false}
          paused={paused}
          repeat={false}
          onError={clearLive}
        />
      </View>
      <View style={styles.liveBadge} pointerEvents="none">
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>LIVE</Text>
      </View>
      <Text style={styles.titleText} numberOfLines={1}>{title}</Text>
      {/* 关闭按钮视觉层，点击逻辑由 hitClose 坐标判断 */}
      <View style={styles.closeBtn}>
        <Ionicons name="close" size={14} color="#fff" />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 12,
    width: MINI_W,
    height: MINI_H,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  videoArea: {
    width: '100%',
    height: 66,
    backgroundColor: '#111',
  },
  liveBadge: {
    position: 'absolute',
    top: 4,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    gap: 3,
  },
  liveDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#f00' },
  liveText: { color: '#fff', fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  titleText: {
    color: '#fff',
    fontSize: 11,
    paddingHorizontal: 6,
    paddingVertical: 3,
    lineHeight: 14,
    height: 24,
    backgroundColor: '#1a1a1a',
  },
  closeBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
