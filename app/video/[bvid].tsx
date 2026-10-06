import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  InteractionManager,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { VideoPlayer } from "../../components/VideoPlayer";
import { getDanmaku, getOnlineCount, getUploaderStat } from "../../services/bilibili";
import type { DanmakuItem, VideoItem } from "../../services/types";
import { useVideoDetail } from "../../hooks/useVideoDetail";
import { useRelatedVideos } from "../../hooks/useRelatedVideos";
import { formatCount, formatDuration, formatTime } from "../../utils/format";
import { proxyImageUrl } from "../../utils/imageUrl";
import { DownloadSheet } from "../../components/DownloadSheet";
import { VideoDetailSkeleton } from "../../components/VideoDetailSkeleton";
import { useTheme } from "../../utils/theme";
import { useLiveStore } from "../../store/liveStore";
import { VideoActionRow } from "../../components/VideoActionRow";
import { DescriptionSheet } from "../../components/DescriptionSheet";
import { EngagementSheet, type EngagementTab } from "../../components/EngagementSheet";
import { FollowTagSheet } from "../../components/FollowTagSheet";
import { useFollow } from "../../hooks/useFollow";

export default function VideoDetailScreen() {
  const { bvid } = useLocalSearchParams<{ bvid: string }>();
  const router = useRouter();
  const theme = useTheme();

  useLayoutEffect(() => {
    useLiveStore.getState().clearLive();
  }, []);

  // 骨架屏最短展示时长：即便数据秒回，也至少撑够这么久，避免一闪而过。
  // 重要：依赖 [bvid] —— 切换合集/推荐时同步复位，让骨架屏盖住老数据残影。
  const SKELETON_MIN_MS = 600;
  const [minSkeletonElapsed, setMinSkeletonElapsed] = useState(false);
  useEffect(() => {
    setMinSkeletonElapsed(false);
    const t = setTimeout(() => setMinSkeletonElapsed(true), SKELETON_MIN_MS);
    return () => clearTimeout(t);
  }, [bvid]);

  const {
    video,
    playData,
    loading: videoLoading,
    qualities,
    currentQn,
    changeQuality,
    initialTime,
    pages,
    pageIndex,
    changePage,
    currentCid,
  } = useVideoDetail(bvid as string);

  const [danmakus, setDanmakus] = useState<DanmakuItem[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [showDownload, setShowDownload] = useState(false);
  const [showDescSheet, setShowDescSheet] = useState(false);
  // 评论/弹幕合并 Sheet：null=关闭，否则记录当前应该打开哪个 Tab
  const [engagementTab, setEngagementTab] = useState<EngagementTab | null>(null);
  const [uploaderStat, setUploaderStat] = useState<{
    follower: number;
    archiveCount: number;
  } | null>(null);

  // 切换视频时把和老视频绑定的瞬态状态全部清掉，避免新页面短暂显示老弹幕/老 UP 主统计/老开着的 Sheet
  useEffect(() => {
    setDanmakus([]);
    setUploaderStat(null);
    setCurrentTime(0);
    setShowDescSheet(false);
    setShowDownload(false);
    setEngagementTab(null);
  }, [bvid]);

  const { following, loading: followLoading, toggle: toggleFollow, followToTags } = useFollow(
    video?.owner.mid,
  );
  const [tagSheetVisible, setTagSheetVisible] = useState(false);

  // 关注按钮：未关注 → 弹分组选择；已关注 → 取消关注
  const handleFollowPress = useCallback(() => {
    if (following) {
      toggleFollow();
    } else {
      setTagSheetVisible(true);
    }
  }, [following, toggleFollow]);

  // Sheet 顶部对齐播放器底部：safe-area 顶 inset + 播放器高度（无 TopBar，返回按钮悬浮在播放器上）
  const insets = useSafeAreaInsets();
  const { width: SCREEN_W } = useWindowDimensions();
  const sheetTopOffset = insets.top + SCREEN_W * 0.5625;

  const {
    videos: relatedVideos,
    loading: relatedLoading,
    load: loadRelated,
  } = useRelatedVideos(bvid as string);

  // 推荐视频不参与首屏，等导航动画结束再拉，避免与详情/播放流抢 JS 线程
  // 依赖 [bvid]：合集/推荐切到新视频时同步重新拉新推荐列表
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      loadRelated();
    });
    return () => handle.cancel();
  }, [bvid, loadRelated]);

  // 弹幕按当前分 P 的 cid 拉取，切分 P 时先清空老弹幕
  useEffect(() => {
    setDanmakus([]);
    if (!currentCid) return;
    const handle = InteractionManager.runAfterInteractions(() => {
      getDanmaku(currentCid).then(setDanmakus).catch(() => {});
    });
    return () => handle.cancel();
  }, [currentCid]);

  // 当前分 P 在线观看人数（全屏顶栏 UP 信息区展示）
  const [onlineCount, setOnlineCount] = useState(0);
  useEffect(() => {
    setOnlineCount(0);
    if (!bvid || !currentCid) return;
    const handle = InteractionManager.runAfterInteractions(() => {
      getOnlineCount(bvid as string, currentCid)
        .then(setOnlineCount)
        .catch(() => {});
    });
    return () => handle.cancel();
  }, [bvid, currentCid]);

  useEffect(() => {
    if (!video?.owner?.mid) return;
    const handle = InteractionManager.runAfterInteractions(() => {
      getUploaderStat(video.owner.mid).then(setUploaderStat).catch(() => {});
    });
    return () => handle.cancel();
  }, [video?.owner?.mid]);

  const shareUrl = bvid ? `https://www.bilibili.com/video/${bvid}` : undefined;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.card }]}>
      <VideoPlayer
        playData={playData}
        qualities={qualities}
        currentQn={currentQn}
        onQualityChange={changeQuality}
        bvid={bvid as string}
        cid={currentCid}
        danmakus={danmakus}
        onTimeUpdate={setCurrentTime}
        initialTime={initialTime}
        onBack={() => router.back()}
        coverUrl={video?.pic ? proxyImageUrl(video.pic) : undefined}
        onPrevPage={() => changePage(pageIndex - 1)}
        onNextPage={() => changePage(pageIndex + 1)}
        hasPrevPage={pages.length > 1 && pageIndex > 0}
        hasNextPage={pages.length > 1 && pageIndex < pages.length - 1}
        upName={video?.owner?.name}
        upFace={video?.owner?.face ? proxyImageUrl(video.owner.face) : undefined}
        onlineCount={onlineCount}
      />

      {videoLoading || !video || !minSkeletonElapsed ? (
        <VideoDetailSkeleton />
      ) : (
        <FlatList<VideoItem>
          // bvid 是 key —— 切换视频时 FlatList 整体重挂，滚动位置回到顶，避免老内容残影
          key={bvid}
          style={styles.scroll}
          data={relatedVideos}
          keyExtractor={(item) => item.bvid}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              {/* 标题 + Meta 行（点击展开简介 Sheet） */}
              <View style={styles.titleBlock}>
                <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
                  {video.title}
                </Text>
                <TouchableOpacity
                  style={styles.metaRow}
                  activeOpacity={0.7}
                  onPress={() => setShowDescSheet(true)}
                >
                  <Text
                    style={[styles.metaText, { color: theme.textSub }]}
                    numberOfLines={1}
                  >
                    {formatCount(video.stat?.view ?? 0)} 次观看
                    {video.pubdate ? ` · ${formatTime(video.pubdate)}` : ""}
                    {video.stat?.like ? ` · ${formatCount(video.stat.like)} 点赞` : ""}
                    {video.tname ? ` · ${video.tname}` : ""}
                  </Text>
                  <Text style={[styles.metaMore, { color: theme.textSub }]}>更多</Text>
                  <Ionicons name="chevron-forward" size={14} color={theme.textSub} />
                </TouchableOpacity>
              </View>

              {/* 动作按钮行 */}
              <View style={[styles.actionWrap, { borderTopColor: theme.border }]}>
                <VideoActionRow
                  stat={video.stat ?? undefined}
                  danmakuCount={danmakus.length || video.stat?.danmaku}
                  title={video.title}
                  shareUrl={shareUrl}
                  onDownload={() => setShowDownload(true)}
                  onComments={() => setEngagementTab("comments")}
                  onDanmaku={() => setEngagementTab("danmaku")}
                />
              </View>

              {/* UP 主行 + 关注按钮 */}
              <View
                style={[
                  styles.creatorRow,
                  { borderTopColor: theme.border, borderBottomColor: theme.border },
                ]}
              >
                <TouchableOpacity
                  style={styles.creatorLeft}
                  activeOpacity={0.85}
                  onPress={() => router.push(`/creator/${video.owner.mid}` as any)}
                >
                  <Image
                    source={{ uri: proxyImageUrl(video.owner.face) }}
                    style={styles.avatar}
                    contentFit="cover"
                    recyclingKey={String(video.owner.mid)}
                  />
                  <View style={styles.creatorInfo}>
                    <Text
                      style={[styles.creatorName, { color: theme.text }]}
                      numberOfLines={1}
                    >
                      {video.owner.name}
                    </Text>
                    {uploaderStat && (
                      <Text
                        style={[styles.creatorStat, { color: theme.textSub }]}
                        numberOfLines={1}
                      >
                        {formatCount(uploaderStat.follower)}粉丝 ·{" "}
                        {formatCount(uploaderStat.archiveCount)}视频
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.subBtn, following && styles.subBtnFollowing]}
                  activeOpacity={0.85}
                  onPress={handleFollowPress}
                  disabled={followLoading}
                >
                  <Text
                    style={[
                      styles.subBtnTxt,
                      following && { color: theme.textSub },
                    ]}
                  >
                    {following ? "已关注" : "关注"}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* 合集 */}
              {video.ugc_season && (
                <SeasonSection
                  season={video.ugc_season}
                  currentBvid={bvid as string}
                  onEpisodePress={(epBvid) => router.replace(`/video/${epBvid}`)}
                />
              )}

              {/* 推荐视频小标题 */}
              <View style={[styles.relatedHeader, { backgroundColor: theme.card }]}>
                <Text style={[styles.relatedHeaderText, { color: theme.text }]}>
                  推荐视频
                </Text>
              </View>
            </>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.relatedCard,
                { backgroundColor: theme.card, borderBottomColor: theme.border },
              ]}
              onPress={() => router.replace(`/video/${item.bvid}` as any)}
              activeOpacity={0.85}
            >
              <View style={[styles.relatedThumbWrap, { backgroundColor: theme.card }]}>
                <Image
                  source={{ uri: proxyImageUrl(item.pic) }}
                  style={styles.relatedThumb}
                  contentFit="cover"
                  recyclingKey={item.bvid}
                  transition={200}
                />
                <View style={styles.relatedDuration}>
                  <Text style={styles.relatedDurationText}>
                    {formatDuration(item.duration)}
                  </Text>
                </View>
              </View>
              <View style={styles.relatedInfo}>
                <Text
                  style={[styles.relatedTitle, { color: theme.text }]}
                  numberOfLines={2}
                >
                  {item.title}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text
                    style={[styles.relatedOwner, { color: theme.textSub }]}
                    numberOfLines={1}
                  >
                    {item.owner?.name ?? ""}
                  </Text>
                  <Text style={[styles.relatedView, { color: theme.textSub }]}>
                    {formatCount(item.stat?.view ?? 0)} 播放
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            relatedLoading ? (
              <ActivityIndicator style={styles.loader} color="#00AEEC" />
            ) : null
          }
          ListFooterComponent={
            relatedLoading ? (
              <ActivityIndicator style={styles.loader} color="#00AEEC" />
            ) : null
          }
        />
      )}

      <DownloadSheet
        visible={showDownload}
        onClose={() => setShowDownload(false)}
        topOffset={sheetTopOffset}
        bvid={bvid as string}
        cid={currentCid ?? 0}
        title={video?.title ?? ""}
        cover={video?.pic ?? ""}
        qualities={qualities}
      />
      <DescriptionSheet
        visible={showDescSheet}
        onClose={() => setShowDescSheet(false)}
        topOffset={sheetTopOffset}
        video={video ?? null}
      />
      <EngagementSheet
        visible={engagementTab !== null}
        onClose={() => setEngagementTab(null)}
        topOffset={sheetTopOffset}
        initialTab={engagementTab ?? "comments"}
        aid={video?.aid ?? 0}
        replyCount={video?.stat?.reply}
        danmakus={danmakus}
        currentTime={currentTime}
      />
      <FollowTagSheet
        visible={tagSheetVisible}
        onClose={() => setTagSheetVisible(false)}
        onConfirm={(tagids) => followToTags(tagids)}
      />
    </SafeAreaView>
  );
}

