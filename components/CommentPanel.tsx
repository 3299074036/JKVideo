import React, { useCallback, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  InteractionManager,
} from "react-native";
import { useComments } from "../hooks/useComments";
import { CommentItem } from "./CommentItem";
import { BottomInputBar } from "./BottomInputBar";
import { postComment, toggleCommentLike, getUserInfo } from "../services/bilibili";
import type { Comment } from "../services/types";
import { useAuthStore } from "../store/authStore";
import { useTheme } from "../utils/theme";
import { toast } from "../utils/toast";

interface Props {
  aid: number;
  /** 是否显示 热门/最新 排序切换（全屏下不显示，保持简洁） */
  showSort?: boolean;
}

/**
 * 评论面板：排序 + 列表 + 发表 + 点赞。
 * 竖屏互动弹窗和全屏右侧评论 sheet 共用。
 */
export const CommentPanel = React.memo(function CommentPanel({ aid, showSort = true }: Props) {
  const theme = useTheme();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const [commentSort, setCommentSort] = React.useState<0 | 2>(2);
  const { comments, loading, hasMore, load, prependComment, updateComment } = useComments(
    aid,
    commentSort,
  );

  // 面板挂载即加载（调用方只在可见时渲染）
  useEffect(() => {
    if (!aid) return;
    const handle = InteractionManager.runAfterInteractions(() => load());
    return () => handle.cancel();
  }, [aid, commentSort, load]);

  const handleToggleLike = useCallback(
    async (c: Comment) => {
      if (!isLoggedIn) {
        toast("请先登录后再点赞");
        return;
      }
      const liked = (c.action ?? 0) === 1;
      updateComment(c.rpid, { action: liked ? 0 : 1, like: Math.max(0, c.like + (liked ? -1 : 1)) });
      try {
        await toggleCommentLike(aid, c.rpid, !liked);
      } catch (e: any) {
        updateComment(c.rpid, { action: liked ? 1 : 0, like: c.like }); // 失败回滚
        const m = e?.message;
        if (m === "NO_CSRF") toast("请重新登录后再点赞");
        else toast(`操作失败：${m || "未知错误"}`);
      }
    },
    [aid, isLoggedIn, updateComment],
  );

  const handlePost = useCallback(
    async (message: string) => {
      if (!isLoggedIn) {
        toast("请先登录后再评论");
        throw new Error("NOT_LOGGED_IN");
      }
      try {
        const { rpid } = await postComment(aid, message);
        const me = await getUserInfo().catch(() => null);
        prependComment({
          rpid,
          content: { message },
          member: { uname: me?.uname ?? "我", avatar: me?.face ?? "" },
          like: 0,
          ctime: Math.floor(Date.now() / 1000),
          replies: null,
          action: 0,
        });
        toast("评论发表成功");
      } catch (e: any) {
        if (e?.message === "NO_CSRF") toast("请重新登录后再评论");
        throw e;
      }
    },
    [aid, isLoggedIn, prependComment],
  );

  return (
    <View style={styles.wrap}>
      {showSort && (
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
      )}
      <FlatList
        style={styles.list}
        data={comments}
        keyExtractor={(c) => String(c.rpid)}
        renderItem={({ item }) => <CommentItem item={item} onToggleLike={handleToggleLike} />}
        onEndReached={() => {
          if (hasMore && !loading) load();
        }}
        onEndReachedThreshold={0.3}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          loading ? (
            <ActivityIndicator style={styles.loader} color="#00AEEC" />
          ) : !hasMore && comments.length > 0 ? (
            <Text style={[styles.emptyTxt, { color: theme.modalTextSub }]}>已加载全部评论</Text>
          ) : null
        }
        ListEmptyComponent={
          !loading ? (
            <Text style={[styles.emptyTxt, { color: theme.modalTextSub }]}>暂无评论</Text>
          ) : null
        }
      />
      <BottomInputBar placeholder="说点什么…" onSend={handlePost} />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sortBtn: { paddingHorizontal: 12, paddingVertical: 3, borderRadius: 16 },
  sortBtnActive: { backgroundColor: "#00AEEC" },
  sortBtnTxt: { fontSize: 13, fontWeight: "500" },
  sortBtnTxtActive: { color: "#fff", fontWeight: "600" },
  list: { flex: 1 },
  loader: { marginVertical: 30 },
  emptyTxt: { textAlign: "center", padding: 30, fontSize: 13 },
});
