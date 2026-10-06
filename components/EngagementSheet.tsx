import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Animated,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  InteractionManager,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CommentItem } from "./CommentItem";
import DanmakuList from "./DanmakuList";
import { useComments } from "../hooks/useComments";
import { useTheme } from "../utils/theme";
import { formatCount } from "../utils/format";
import { useSheetTransition } from "../utils/useSheetTransition";
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
}: Props) {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const sheetH = Math.max(120, height - topOffset);
  const { rendered, slideAnim } = useSheetTransition(visible, sheetH);

  const [tab, setTab] = useState<EngagementTab>(initialTab);
  const [commentSort, setCommentSort] = useState<0 | 2>(2);
  const { comments, loading, hasMore, load } = useComments(aid, commentSort);

  // 每次打开根据外部 initialTab 切到对应 Tab
  useEffect(() => {
    if (visible) setTab(initialTab);
  }, [visible, initialTab]);

  // 评论懒加载：仅当 Sheet 可见且选中评论 Tab 时拉
  useEffect(() => {
    if (!visible || !aid || tab !== "comments") return;
    const handle = InteractionManager.runAfterInteractions(() => load());
    return () => handle.cancel();
  }, [visible, aid, commentSort, tab, load]);

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
        {tab === "comments" && (
          <>
            <View style={[styles.sortRow, { borderBottomColor: theme.modalBorder }]}>
              {([2, 0] as const).map((sort) => (
                <TouchableOpacity
                  key={sort}
                  style={[
                    styles.sortBtn,
                    { backgroundColor: theme.inputBg },
                    commentSort === sort && styles.sortBtnActive,
                  ]}
                  onPress={() => setCommentSort(sort)}
                >
                  <Text
                    style={[
                      styles.sortBtnTxt,
                      { color: theme.modalTextSub },
                      commentSort === sort && styles.sortBtnTxtActive,
                    ]}
                  >
                    {sort === 2 ? "热门" : "最新"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <FlatList
              style={styles.list}
              data={comments}
              keyExtractor={(c) => String(c.rpid)}
              renderItem={({ item }) => <CommentItem item={item} />}
              onEndReached={() => {
                if (hasMore && !loading) load();
              }}
              onEndReachedThreshold={0.3}
              showsVerticalScrollIndicator={false}
              ListFooterComponent={
                loading ? (
                  <ActivityIndicator style={styles.loader} color="#00AEEC" />
                ) : !hasMore && comments.length > 0 ? (
                  <Text style={[styles.emptyTxt, { color: theme.modalTextSub }]}>
                    已加载全部评论
                  </Text>
                ) : null
              }
              ListEmptyComponent={
                !loading ? (
                  <Text style={[styles.emptyTxt, { color: theme.modalTextSub }]}>
                    暂无评论
                  </Text>
                ) : null
              }
            />
          </>
        )}

        {/* 弹幕 Tab —— hideHeader=true 让弹幕列表填满，header 由本 Sheet 顶部 Tab 提供 */}
        {tab === "danmaku" && (
          <DanmakuList
            danmakus={danmakus}
            currentTime={currentTime}
            visible
            onToggle={() => {}}
            hideHeader
            style={styles.danmakuList}
          />
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
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sortBtn: {
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 16,
  },
  sortBtnActive: { backgroundColor: "#00AEEC" },
  sortBtnTxt: { fontSize: 13, fontWeight: "500" },
  sortBtnTxtActive: { color: "#fff", fontWeight: "600" },
  list: { flex: 1 },
  loader: { marginVertical: 30 },
  emptyTxt: { textAlign: "center", padding: 30, fontSize: 13 },
  danmakuList: { flex: 1, borderTopWidth: 0 },
});
