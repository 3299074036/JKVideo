import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { getRegionFeed, REGION_FEED_CHANNELS } from "../services/bilibili";
import type { VideoItem } from "../services/types";
import { useTheme } from "../utils/theme";
import { useSettingsStore } from "../store/settingsStore";
import { formatCount, formatDuration } from "../utils/format";
import { proxyImageUrl } from "../utils/imageUrl";

export interface RegionGridHandle {
  scrollToTop: () => void;
  refresh: () => void;
}

interface Props {
  topPadding: number;
  onScroll: (e: any) => void;
}

// 分区图标映射（新版分区 ID）
const REGION_ICONS: Record<number, string> = {
  1005: "color-palette-outline", // 动画
  1003: "musical-notes-outline", // 音乐
  1004: "accessibility-outline", // 舞蹈
  1008: "game-controller-outline", // 游戏
  1007: "happy-outline", // 鬼畜
  1010: "bulb-outline", // 知识
  1012: "phone-portrait-outline", // 科技
  1018: "fitness-outline", // 运动
  1013: "car-outline", // 汽车
  1020: "leaf-outline", // 生活
  1014: "shirt-outline", // 时尚
  1002: "star-outline", // 娱乐
  1001: "film-outline", // 影视
  1024: "paw-outline", // 动物
};

const REGION_COLORS = ["#00AEEC", "#FF6B9D", "#FFA940", "#9254DE", "#36CFC9", "#FF7A45"];

