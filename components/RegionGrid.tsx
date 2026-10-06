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
import { getRanking, RANK_REGIONS } from "../services/bilibili";
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

// 分区图标映射
const REGION_ICONS: Record<number, string> = {
  1: "color-palette-outline", // 动画
  3: "musical-notes-outline", // 音乐
  129: "accessibility-outline", // 舞蹈
  4: "game-controller-outline", // 游戏
  36: "bulb-outline", // 知识
  188: "phone-portrait-outline", // 数码
  160: "leaf-outline", // 生活
  119: "happy-outline", // 鬼畜
  211: "film-outline", // 影视
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
    const loadingRef = useRef(false);
    const listRef = useRef<FlatList>(null);

    const load = useCallback(
      async (rid: number, reset = false) => {
        if (loadingRef.current) return;
        loadingRef.current = true;
        if (reset) setRefreshing(true);
        else setLoading(true);
        setError("");
        try {
          const list = await getRanking(rid);
          setItems(list);
        } catch (e: any) {
          setError(e?.message || "加载失败");
        } finally {
          loadingRef.current = false;
          setLoading(false);
          setRefreshing(false);
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
      const regions = RANK_REGIONS.filter((r) => r.rid !== 0);
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
    const regionName = RANK_REGIONS.find((r) => r.rid === selectedRid)?.name ?? "";
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
