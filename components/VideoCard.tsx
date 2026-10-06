import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import type { VideoItem } from "../services/types";
import { formatCount, formatDuration } from "../utils/format";
import { coverImageUrl } from "../utils/imageUrl";
import { useSettingsStore } from "../store/settingsStore";
import { useTheme } from "../utils/theme";

export const VideoCard = React.memo(function VideoCard({
  item,
  onPress,
}: Props) {
  // 旋转后实时跟随当前窗口宽度（原模块顶层 Dimensions 快照会过期）
  const { width } = useWindowDimensions();
  const CARD_WIDTH = (width - 14) / 2;
  const trafficSaving = useSettingsStore((s) => s.trafficSaving);
  const theme = useTheme();
  return (
    <TouchableOpacity
      style={[styles.card, { width: CARD_WIDTH, backgroundColor: theme.card }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.thumbContainer}>
        <Image
          source={{
            uri: coverImageUrl(item.pic, trafficSaving ? "normal" : "hd"),
          }}
          style={[
            styles.thumb,
            {
              width: CARD_WIDTH,
              height: CARD_WIDTH * 0.5625,
              backgroundColor: theme.card,
            },
          ]}
          contentFit="cover"
          transition={200}
          recyclingKey={item.bvid}
        />
        <View style={styles.meta}>
          <Ionicons name="play" size={11} color="#fff" />
          <Text style={styles.metaText}>
            {formatCount(item.stat?.view ?? 0)}
          </Text>
        </View>
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>
            {formatDuration(item.duration)}
          </Text>
        </View>
      </View>
      <View style={styles.info}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
          {item.title}
        </Text>
        <Text
          style={[styles.owner, { color: theme.textSub }]}
          numberOfLines={1}
        >
          {item.owner?.name ?? ""}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    marginBottom: 6,
    backgroundColor: "#fff",
    borderRadius: 10,
    overflow: "hidden",
  },
  thumbContainer: { position: "relative" },
  thumb: {
    backgroundColor: "#ddd",
  },
  durationBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  durationText: { color: "#fff", fontSize: 9 },
  info: { padding: 6 },
  title: {
    fontSize: 12,
    lineHeight: 17,
    minHeight: 40,
    color: "#212121",
    marginBottom: 4,
  },
  owner: { fontSize: 11, color: "#999", marginTop: 2 },
  meta: {
    position: "absolute",
    bottom: 4,
    left: 4,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  metaText: { fontSize: 9, color: "#fff" },
});
