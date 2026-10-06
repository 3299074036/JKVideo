import React, {
  forwardRef,
  useCallback,
  useEffect,
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
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { getRanking, RANK_REGIONS } from "../services/bilibili";
import type { VideoItem } from "../services/types";
import { useTheme } from "../utils/theme";
import { useSettingsStore } from "../store/settingsStore";
import { formatCount, formatDuration } from "../utils/format";
import { proxyImageUrl } from "../utils/imageUrl";

export interface RankingListHandle {
  scrollToTop: () => void;
  refresh: () => void;
}

interface Props {
  /** 顶部留白（盖住首页绝对定位导航栏） */
  topPadding: number;
  onScroll: (e: any) => void;
}

/** 排行榜列表（全站/分区），给首页 tab 和独立页复用 */
export const RankingList = forwardRef<RankingListHandle, Props>(
  function RankingList({ topPadding, onScroll }, ref) {
    const router = useRouter();
    const theme = useTheme();
    const trafficSaving = useSettingsStore((s) => s.trafficSaving);

    const [rid, setRid] = useState(0);
    const [items, setItems] = useState<VideoItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    const listRef = useRef<FlatList>(null);
    // 请求序号：快速切换分区时旧响应直接丢弃（修复竞态）
    const reqTokenRef = useRef(0);

    const load = useCallback(async (regionRid: number, reset = false) => {
      const token = ++reqTokenRef.current;
      if (reset) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        const list = await getRanking(regionRid);
        if (reqTokenRef.current !== token) return; // 已被更新的请求抢占，丢弃
        setItems(list);
      } catch (e: any) {
        if (reqTokenRef.current !== token) return; // 已被更新的请求抢占，丢弃
        setError(e?.message || "加载失败");
      } finally {
        // 各自清理自己设置的 loading 指示，避免卡死
        if (reset) setRefreshing(false);
        else setLoading(false);
      }
    }, []);

    useEffect(() => {
      load(rid);
    }, [rid, load]);

    useImperativeHandle(
      ref,
      () => ({
        scrollToTop: () =>
          listRef.current?.scrollToOffset({ offset: 0, animated: true }),
        refresh: () => load(rid, true),
      }),
      [load, rid],
    );

    const switchRegion = (next: number) => {
      if (next === rid) return;
      setRid(next);
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    };

    const renderItem = useCallback(
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

    const regionChips = (
      <View
        style={[
          styles.tabBar,
          { borderBottomColor: theme.border, backgroundColor: theme.bg },
        ]}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabContent}
        >
          {RANK_REGIONS.map((r) => (
            <TouchableOpacity
              key={r.rid}
              style={[styles.tab, rid === r.rid && styles.tabActive]}
              activeOpacity={0.7}
              onPress={() => switchRegion(r.rid)}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: theme.textSub },
                  rid === r.rid && styles.tabTextActive,
                ]}
              >
                {r.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );

    return (
      <View style={[styles.wrap, { backgroundColor: theme.bg }]}>
        {loading && items.length === 0 ? (
          <View style={[styles.center, { paddingTop: topPadding }]}>
            <ActivityIndicator color="#00AEEC" />
          </View>
        ) : error && items.length === 0 ? (
          <View style={[styles.center, { paddingTop: topPadding }]}>
            <Text style={{ color: theme.textSub }}>{error}</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => load(rid)}
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
            renderItem={renderItem}
            contentContainerStyle={[styles.list, { paddingTop: topPadding }]}
            ListHeaderComponent={regionChips}
            onScroll={onScroll}
            scrollEventThrottle={16}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => load(rid, true)}
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
  tabBar: { borderBottomWidth: StyleSheet.hairlineWidth },
  tabContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  tab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16 },
  tabActive: { backgroundColor: "#00AEEC" },
  tabText: { fontSize: 14 },
  tabTextActive: { color: "#fff", fontWeight: "600" },
  list: { paddingVertical: 4 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8 },
  rank: { width: 30, fontSize: 17, fontWeight: "700", fontStyle: "italic", textAlign: "center" },
  rankTop: { color: "#00AEEC" },
  thumbWrap: { position: "relative", marginHorizontal: 8 },
  thumb: { width: 128, height: 72, borderRadius: 6, backgroundColor: "#ddd" },
  durationBadge: {
    position: "absolute",
    right: 4,
    bottom: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  durationText: { color: "#fff", fontSize: 11 },
  info: { flex: 1, justifyContent: "center" },
  title: { fontSize: 14, fontWeight: "500", lineHeight: 19 },
  meta: { fontSize: 12, marginTop: 6 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  retryBtn: { backgroundColor: "#00AEEC", borderRadius: 8, paddingHorizontal: 24, paddingVertical: 10 },
  retryText: { color: "#fff", fontSize: 14, fontWeight: "600" },
});
