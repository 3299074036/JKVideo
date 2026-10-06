import React from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Animated,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { VideoItem } from "../services/types";
import { useTheme } from "../utils/theme";
import { formatCount, formatTime } from "../utils/format";
import { useSheetTransition } from "../utils/useSheetTransition";

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Sheet 顶部对齐到屏幕的绝对 Y（一般是播放器底部） */
  topOffset: number;
  video: VideoItem | null;
}

export function DescriptionSheet({ visible, onClose, topOffset, video }: Props) {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const sheetH = Math.max(120, height - topOffset);
  const { rendered, slideAnim } = useSheetTransition(visible, sheetH);

  if (!rendered || !video) return null;
  const stat = video.stat;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Animated.View
        style={[
          styles.sheet,
          {
            top: topOffset,
            backgroundColor: theme.sheetBg,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <View style={[styles.header, { borderBottomColor: theme.modalBorder }]}>
          <Text style={[styles.headerTitle, { color: theme.modalText }]}>简介</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={8}>
            <Ionicons name="close" size={22} color={theme.modalTextSub} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={[styles.title, { color: theme.modalText }]}>{video.title}</Text>

          {!!video.tname && (
            <View style={styles.tnameBadge}>
              <Text style={styles.tnameText}>{video.tname}</Text>
            </View>
          )}

          {!!video.pubdate && (
            <Text style={[styles.pubdate, { color: theme.modalTextSub }]}>
              发布于 {formatTime(video.pubdate)}
            </Text>
          )}

          {!!stat && (
            <View style={styles.statGrid}>
              <StatCell label="播放" value={stat.view} theme={theme} />
              <StatCell label="弹幕" value={stat.danmaku} theme={theme} />
              <StatCell label="评论" value={stat.reply} theme={theme} />
              <StatCell label="点赞" value={stat.like} theme={theme} />
              <StatCell label="投币" value={stat.coin} theme={theme} />
              <StatCell label="收藏" value={stat.favorite} theme={theme} />
            </View>
          )}

          <View style={[styles.descDivider, { backgroundColor: theme.modalBorder }]} />

          <Text style={[styles.descText, { color: theme.modalText }]}>
            {video.desc?.trim() || "暂无简介"}
          </Text>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

function StatCell({
  label,
  value,
  theme,
}: {
  label: string;
  value: number;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statValue, { color: theme.modalText }]}>
        {formatCount(value ?? 0)}
      </Text>
      <Text style={[styles.statLabel, { color: theme.modalTextSub }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 16, fontWeight: "700" },
  closeBtn: { padding: 4 },
  body: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 17, fontWeight: "700", lineHeight: 24, marginBottom: 10 },
  tnameBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(0,174,236,0.12)",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 10,
  },
  tnameText: { fontSize: 12, color: "#00AEEC" },
  pubdate: { fontSize: 12, marginBottom: 14 },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginVertical: 4,
  },
  statCell: { width: "33.333%", alignItems: "center", paddingVertical: 8 },
  statValue: { fontSize: 15, fontWeight: "700" },
  statLabel: { fontSize: 11, marginTop: 2 },
  descDivider: { height: StyleSheet.hairlineWidth, marginVertical: 16 },
  descText: { fontSize: 14, lineHeight: 22 },
});
