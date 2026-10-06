import React from 'react';
import { View, Text, Image, StyleSheet, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useVideoStore } from '../store/videoStore';
import { proxyImageUrl } from '../utils/imageUrl';
import { useMiniDrag } from '../hooks/useMiniDrag';

const MINI_W = 160;
const MINI_H = 90;

export function MiniPlayer() {
  const { isActive, bvid, title, cover, clearVideo } = useVideoStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { pan, panHandlers } = useMiniDrag({
    width: MINI_W,
    height: MINI_H,
    hitClose: (x, y) => x > MINI_W - 28 && y < 28,
    onTap: () => router.push(`/video/${bvid}` as any),
    onClose: clearVideo,
  });

  if (!isActive) return null;

  const bottomOffset = insets.bottom + 16;

  return (
    <Animated.View
      style={[styles.container, { bottom: bottomOffset, transform: pan.getTranslateTransform() }]}
      {...panHandlers}
    >
      <Image source={{ uri: proxyImageUrl(cover) }} style={styles.cover} />
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      {/* 关闭按钮仅作视觉展示，点击逻辑由 hitClose 坐标判断处理 */}
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
  cover: { width: '100%', height: 64, backgroundColor: '#333' },
  title: {
    color: '#fff',
    fontSize: 11,
    paddingHorizontal: 6,
    paddingVertical: 4,
    lineHeight: 14,
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
