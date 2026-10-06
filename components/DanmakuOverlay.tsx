import React, { useRef, useEffect, useState, useCallback, memo } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { DanmakuItem } from '../services/types';
import { danmakuColorToCss } from '../utils/danmaku';

interface Props {
  danmakus: DanmakuItem[];
  currentTime: number;
  screenWidth: number;
  screenHeight: number;
  visible: boolean;
}

// ─── 配置 ───────────────────────────────────────────────────────────────────
// 字体上限（小一点更接近 PC B 站手感）
const FONT_MAX = 16;
// 单条车道高度
const LANE_H = 22;
// 横向车道数
const LANE_COUNT = 6;
// 同屏弹幕上限
const MAX_ACTIVE = 80;
// activated 集合阈值，触达后整体清零防止内存膨胀
const ACTIVATED_LIMIT = 1000;
// 滚动恒定速度（像素 / 秒）—— 长文走得久，视觉上速度一致
const SCROLL_PX_PER_SEC = 160;
// 入/出场淡入淡出时长
const FADE_MS = 200;

// 估算文本像素宽度。中文等表意字符按 1.0x fontSize，ASCII 按 0.55x。
function estimateTextWidth(text: string, fontSize: number): number {
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 0x2e80) w += fontSize;
    else w += fontSize * 0.55;
  }
  return w;
}

interface ActiveDanmaku {
  id: string;
  item: DanmakuItem;
  lane: number;
  fontSize: number;
  tx: Animated.Value;
  opacity: Animated.Value;
}

// ─── 单条弹幕 ──────────────────────────────────────────────────────────────
// React.memo：新弹幕加入触发父级 re-render 时，旧弹幕不会重新走 JSX。
// 由于 Animated.Value 的引用稳定、其他 props 也都是值类型，自然能命中浅比较。
const DanmakuLine = memo(
  function DanmakuLine({
    d,
    screenHeight,
  }: {
    d: ActiveDanmaku;
    screenHeight: number;
  }) {
    const isScrolling = d.item.mode === 1;
    const isTop = d.item.mode === 5;
    return (
      <Animated.Text
        style={{
          position: 'absolute',
          top: isScrolling
            ? 16 + d.lane * LANE_H
            : isTop
            ? 16
            : screenHeight - 36,
          left: isScrolling ? 0 : undefined,
          alignSelf: !isScrolling ? 'center' : undefined,
          transform: isScrolling ? [{ translateX: d.tx }] : [],
          opacity: d.opacity,
          color: danmakuColorToCss(d.item.color),
          fontSize: d.fontSize,
          fontWeight: '700',
          // 描边：1px 偏移 + radius 0，避免模糊带来的额外栅格化
          textShadowColor: 'rgba(0,0,0,0.9)',
          textShadowOffset: { width: 1, height: 1 },
          textShadowRadius: 0,
        }}
      >
        {d.item.text}
      </Animated.Text>
    );
  },
  (prev, next) => prev.d === next.d && prev.screenHeight === next.screenHeight,
);

export default function DanmakuOverlay({
  danmakus,
  currentTime,
  screenWidth,
  screenHeight,
  visible,
}: Props) {
  const [activeDanmakus, setActiveDanmakus] = useState<ActiveDanmaku[]>([]);
  const laneAvailAt = useRef<number[]>(new Array(LANE_COUNT).fill(0));
  const activated = useRef<Set<string>>(new Set());
  const prevTimeRef = useRef<number>(currentTime);
  const idCounter = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const pickLane = useCallback((): number | null => {
    const now = Date.now();
    for (let i = 0; i < LANE_COUNT; i++) {
      if (laneAvailAt.current[i] <= now) return i;
    }
    return null;
  }, []);

  useEffect(() => {
    activated.current.clear();
    laneAvailAt.current.fill(0);
    setActiveDanmakus([]);
  }, [danmakus]);

  useEffect(() => {
    if (!visible) return;

    const prevTime = prevTimeRef.current;
    const didSeek = Math.abs(currentTime - prevTime) > 2;
    prevTimeRef.current = currentTime;

    if (didSeek) {
      activated.current.clear();
      laneAvailAt.current.fill(0);
      setActiveDanmakus([]);
      return;
    }

    const window = 0.4;
    const candidates = danmakus.filter((d) => {
      const key = `${d.time}_${d.text}`;
      return (
        d.time >= currentTime - window &&
        d.time <= currentTime + window &&
        !activated.current.has(key)
      );
    });

    if (candidates.length === 0) return;

    if (activated.current.size > ACTIVATED_LIMIT) {
      activated.current.clear();
      idCounter.current = 0;
    }

    const newItems: ActiveDanmaku[] = [];

    for (const item of candidates) {
      const key = `${item.time}_${item.text}`;
      activated.current.add(key);

      const fontSize = Math.min(item.fontSize || 18, FONT_MAX);

      if (item.mode === 1) {
        const lane = pickLane();
        if (lane === null) continue;

        const textWidth = estimateTextWidth(item.text, fontSize);
        const totalDistance = screenWidth + textWidth + 20;
        // 恒定速度：duration 由文本长度推导，长文走久一点，视觉速度统一
        const duration = (totalDistance / SCROLL_PX_PER_SEC) * 1000;
        // 车道何时可被复用：尾巴扫过屏幕右边沿即可，与 duration 解耦
        const laneFreeMs = (textWidth / SCROLL_PX_PER_SEC) * 1000;
        laneAvailAt.current[lane] = Date.now() + laneFreeMs;

        const tx = new Animated.Value(screenWidth);
        const opacity = new Animated.Value(0);
        const id = `d_${idCounter.current++}`;

        newItems.push({ id, item, lane, fontSize, tx, opacity });

        // 入场淡入
        Animated.timing(opacity, {
          toValue: 1,
          duration: FADE_MS,
          useNativeDriver: true,
        }).start();

        // 滚动主动画（线性，视觉速度恒定）
        Animated.timing(tx, {
          toValue: -textWidth - 20,
          duration,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (!mountedRef.current) return;
          if (!finished) {
            setActiveDanmakus((prev) => prev.filter((d) => d.id !== id));
            return;
          }
          // 滚到尽头前已经看不到了，直接移除即可（避免重叠淡出动画）
          setActiveDanmakus((prev) => prev.filter((d) => d.id !== id));
        });

        // 临近终点淡出：duration - FADE_MS 后开始
        Animated.sequence([
          Animated.delay(Math.max(0, duration - FADE_MS)),
          Animated.timing(opacity, {
            toValue: 0,
            duration: FADE_MS,
            useNativeDriver: true,
          }),
        ]).start();
      } else {
        // 固定位置（4=底, 5=顶）
        const opacity = new Animated.Value(0);
        const id = `d_${idCounter.current++}`;
        newItems.push({
          id,
          item,
          lane: -1,
          fontSize,
          tx: new Animated.Value(0),
          opacity,
        });

        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 1,
            duration: FADE_MS,
            useNativeDriver: true,
          }),
          Animated.delay(2200),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ]).start(() => {
          if (mountedRef.current) {
            setActiveDanmakus((prev) => prev.filter((d) => d.id !== id));
          }
        });
      }
    }

    if (newItems.length > 0) {
      setActiveDanmakus((prev) => {
        const combined = [...prev, ...newItems];
        return combined.slice(Math.max(0, combined.length - MAX_ACTIVE));
      });
    }
  }, [currentTime, visible, danmakus, pickLane, screenWidth]);

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {activeDanmakus.map((d) => (
        <DanmakuLine key={d.id} d={d} screenHeight={screenHeight} />
      ))}
    </View>
  );
}
