import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Animated,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DanmakuList from "./DanmakuList";
import { CommentPanel } from "./CommentPanel";
import { BottomInputBar } from "./BottomInputBar";
import { useTheme } from "../utils/theme";
import { formatCount } from "../utils/format";
import { useSheetTransition } from "../utils/useSheetTransition";
import { toast } from "../utils/toast";
import type { DanmakuItem } from "../services/types";

export type EngagementTab = "comments" | "danmaku";

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Sheet 顶部对齐到屏幕的绝对 Y（一般是播放器底部） */
  topOffset: number;
  initialTab: EngagementTab;
  aid: number;
  replyCount?: number;
  danmakus: DanmakuItem[];
  currentTime: number;
  /** 发弹幕：成功 resolve，调用方负责把弹幕即时上屏 */
  onSendDanmaku: (msg: string) => Promise<void>;
}

export function EngagementSheet({
  visible,
  onClose,
  topOffset,
  initialTab,
  aid,
  replyCount,
  danmakus,
  currentTime,
  onSendDanmaku,
}: Props) {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const sheetH = Math.max(120, height - topOffset);
  const { rendered, slideAnim } = useSheetTransition(visible, sheetH);

  const [tab, setTab] = useState<EngagementTab>(initialTab);

  // 每次打开根据外部 initialTab 切到对应 Tab
  useEffect(() => {
    if (visible) setTab(initialTab);
  }, [visible, initialTab]);

  const handleSendDanmaku = useCallback(
    async (msg: string) => {
      await onSendDanmaku(msg);
      toast("弹幕发送成功");
    },
    [onSendDanmaku],
  );

  if (!rendered) return null;

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
        {/* Tab 栏 + 关闭按钮 */}
        <View style={[styles.tabBar, { borderBottomColor: theme.modalBorder }]}>
          {(["comments", "danmaku"] as EngagementTab[]).map((t) => {
            const label =
              t === "comments"
                ? `评论${replyCount ? ` ${formatCount(replyCount)}` : ""}`
                : `弹幕${danmakus.length ? ` ${formatCount(danmakus.length)}` : ""}`;
            const active = tab === t;
            return (
              <TouchableOpacity
                key={t}
                style={styles.tabItem}
                onPress={() => setTab(t)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    { color: theme.modalTextSub },
                    active && { color: theme.modalText, fontWeight: "700" },
                  ]}
                >
                  {label}
                </Text>
                {active && <View style={styles.tabUnderline} />}
              </TouchableOpacity>
            );
          })}
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={8}>
            <Ionicons name="close" size={22} color={theme.modalTextSub} />
          </TouchableOpacity>
        </View>

        {/* 评论 Tab */}
        {tab === "comments" && <CommentPanel aid={aid} />}

        {/* 弹幕 Tab —— hideHeader=true 让弹幕列表填满，header 由本 Sheet 顶部 Tab 提供 */}
        {tab === "danmaku" && (
          <View style={styles.danmakuWrap}>
            <DanmakuList
              danmakus={danmakus}
              currentTime={currentTime}
              visible
              onToggle={() => {}}
              hideHeader
              style={styles.danmakuList}
            />
            <BottomInputBar placeholder="发个友善的弹幕吧…" onSend={handleSendDanmaku} />
          </View>
        )}
      </Animated.View>
    </Modal>
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
  tabBar: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 4,
  },
  tabItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    position: "relative",
    alignItems: "center",
  },
  tabLabel: { fontSize: 14 },
  tabUnderline: {
    position: "absolute",
    bottom: 0,
    left: 14,
    right: 14,
    height: 2,
    backgroundColor: "#00AEEC",
    borderRadius: 1,
  },
  closeBtn: { padding: 10 },
  danmakuWrap: { flex: 1 },
  danmakuList: { flex: 1, borderTopWidth: 0 },
});
