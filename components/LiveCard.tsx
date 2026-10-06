import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LivePulse } from "./LivePulse";
import type { LiveRoom } from "../services/types";
import { formatCount } from "../utils/format";
import { proxyImageUrl } from "../utils/imageUrl";
import { useTheme } from "../utils/theme";

const { width } = Dimensions.get("window");
const CARD_WIDTH = (width - 14) / 2;

interface Props {
  item: LiveRoom;
  isLivePulse?: Boolean;
  onPress?: () => void;
  fullWidth?: boolean;
}

export const LiveCard = React.memo(function LiveCard({
  item,
  onPress,
  fullWidth,
  isLivePulse = false,
}: Props) {
  const cardWidth = fullWidth ? width - 8 : CARD_WIDTH;
  const theme = useTheme();
  return (
    <TouchableOpacity
      style={[styles.card, { width: cardWidth, backgroundColor: theme.card }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.thumbContainer}>
        <Image
          source={{ uri: proxyImageUrl(item.cover) }}
          style={[styles.thumb, { width: cardWidth, height: cardWidth * 0.5625, backgroundColor: theme.card }]}
          contentFit="cover"
          recyclingKey={String(item.roomid)}
          transition={200}
        />
        <View style={styles.liveBadge}>
          {isLivePulse && <LivePulse />}
          <Text style={styles.liveBadgeText}>直播</Text>
        </View>
        <View style={styles.meta}>
          <Ionicons name="people" size={11} color="#fff" />
          <Text style={styles.metaText}>{formatCount(item.online)}</Text>
        </View>
        <View style={styles.areaBadge}>
          <Text style={styles.areaText}>{item.area_name}</Text>
        </View>
      </View>
      <View style={styles.info}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.ownerRow}>
          <Image
            source={{ uri: proxyImageUrl(item.face) }}
            style={styles.avatar}
            contentFit="cover"
            recyclingKey={`face-${item.roomid}`}
          />
          <Text
            style={[styles.owner, { color: theme.textSub }]}
            numberOfLines={1}
          >
            {item.uname}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    marginBottom: 6,
    backgroundColor: "#fff",
    borderRadius: 6,
    overflow: "hidden",
  },
  thumbContainer: { position: "relative" },
  thumb: {
    width: CARD_WIDTH,
    height: CARD_WIDTH * 0.5625,
    backgroundColor: "#ddd",
  },
  liveBadge: {
    position: "absolute",
    top: 4,
    left: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  liveBadgeText: { color: "#fff", fontSize: 9, fontWeight: "400" },
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
  areaBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  areaText: { color: "#fff", fontSize: 9 },
  info: { padding: 6 },
  title: {
    fontSize: 12,
    lineHeight: 17,
    minHeight: 40,
    color: "#212121",
    marginBottom: 4,
  },
  ownerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  avatar: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#eee",
  },
  owner: { fontSize: 11, color: "#999", flex: 1 },
});
