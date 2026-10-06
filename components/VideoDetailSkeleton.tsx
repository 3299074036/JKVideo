import React, { useEffect, useRef, memo } from "react";
import { View, StyleSheet, Animated } from "react-native";
import { useTheme } from "../utils/theme";

// 性能优化：颜色由顶层 useTheme 一次拿到，所有 block 走 inline style，避免 40+ store 订阅。
// 布局：与详情页 ListHeaderComponent 结构同步 ——
//   标题块 → Meta 行 → 动作按钮行 → 创作者行 → 推荐视频标题 → 推荐卡片

interface BlockProps {
  width: number | `${number}%`;
  height: number;
  radius?: number;
  bg: string;
  style?: any;
}

const SkeletonBlock = memo(function SkeletonBlock({ width, height, radius = 4, bg, style }: BlockProps) {
  return (
    <View
      style={[
        { width, height, borderRadius: radius, backgroundColor: bg },
        style,
      ]}
    />
  );
});

const RelatedCardSkeleton = memo(function RelatedCardSkeleton({ bg, border }: { bg: string; border: string }) {
  return (
    <View style={[styles.card, { borderBottomColor: border }]}>
      <SkeletonBlock width={120} height={68} radius={4} bg={bg} />
      <View style={styles.cardInfo}>
        <View>
          <SkeletonBlock width={"100%"} height={12} bg={bg} />
          <SkeletonBlock width={"70%"} height={12} bg={bg} style={{ marginTop: 6 }} />
        </View>
        <View style={styles.cardMeta}>
          <SkeletonBlock width={70} height={10} bg={bg} />
          <SkeletonBlock width={50} height={10} bg={bg} />
        </View>
      </View>
    </View>
  );
});

// 一个动作按钮占位（pill 形状，匹配 VideoActionRow 实际按钮形态）
const ActionPillSkeleton = memo(function ActionPillSkeleton({ bg, width }: { bg: string; width: number }) {
  return <SkeletonBlock width={width} height={28} radius={14} bg={bg} />;
});

const CARD_COUNT = 4;

export function VideoDetailSkeleton() {
  const theme = useTheme();
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.6, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  const bg = theme.placeholder;
  const border = theme.border;

  return (
    <Animated.View style={[styles.container, { backgroundColor: theme.card, opacity }]}>
      {/* 标题块（两行） + Meta 行 */}
      <View style={styles.titleBlock}>
        <SkeletonBlock width={"92%"} height={16} bg={bg} />
        <SkeletonBlock width={"60%"} height={16} bg={bg} style={{ marginTop: 8 }} />
        <SkeletonBlock width={"75%"} height={12} bg={bg} style={{ marginTop: 10 }} />
      </View>

      {/* 动作按钮行 */}
      <View style={[styles.actionRow, { borderTopColor: border }]}>
        <ActionPillSkeleton bg={bg} width={72} />
        <ActionPillSkeleton bg={bg} width={72} />
        <ActionPillSkeleton bg={bg} width={72} />
        <ActionPillSkeleton bg={bg} width={72} />
        <ActionPillSkeleton bg={bg} width={72} />
      </View>

      {/* 创作者行 + 关注按钮 */}
      <View style={[styles.creatorRow, { borderTopColor: border, borderBottomColor: border }]}>
        <SkeletonBlock width={38} height={38} radius={19} bg={bg} />
        <View style={styles.creatorInfo}>
          <SkeletonBlock width={120} height={14} bg={bg} />
          <SkeletonBlock width={160} height={11} bg={bg} style={{ marginTop: 6 }} />
        </View>
        <SkeletonBlock width={56} height={28} radius={14} bg={bg} />
      </View>

      {/* 推荐视频标题 */}
      <View style={styles.relatedHeader}>
        <SkeletonBlock width={64} height={13} bg={bg} />
      </View>

      {/* 推荐卡片占位（4 张足够撑满首屏，少绘制开销） */}
      {Array.from({ length: CARD_COUNT }).map((_, i) => (
        <RelatedCardSkeleton key={i} bg={bg} border={border} />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  titleBlock: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12 },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  creatorRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  creatorInfo: { flex: 1, marginLeft: 10 },
  relatedHeader: {
    paddingLeft: 13,
    paddingTop: 12,
    paddingBottom: 8,
  },
  card: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  cardInfo: { flex: 1, justifyContent: "space-between", paddingVertical: 2 },
  cardMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
});
