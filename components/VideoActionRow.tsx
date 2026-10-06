import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../utils/theme";
import { formatCount } from "../utils/format";
import { toast } from "../utils/toast";

interface Props {
  /** 视频统计：点赞/投币/收藏/评论数。读不到时按钮下方不显示数字。 */
  stat?: {
    like: number;
    coin: number;
    favorite: number;
    reply?: number;
  } | null;
  /** 已加载的弹幕条数（拿不到时按钮显示纯文字"弹幕"）。 */
  danmakuCount?: number;
  /** 分享时显示的视频标题。 */
  title?: string;
  /** 分享时附带的链接（一般是 https://www.bilibili.com/video/BVxxx）。 */
  shareUrl?: string;
  onDownload: () => void;
  onComments: () => void;
  onDanmaku: () => void;
}

export const VideoActionRow = React.memo(function VideoActionRow({
  stat,
  danmakuCount,
  title,
  shareUrl,
  onDownload,
  onComments,
  onDanmaku,
}: Props) {
  const theme = useTheme();

  const handleShare = async () => {
    if (!shareUrl) {
      toast("暂无分享链接");
      return;
    }
    try {
      await Share.share({
        message: title ? `${title}\n${shareUrl}` : shareUrl,
        url: shareUrl,
      });
    } catch {
      // 用户取消或系统拒绝，无需处理
    }
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {/* <Btn
        icon="thumbs-up-outline"
        label={stat?.like ? formatCount(stat.like) : "点赞"}
        onPress={() => toast("暂未实现")}
        color={theme.text}
        bg={theme.inputBg}
      /> */}
      {/* <Btn
        icon="thumbs-down-outline"
        label="不喜欢"
        onPress={() => toast("暂未实现")}
        color={theme.text}
        bg={theme.inputBg}
      /> */}
      <Btn
        icon="chatbubble-outline"
        label={stat?.reply ? formatCount(stat.reply) : "评论"}
        onPress={onComments}
        color={theme.text}
        bg={theme.inputBg}
      />
      <Btn
        icon="chatbox-ellipses-outline"
        label={danmakuCount ? formatCount(danmakuCount) : "弹幕"}
        onPress={onDanmaku}
        color={theme.text}
        bg={theme.inputBg}
      />
      {/* <Btn
        icon="logo-bitcoin"
        label={stat?.coin ? formatCount(stat.coin) : "投币"}
        onPress={() => toast("暂未实现")}
        color={theme.text}
        bg={theme.inputBg}
      /> */}
      <Btn
        icon="cloud-download-outline"
        label="下载"
        onPress={onDownload}
        color={theme.text}
        bg={theme.inputBg}
      />
      <Btn
        icon="arrow-redo-outline"
        label="分享"
        onPress={handleShare}
        color={theme.text}
        bg={theme.inputBg}
      />
      <Btn
        icon="star-outline"
        label={stat?.favorite ? formatCount(stat.favorite) : "收藏"}
        onPress={() => toast("暂未实现")}
        color={theme.text}
        bg={theme.inputBg}
      />
    </ScrollView>
  );
});

function Btn({
  icon,
  label,
  onPress,
  color,
  bg,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  color: string;
  bg: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.btn, { backgroundColor: bg }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[styles.btnLabel, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
  },
  btnLabel: { fontSize: 13, fontWeight: "600" },
});