function SeasonSection({
  season,
  currentBvid,
  onEpisodePress,
}: {
  season: NonNullable<VideoItem["ugc_season"]>;
  currentBvid: string;
  onEpisodePress: (bvid: string) => void;
}) {
  const theme = useTheme();
  const { width: screenW } = useWindowDimensions();
  const episodes = season.sections?.[0]?.episodes ?? [];
  const currentIndex = episodes.findIndex((ep) => ep.bvid === currentBvid);
  const listRef = useRef<FlatList>(null);
  // 初次渲染先隐身，scrollToOffset 完成后再显示，彻底消除"先 0 再跳"的可见闪烁
  const [ready, setReady] = useState(currentIndex <= 0);

  // 计算让当前集水平居中的初始 contentOffset
  const initialOffset = useMemo(() => {
    if (currentIndex <= 0) return 0;
    const ITEM_WIDTH = 120;
    const STEP = 130; // 120 + 10 gap
    const PADDING = 12;
    const itemCenter = PADDING + currentIndex * STEP + ITEM_WIDTH / 2;
    return Math.max(0, itemCenter - screenW / 2);
  }, [currentIndex, screenW]);

  const handleContentSizeChange = useCallback(() => {
    if (ready) return;
    if (currentIndex > 0 && initialOffset > 0) {
      listRef.current?.scrollToOffset({ offset: initialOffset, animated: false });
    }
    requestAnimationFrame(() => setReady(true));
  }, [ready, currentIndex, initialOffset]);

  return (
    <View style={[styles.seasonBox, { borderTopColor: theme.border, backgroundColor: theme.card }]}>
      <View style={styles.seasonHeader}>
        <Text style={[styles.seasonTitle, { color: theme.text }]}>合集 · {season.title}</Text>
        <Text style={styles.seasonCount}>{season.ep_count}个视频</Text>
        <Ionicons name="chevron-forward" size={14} color="#999" />
      </View>
      <FlatList
        ref={listRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        data={episodes}
        keyExtractor={(ep) => ep.bvid}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 10 }}
        getItemLayout={(_data, index) => ({ length: 130, offset: 12 + index * 130, index })}
        contentOffset={{ x: initialOffset, y: 0 }}
        onContentSizeChange={handleContentSizeChange}
        onScrollToIndexFailed={() => {}}
        style={{ opacity: ready ? 1 : 0 }}
        renderItem={({ item: ep, index }) => {
          const isCurrent = ep.bvid === currentBvid;
          return (
            <TouchableOpacity
              style={[
                styles.epCard,
                { backgroundColor: theme.card, borderColor: theme.border },
                isCurrent && styles.epCardActive,
              ]}
              onPress={() => !isCurrent && onEpisodePress(ep.bvid)}
              activeOpacity={0.8}
            >
              {ep.arc?.pic && (
                <Image
                  source={{ uri: proxyImageUrl(ep.arc.pic) }}
                  style={[styles.epThumb, { backgroundColor: theme.card }]}
                  contentFit="cover"
                  recyclingKey={ep.bvid}
                />
              )}
              <Text style={[styles.epNum, isCurrent && styles.epNumActive]}>第{index + 1}集</Text>
              <Text style={[styles.epTitle, { color: theme.text }]} numberOfLines={2}>{ep.title}</Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  loader: { marginVertical: 30 },
  scroll: { flex: 1 },

  // Title + Meta（YT 风格）
  titleBlock: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 16, fontWeight: "700", lineHeight: 22 },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  metaText: { flex: 1, fontSize: 12, lineHeight: 18 },
  metaMore: { fontSize: 12, lineHeight: 18, marginLeft: 6, marginRight: 2 },

  // Action row 外壳
  actionWrap: { borderTopWidth: StyleSheet.hairlineWidth },

  // UP 主行
  creatorRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  creatorLeft: { flex: 1, flexDirection: "row", alignItems: "center" },
  avatar: { width: 38, height: 38, borderRadius: 19, marginRight: 10 },
  creatorInfo: { flex: 1 },
  creatorName: { fontSize: 14, fontWeight: "600", lineHeight: 18 },
  creatorStat: { fontSize: 11, marginTop: 2, lineHeight: 16 },
  subBtn: {
    backgroundColor: "#00AEEC",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    marginLeft: 12,
  },
  // 已关注：浅灰底 + 灰字（textSub 由 useTheme 提供）
  subBtnFollowing: { backgroundColor: "rgba(127,127,127,0.18)" },
  subBtnTxt: { color: "#fff", fontSize: 13, fontWeight: "600" },

  // 合集
  seasonBox: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
  seasonHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingBottom: 8,
    gap: 4,
  },
  seasonTitle: { flex: 1, fontSize: 13, fontWeight: "600" },
  seasonCount: { fontSize: 12, color: "#999" },
  epCard: { width: 120, borderRadius: 6, overflow: "hidden", borderWidth: 1, borderColor: "transparent" },
  epCardActive: { borderColor: "#00AEEC", borderWidth: 1.5 },
  epThumb: { width: 120, height: 68 },
  epNum: { fontSize: 11, color: "#999", paddingHorizontal: 6, paddingTop: 4 },
  epNumActive: { color: "#00AEEC", fontWeight: "600" },
  epTitle: { fontSize: 12, paddingHorizontal: 6, paddingBottom: 6, lineHeight: 16 },

  // 推荐列表
  relatedHeader: { paddingLeft: 13, paddingBottom: 8, paddingTop: 12 },
  relatedHeaderText: { fontSize: 13, fontWeight: "600" as const },
  relatedCard: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  relatedThumbWrap: {
    position: "relative",
    width: 120,
    height: 68,
    borderRadius: 4,
    overflow: "hidden",
    flexShrink: 0,
  },
  relatedThumb: { width: 120, height: 68 },
  relatedDuration: {
    position: "absolute",
    bottom: 3,
    right: 3,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  relatedDurationText: { color: "#fff", fontSize: 10 },
  relatedInfo: { flex: 1, justifyContent: "space-between", paddingVertical: 2 },
  relatedTitle: { fontSize: 13, lineHeight: 18 },
  relatedOwner: { fontSize: 12 },
  relatedView: { fontSize: 11 },
});