export const RegionGrid = forwardRef<RegionGridHandle, Props>(
  function RegionGrid({ topPadding, onScroll }, ref) {
    const router = useRouter();
    const theme = useTheme();
    const trafficSaving = useSettingsStore((s) => s.trafficSaving);
    const [selectedRid, setSelectedRid] = useState<number | null>(null);
    const [items, setItems] = useState<VideoItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    const listRef = useRef<FlatList>(null);
    // 请求序号：快速切换分区时旧响应直接丢弃（修复竞态）
    const reqTokenRef = useRef(0);
    // 分区推荐流翻页：display_id 递增
    const displayIdRef = useRef(1);
    const [hasMore, setHasMore] = useState(true);

    const load = useCallback(
      async (rid: number, reset = false) => {
        const token = ++reqTokenRef.current;
        if (reset) {
          displayIdRef.current = 1;
          setHasMore(true);
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        setError("");
        try {
          const list = await getRegionFeed(rid, displayIdRef.current);
          if (reqTokenRef.current !== token) return; // 已被更新的请求抢占，丢弃
          if (list.length === 0) setHasMore(false);
          else displayIdRef.current += 1;
          setItems((prev) => (reset ? list : [...prev, ...list]));
        } catch (e: any) {
          if (reqTokenRef.current !== token) return; // 已被更新的请求抢占，丢弃
          setError(e?.message || "加载失败");
        } finally {
          // 各自清理自己设置的 loading 指示，避免卡死
          if (reset) setRefreshing(false);
          else setLoading(false);
        }
      },
      [],
    );

    useImperativeHandle(
      ref,
      () => ({
        scrollToTop: () => {
          if (selectedRid != null) {
            listRef.current?.scrollToOffset({ offset: 0, animated: true });
          }
        },
        refresh: () => {
          if (selectedRid != null) load(selectedRid, true);
        },
      }),
      [load, selectedRid],
    );

    const openRegion = (rid: number) => {
      setSelectedRid(rid);
      setItems([]);
      load(rid);
    };

    const renderVideoItem = useCallback(
      ({ item, index }: { item: VideoItem; index: number }) => (
        <TouchableOpacity
          style={styles.row}
          activeOpacity={0.85}
          onPress={() => router.push(`/video/${item.bvid}` as any)}
        >
          <Text
            style={[styles.rank, { color: theme.textSub }, index < 3 && styles.rankTop]}
          >
            {index + 1}
          </Text>
          <View style={styles.thumbWrap}>
            <Image
              source={{ uri: trafficSaving ? undefined : proxyImageUrl(item.pic) }}
              style={styles.thumb}
              contentFit="cover"
            />
            {!!item.duration && (
              <View style={styles.durationBadge}>
                <Text style={styles.durationText}>{formatDuration(item.duration)}</Text>
              </View>
            )}
          </View>
          <View style={styles.info}>
            <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={[styles.meta, { color: theme.textSub }]} numberOfLines={1}>
              {item.owner?.name} · {formatCount(item.stat?.view ?? 0)}播放
            </Text>
          </View>
        </TouchableOpacity>
      ),
      [router, theme, trafficSaving],
    );

    // 分区宫格
    if (selectedRid == null) {
      const regions = REGION_FEED_CHANNELS;
      return (
        <FlatList
          data={regions}
          numColumns={3}
          keyExtractor={(r) => String(r.rid)}
          contentContainerStyle={[styles.grid, { paddingTop: topPadding }]}
          onScroll={onScroll}
          scrollEventThrottle={16}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              style={[styles.gridCard, { backgroundColor: theme.card }]}
              activeOpacity={0.8}
              onPress={() => openRegion(item.rid)}
            >
              <View
                style={[
                  styles.gridIconWrap,
                  { backgroundColor: REGION_COLORS[index % REGION_COLORS.length] + "18" },
                ]}
              >
                <Ionicons
                  name={(REGION_ICONS[item.rid] ?? "apps-outline") as any}
                  size={28}
                  color={REGION_COLORS[index % REGION_COLORS.length]}
                />
              </View>
              <Text style={[styles.gridLabel, { color: theme.text }]}>{item.name}</Text>
            </TouchableOpacity>
          )}
        />
      );
    }

    // 分区视频列表
    const regionName = REGION_FEED_CHANNELS.find((r) => r.rid === selectedRid)?.name ?? "";
    return (
      <View style={[styles.wrap, { backgroundColor: theme.bg }]}>
        <View style={[styles.subHeader, { paddingTop: topPadding, backgroundColor: theme.bg }]}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => setSelectedRid(null)}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={22} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.subTitle, { color: theme.text }]}>{regionName}</Text>
          <View style={styles.backBtn} />
        </View>
        {loading && items.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color="#00AEEC" />
          </View>
        ) : error && items.length === 0 ? (
          <View style={styles.center}>
            <Text style={{ color: theme.textSub }}>{error}</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => load(selectedRid)}
              activeOpacity={0.7}
            >
              <Text style={styles.retryText}>重试</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={items}
            keyExtractor={(item) => item.bvid}
            renderItem={renderVideoItem}
            contentContainerStyle={styles.list}
            onScroll={onScroll}
            scrollEventThrottle={16}
            onEndReached={() => {
              if (hasMore && !loading && selectedRid != null) load(selectedRid);
            }}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              loading && items.length > 0 ? (
                <ActivityIndicator color="#00AEEC" style={{ paddingVertical: 16 }} />
              ) : null
            }
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => load(selectedRid, true)}
                tintColor="#00AEEC"
                colors={["#00AEEC"]}
              />
            }
          />
        )}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  grid: { paddingHorizontal: 12, paddingBottom: 16 },
  gridCard: {
    flex: 1,
    margin: 6,
    borderRadius: 12,
    paddingVertical: 20,
    alignItems: "center",
    gap: 10,
  },
  gridIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  gridLabel: { fontSize: 14, fontWeight: "600" },
  subHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  backBtn: { width: 40, alignItems: "center" },
  subTitle: { fontSize: 16, fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: "#00AEEC",
  },
  retryText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  list: { paddingVertical: 4, paddingBottom: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rank: {
    width: 30,
    fontSize: 17,
    fontWeight: "700",
    fontStyle: "italic",
    textAlign: "center",
  },
  rankTop: { color: "#00AEEC" },
  thumbWrap: { position: "relative", marginHorizontal: 8 },
  thumb: { width: 128, height: 72, borderRadius: 6, backgroundColor: "#ddd" },
  durationBadge: {
    position: "absolute",
    right: 4,
    bottom: 4,
    backgroundColor: "rgba(0,0,0,0.65)",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  durationText: { color: "#fff", fontSize: 11 },
  info: { flex: 1, marginLeft: 8, gap: 4 },
  title: { fontSize: 14, fontWeight: "500" },
  meta: { fontSize: 12 },
});
