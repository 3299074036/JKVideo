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
} from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { getDynamicFeed } from "../services/bilibili";
import type { DynamicItem } from "../services/types";
import { useTheme } from "../utils/theme";
import { useAuthStore } from "../store/authStore";
import { useSettingsStore } from "../store/settingsStore";
import { formatCount, formatDuration, formatTime } from "../utils/format";
import { proxyImageUrl } from "../utils/imageUrl";

export interface DynamicListHandle {
  scrollToTop: () => void;
  refresh: () => void;
}

interface Props {
  /** 顶部留白（盖住首页绝对定位导航栏） */
  topPadding: number;
  onScroll: (e: any) => void;
  onLoginPress: () => void;
  /** 是否显示 全部/视频/图文 筛选（动态底栏用） */
  showFilter?: boolean;
}

type DynFilter = "all" | "video" | "text";

/** 动态流列表（关注的人的动态），给首页 tab / 动态底栏复用 */
export const DynamicList = forwardRef<DynamicListHandle, Props>(
  function DynamicList({ topPadding, onScroll, onLoginPress, showFilter }, ref) {
    const router = useRouter();
    const theme = useTheme();
    const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
    const trafficSaving = useSettingsStore((s) => s.trafficSaving);

    const [items, setItems] = useState<DynamicItem[]>([]);
    const [dynFilter, setDynFilter] = useState<DynFilter>("all");
    const [offset, setOffset] = useState("");
    const [hasMore, setHasMore] = useState(true);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    const loadingRef = useRef(false);
    const listRef = useRef<FlatList>(null);

    const load = useCallback(
      async (reset = false, curOffset = offset, curHasMore = hasMore) => {
        if (!isLoggedIn || loadingRef.current) return;
        if (!reset && !curHasMore) return;
        loadingRef.current = true;
        if (reset) setRefreshing(true);
        else setLoading(true);
        setError("");
        try {
          const r = await getDynamicFeed(reset ? "" : curOffset, dynFilter === "video" ? "video" : "all");
          const filtered = dynFilter === "text" ? r.items.filter((it) => it.type !== "av") : r.items;
          setItems((prev) => (reset ? filtered : [...prev, ...filtered]));
          setOffset(r.offset);
          setHasMore(r.hasMore);
        } catch (e: any) {
          setError(e?.message || "加载失败");
        } finally {
          loadingRef.current = false;
          setLoading(false);
          setRefreshing(false);
        }
      },
      [isLoggedIn, offset, hasMore, dynFilter],
    );

    useEffect(() => {
      if (isLoggedIn) load(true, "", true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoggedIn]);

    const switchFilter = (f: DynFilter) => {
      if (f === dynFilter) return;
      setDynFilter(f);
      setItems([]);
      setOffset("");
      setHasMore(true);
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    };

    // 筛选变化后重新加载（等 state 落定）
    useEffect(() => {
      if (isLoggedIn) load(true, "", true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dynFilter]);

    useImperativeHandle(
      ref,
      () => ({
        scrollToTop: () =>
          listRef.current?.scrollToOffset({ offset: 0, animated: true }),
        refresh: () => load(true, "", true),
      }),
      [load],
    );

    const renderItem = useCallback(
      ({ item }: { item: DynamicItem }) => (
        <View
          style={[styles.card, { backgroundColor: theme.card, borderBottomColor: theme.border }]}
        >
          <TouchableOpacity
            style={styles.authorRow}
            activeOpacity={0.7}
            onPress={() =>
              item.author.mid > 0 && router.push(`/creator/${item.author.mid}` as any)
            }
          >
            <Image
              source={{ uri: trafficSaving ? undefined : proxyImageUrl(item.author.face) }}
              style={styles.avatar}
              contentFit="cover"
            />
            <View style={styles.authorInfo}>
              <Text style={[styles.authorName, { color: theme.text }]} numberOfLines={1}>
                {item.author.name}
              </Text>
              <Text style={[styles.pubTime, { color: theme.textSub }]}>
                {item.author.pubTime > 0 ? formatTime(item.author.pubTime) : ""}
              </Text>
            </View>
          </TouchableOpacity>

          {item.type === "av" && item.bvid ? (
            <TouchableOpacity
              style={styles.avRow}
              activeOpacity={0.85}
              onPress={() => router.push(`/video/${item.bvid}` as any)}
            >
              <View style={styles.thumbWrap}>
                <Image
                  source={{ uri: trafficSaving ? undefined : proxyImageUrl(item.cover ?? "") }}
                  style={styles.thumb}
                  contentFit="cover"
                />
                {!!item.duration && (
                  <View style={styles.durationBadge}>
                    <Text style={styles.durationText}>{formatDuration(item.duration)}</Text>
                  </View>
                )}
              </View>
              <View style={styles.avInfo}>
                <Text style={[styles.avTitle, { color: theme.text }]} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={[styles.avMeta, { color: theme.textSub }]} numberOfLines={1}>
                  {formatCount(item.playCount ?? 0)}播放
                </Text>
              </View>
            </TouchableOpacity>
          ) : (
            <Text style={[styles.textContent, { color: theme.text }]}>{item.text}</Text>
          )}
        </View>
      ),
      [router, theme, trafficSaving],
    );

    return (
      <View style={[styles.wrap, { backgroundColor: theme.bg }]}>
        {!isLoggedIn ? (
          <View style={[styles.center, { paddingTop: topPadding }]}>
            <Ionicons name="people-outline" size={48} color={theme.textSub} />
            <Text style={[styles.tip, { color: theme.textSub }]}>
              登录后查看关注的人的动态
            </Text>
            <TouchableOpacity
              style={styles.loginBtn}
              activeOpacity={0.7}
              onPress={onLoginPress}
            >
              <Text style={styles.loginText}>去登录</Text>
            </TouchableOpacity>
          </View>
        ) : loading && items.length === 0 ? (
          <View style={[styles.center, { paddingTop: topPadding }]}>
            <ActivityIndicator color="#00AEEC" />
          </View>
        ) : error && items.length === 0 ? (
          <View style={[styles.center, { paddingTop: topPadding }]}>
            <Text style={{ color: theme.textSub }}>{error}</Text>
            <TouchableOpacity
              style={styles.loginBtn}
              onPress={() => load(true, "", true)}
              activeOpacity={0.7}
            >
              <Text style={styles.loginText}>重试</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={items}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingTop: topPadding, paddingBottom: 16 }}
            ListHeaderComponent={
              showFilter ? (
                <View style={[styles.filterBar, { backgroundColor: theme.bg }]}>
                  {(
                    [
                      { key: "all", label: "全部" },
                      { key: "video", label: "视频" },
                      { key: "text", label: "图文" },
                    ] as { key: DynFilter; label: string }[]
                  ).map((f) => (
                    <TouchableOpacity
                      key={f.key}
                      style={[
                        styles.filterChip,
                        dynFilter === f.key && styles.filterChipActive,
                      ]}
                      activeOpacity={0.7}
                      onPress={() => switchFilter(f.key)}
                    >
                      <Text
                        style={[
                          styles.filterText,
                          { color: theme.textSub },
                          dynFilter === f.key && styles.filterTextActive,
                        ]}
                      >
                        {f.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null
            }
            renderItem={renderItem}
            onScroll={onScroll}
            scrollEventThrottle={16}
            onEndReached={() => load(false)}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              loading && items.length > 0 ? (
                <ActivityIndicator color="#00AEEC" style={styles.footerLoading} />
              ) : null
            }
            ListEmptyComponent={
              !loading ? (
                <View style={styles.emptyBox}>
                  <Text style={{ color: theme.textSub }}>暂无动态</Text>
                </View>
              ) : null
            }
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => load(true, "", true)}
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyBox: { alignItems: "center", paddingVertical: 48 },
  filterBar: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: "rgba(128,128,128,0.12)",
  },
  filterChipActive: { backgroundColor: "#00AEEC" },
  filterText: { fontSize: 13 },
  filterTextActive: { color: "#fff", fontWeight: "600" },
  tip: { fontSize: 14 },
  loginBtn: {
    backgroundColor: "#00AEEC",
    borderRadius: 8,
    paddingHorizontal: 28,
    paddingVertical: 10,
  },
  loginText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  card: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  authorRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#ddd" },
  authorInfo: { marginLeft: 10, flex: 1 },
  authorName: { fontSize: 14, fontWeight: "600" },
  pubTime: { fontSize: 12, marginTop: 2 },
  avRow: { flexDirection: "row", alignItems: "center" },
  thumbWrap: { position: "relative" },
  thumb: { width: 140, height: 79, borderRadius: 6, backgroundColor: "#ddd" },
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
  avInfo: { flex: 1, marginLeft: 10, justifyContent: "center" },
  avTitle: { fontSize: 14, fontWeight: "500", lineHeight: 19 },
  avMeta: { fontSize: 12, marginTop: 6 },
  textContent: { fontSize: 14, lineHeight: 21 },
  footerLoading: { paddingVertical: 16 },
});
