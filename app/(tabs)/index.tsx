import React, {
  useEffect,
  useState,
  useRef,
  useMemo,
  useCallback,
} from "react";
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Image,
  RefreshControl,
  ViewToken,
  FlatList,
  ScrollView,
} from "react-native";
import PagerView from "react-native-pager-view";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { VideoCard } from "../../components/VideoCard";
import { LiveCard } from "../../components/LiveCard";
import { LoginModal } from "../../components/LoginModal";
import { DownloadProgressBtn } from "../../components/DownloadProgressBtn";
import { useVideoList } from "../../hooks/useVideoList";
import { useLiveList } from "../../hooks/useLiveList";
import { useAuthStore } from "../../store/authStore";
import {
  toListRows,
  type ListRow,
  type BigRow,
} from "../../utils/videoRows";
import { BigVideoCard } from "../../components/BigVideoCard";
import { FollowedLiveStrip } from "../../components/FollowedLiveStrip";
import { RankingList, type RankingListHandle } from "../../components/RankingList";
import { DynamicList, type DynamicListHandle } from "../../components/DynamicList";
import { useTheme } from "../../utils/theme";
import { useVisibleBigKeyStore } from "../../store/visibleBigKeyStore";
import type { LiveRoom } from "../../services/types";

const HEADER_H = 44;
const TAB_H = 38;
const NAV_H = HEADER_H + TAB_H;

const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 50 };

type TabKey = "hot" | "ranking" | "dynamic" | "live";

const TABS: { key: TabKey; label: string }[] = [
  { key: "hot", label: "热门" },
  { key: "ranking", label: "排行榜" },
  { key: "dynamic", label: "动态" },
  { key: "live", label: "直播" },
];

const TAB_INDEX: Record<TabKey, number> = {
  hot: 0,
  ranking: 1,
  dynamic: 2,
  live: 3,
};
const INDEX_TAB: TabKey[] = ["hot", "ranking", "dynamic", "live"];

// 滚动累计阈值：方向反转后需累计滚动该距离才触发显隐切换
const SCROLL_THRESHOLD = 40;
// 显隐过渡时长
const HEADER_ANIM_MS = 100;

/**
 * 首页各 tab 共用的导航栏"滚动隐藏/显示"逻辑。
 * 原来 hot/live 各写一套，这里抽成 hook，四份行为完全一致。
 */
function useCollapsibleHeader() {
  const offset = useRef(new Animated.Value(0)).current; // 0 = 显示，HEADER_H = 隐藏
  const scrollState = useRef({ lastY: 0, acc: 0, dir: 0, hidden: false }).current;

  const animate = useCallback(
    (hide: boolean) => {
      Animated.timing(offset, {
        toValue: hide ? HEADER_H : 0,
        duration: HEADER_ANIM_MS,
        useNativeDriver: true,
      }).start();
    },
    [offset],
  );

  const onScroll = useCallback(
    (e: any) => {
      const y = e.nativeEvent.contentOffset.y;
      const state = scrollState;
      // 顶部强制显示
      if (y <= 0) {
        if (state.hidden) {
          state.hidden = false;
          animate(false);
        }
        state.lastY = 0;
        state.acc = 0;
        state.dir = 0;
        return;
      }
      const dy = y - state.lastY;
      state.lastY = y;
      if (Math.abs(dy) < 1) return;
      const dir = dy > 0 ? 1 : -1; // 1=向下滚（隐藏），-1=向上滚（显示）
      if (dir !== state.dir) {
        state.dir = dir;
        state.acc = 0;
      }
      state.acc += Math.abs(dy);
      if (state.acc < SCROLL_THRESHOLD) return;
      const shouldHide = dir === 1;
      if (shouldHide !== state.hidden) {
        state.hidden = shouldHide;
        animate(shouldHide);
      }
      state.acc = 0;
    },
    [animate, scrollState],
  );

  const translate = offset.interpolate({
    inputRange: [0, HEADER_H],
    outputRange: [0, -HEADER_H],
    extrapolate: "clamp",
  });
  const opacity = offset.interpolate({
    inputRange: [0, HEADER_H * 0.6, HEADER_H],
    outputRange: [1, 1, 0],
    extrapolate: "clamp",
  });

  return { translate, opacity, onScroll };
}

const LIVE_AREAS = [
  { id: 0, name: "推荐" },
  { id: 2, name: "网游" },
  { id: 3, name: "手游" },
  { id: 6, name: "单机游戏" },
  { id: 1, name: "娱乐" },
  { id: 9, name: "虚拟主播" },
  { id: 10, name: "生活" },
  { id: 11, name: "知识" },
];

export default function HomeScreen() {
  const router = useRouter();
  const { pages, loading, refreshing, load, refresh } = useVideoList();
  const {
    rooms,
    loading: liveLoading,
    refreshing: liveRefreshing,
    load: liveLoad,
    refresh: liveRefresh,
  } = useLiveList();
  const { isLoggedIn, face } = useAuthStore();
  const [showLogin, setShowLogin] = useState(false);
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabKey>("hot");
  const [liveAreaId, setLiveAreaId] = useState(0);

  const theme = useTheme();
  const rows = useMemo(() => toListRows(pages), [pages]);
  const pagerRef = useRef<PagerView>(null);

  const hotListRef = useRef<FlatList>(null);
  const liveListRef = useRef<FlatList>(null);

  const onViewableItemsChangedRef = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const bigRow = viewableItems.find(
        (v) => v.item && (v.item as ListRow).type === "big",
      );
      useVisibleBigKeyStore.getState().setKey(bigRow ? (bigRow.item as BigRow).item.bvid : null);
    },
  ).current;

  // 各 tab 的导航栏显隐状态（行为一致，抽成 hook）
  const tabHeaders = {
    hot: useCollapsibleHeader(),
    ranking: useCollapsibleHeader(),
    dynamic: useCollapsibleHeader(),
    live: useCollapsibleHeader(),
  };

  useEffect(() => {
    load();
  }, []);

  const rankingRef = useRef<RankingListHandle>(null);
  const dynamicRef = useRef<DynamicListHandle>(null);
  // 排行/动态 tab 首次进入时才挂载列表，避免首页打开就多发请求
  const [visitedTabs, setVisitedTabs] = useState<TabKey[]>(["hot"]);
  const markVisited = useCallback((key: TabKey) => {
    setVisitedTabs((prev) => (prev.includes(key) ? prev : [...prev, key]));
  }, []);

  const handleTabPress = useCallback(
    (key: TabKey) => {
      markVisited(key);
      if (key === activeTab) {
        // 点击已激活的 tab：滚动到顶部并刷新
        if (key === "hot") {
          hotListRef.current?.scrollToOffset({ offset: 0, animated: true });
          refresh();
        } else if (key === "ranking") {
          rankingRef.current?.scrollToTop();
          rankingRef.current?.refresh();
        } else if (key === "dynamic") {
          dynamicRef.current?.scrollToTop();
          dynamicRef.current?.refresh();
        } else {
          liveListRef.current?.scrollToOffset({ offset: 0, animated: true });
          liveRefresh(liveAreaId);
        }
        return;
      }
      // 切换 tab
      pagerRef.current?.setPage(TAB_INDEX[key]);
      setActiveTab(key);
      if (key === "live" && rooms.length === 0) {
        liveLoad(true, liveAreaId);
      }
    },
    [activeTab, rooms.length, liveAreaId, markVisited],
  );

  const onPageSelected = useCallback(
    (e: any) => {
      const key: TabKey = INDEX_TAB[e.nativeEvent.position] ?? "hot";
      markVisited(key);
      if (key === activeTab) return;
      setActiveTab(key);
      if (key === "live" && rooms.length === 0) {
        liveLoad(true, liveAreaId);
      }
    },
    [activeTab, rooms.length, liveAreaId, markVisited],
  );

  const handleLiveAreaPress = useCallback(
    (areaId: number) => {
      if (areaId === liveAreaId) return;
      setLiveAreaId(areaId);
      liveListRef.current?.scrollToOffset({ offset: 0, animated: false });
      liveLoad(true, areaId);
    },
    [liveAreaId, liveLoad],
  );

  const renderItem = useCallback(({ item: row }: { item: ListRow }) => {
    if (row.type === "big") {
      return (
        <BigVideoCard
          item={row.item}
          onPress={() => router.push(`/video/${row.item.bvid}` as any)}
        />
      );
    }
    const right = row.right;
    return (
      <View style={styles.row}>
        <View style={styles.leftCol}>
          <VideoCard
            item={row.left}
            onPress={() => router.push(`/video/${row.left.bvid}` as any)}
          />
        </View>
        {right && (
          <View style={styles.rightCol}>
            <VideoCard
              item={right}
              onPress={() => router.push(`/video/${right.bvid}` as any)}
            />
          </View>
        )}
      </View>
    );
  }, []);

  const renderLiveItem = useCallback(
    ({ item }: { item: { left: LiveRoom; right?: LiveRoom } }) => (
      <View style={styles.row}>
        <View style={styles.leftCol}>
          <LiveCard
            item={item.left}
            onPress={() => router.push(`/live/${item.left.roomid}` as any)}
          />
        </View>
        {item.right && (
          <View style={styles.rightCol}>
            <LiveCard
              item={item.right}
              onPress={() => router.push(`/live/${item.right!.roomid}` as any)}
            />
          </View>
        )}
      </View>
    ),
    [],
  );

  // 将直播列表分成两列的行
  const liveRows = useMemo(() => {
    const result: { left: LiveRoom; right?: LiveRoom }[] = [];
    for (let i = 0; i < rooms.length; i += 2) {
      result.push({ left: rooms[i], right: rooms[i + 1] });
    }
    return result;
  }, [rooms]);

  const currentHeaderTranslate = tabHeaders[activeTab].translate;
  const currentHeaderOpacity = tabHeaders[activeTab].opacity;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={["left", "right"]}>
      {/* 滑动切换容器 */}
      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        scrollEnabled={false}
        onPageSelected={onPageSelected}
      >
        {/* 热门列表 */}
        <View key="hot" collapsable={false}>
          <Animated.FlatList
            ref={hotListRef as any}
            style={styles.listContainer}
            data={rows}
            keyExtractor={(row: any) =>
              row.type === "big"
                ? `big-${row.item.bvid}`
                : `pair-${row.left.bvid}-${row.right?.bvid ?? "empty"}`
            }
            contentContainerStyle={{
              paddingTop: insets.top + NAV_H + 6,
              paddingBottom: insets.bottom + 16,
            }}
            renderItem={renderItem}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refresh}
                progressViewOffset={insets.top + NAV_H}
              />
            }
            onEndReached={() => load()}
            onEndReachedThreshold={0.5}
            viewabilityConfig={VIEWABILITY_CONFIG}
            onViewableItemsChanged={onViewableItemsChangedRef}
            ListFooterComponent={
              <View style={styles.footer}>
                {loading && <ActivityIndicator color="#00AEEC" />}
              </View>
            }
            onScroll={tabHeaders.hot.onScroll}
            scrollEventThrottle={16}
            windowSize={7}
            maxToRenderPerBatch={6}
            removeClippedSubviews={true}
          />
        </View>

        {/* 排行榜 */}
        <View key="ranking" collapsable={false} style={styles.listContainer}>
          {visitedTabs.includes("ranking") && (
            <RankingList
              ref={rankingRef}
              topPadding={insets.top + NAV_H + 6}
              onScroll={tabHeaders.ranking.onScroll}
            />
          )}
        </View>

        {/* 动态 */}
        <View key="dynamic" collapsable={false} style={styles.listContainer}>
          {visitedTabs.includes("dynamic") && (
            <DynamicList
              ref={dynamicRef}
              topPadding={insets.top + NAV_H + 6}
              onScroll={tabHeaders.dynamic.onScroll}
              onLoginPress={() => setShowLogin(true)}
            />
          )}
        </View>

        {/* 直播列表 */}
        <View key="live" collapsable={false}>
          <Animated.FlatList
            ref={liveListRef as any}
            style={styles.listContainer}
            data={liveRows}
            keyExtractor={(item: any, index: number) =>
              `live-${index}-${item.left.roomid}-${item.right?.roomid ?? "empty"}`
            }
            contentContainerStyle={{
              paddingTop: insets.top + NAV_H + 6,
              paddingBottom: insets.bottom + 16,
            }}
            renderItem={renderLiveItem}
            ListHeaderComponent={
              <View>
                <FollowedLiveStrip />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.areaTabRow}
                  contentContainerStyle={styles.areaTabContent}
                >
                  {LIVE_AREAS.map((area) => (
                    <TouchableOpacity
                      key={area.id}
                      style={[
                        styles.areaTab,
                        liveAreaId === area.id && styles.areaTabActive,
                      ]}
                      onPress={() => handleLiveAreaPress(area.id)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.areaTabText,
                          liveAreaId === area.id && styles.areaTabTextActive,
                        ]}
                      >
                        {area.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            }
            refreshControl={
              <RefreshControl
                refreshing={liveRefreshing}
                onRefresh={() => liveRefresh(liveAreaId)}
                progressViewOffset={insets.top + NAV_H}
              />
            }
            onEndReached={() => liveLoad()}
            onEndReachedThreshold={1.5}
            ListFooterComponent={
              liveLoading ? (
                <View style={styles.footer}>
                  <ActivityIndicator color="#00AEEC" />
                  <Text style={styles.footerText}>加载中...</Text>
                </View>
              ) : null
            }
            onScroll={tabHeaders.live.onScroll}
            scrollEventThrottle={16}
            windowSize={7}
            maxToRenderPerBatch={6}
            removeClippedSubviews={true}
          />
        </View>
      </PagerView>

      {/* 绝对定位导航栏 */}
      <Animated.View
        style={[
          styles.navBar,
          {
            paddingTop: insets.top,
            backgroundColor: theme.card,
            transform: [{ translateY: currentHeaderTranslate }],
          },
        ]}
      >
        <Animated.View
          style={[
            styles.header,
            {
              opacity: currentHeaderOpacity,
            },
          ]}
        >
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => (isLoggedIn ? router.navigate('/(tabs)/mine' as any) : setShowLogin(true))}
            >
              {isLoggedIn && face ? (
                <Image source={{ uri: face }} style={styles.userAvatar} />
              ) : (
                <Ionicons
                  name={isLoggedIn ? "person" : "person-outline"}
                  size={22}
                  color="#00AEEC"
                />
              )}
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.searchBar, { backgroundColor: theme.inputBg }]}
            onPress={() => router.push("/search" as any)}
            activeOpacity={0.7}
          >
            <Ionicons name="search" size={14} color={theme.textSub} />
            <Text style={[styles.searchPlaceholder, { color: theme.textSub }]}>搜索视频、UP主...</Text>
          </TouchableOpacity>
          <DownloadProgressBtn
            onPress={() => router.push("/downloads" as any)}
          />
        </Animated.View>

        <View style={[styles.tabRow, { backgroundColor: theme.card }]}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabItem}
              onPress={() => handleTabPress(tab.key)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: theme.textSub },
                  activeTab === tab.key && styles.tabTextActive,
                ]}
              >
                {tab.label}
              </Text>
              {activeTab === tab.key && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>

      <LoginModal visible={showLogin} onClose={() => setShowLogin(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f4f4" },
  pager: { flex: 1 },
  listContainer: { flex: 1 },
  navBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: "#fff",
    overflow: "hidden",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  header: {
    height: HEADER_H,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 10,
  },
  logo: {
    fontSize: 20,
    fontWeight: "800",
    color: "#00AEEC",
    letterSpacing: -0.5,
    width: 72,
  },
  searchBar: {
    flex: 1,
    height: 34,
    marginLeft: 8,
    backgroundColor: "#f4f4f6",
    borderRadius: 17,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 6,
  },
  downloadBtn: {},
  searchPlaceholder: {
    fontSize: 13,
    color: "#999",
    flex: 1,
  },
  headerRight: { flexDirection: "row", gap: 8, alignItems: "center" },
  headerBtn: { paddingLeft: 0 },
  userAvatar: {
    width: 35,
    height: 35,
    borderRadius: 50,
    backgroundColor: "#eee",
  },
  tabRow: {
    height: TAB_H,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  tabItem: {
    alignItems: "center",
    justifyContent: "center",
    height: TAB_H,
  },
  tabText: {
    fontSize: 15,
    fontWeight: "450",
    color: "#999",
  },
  tabTextActive: {
    fontWeight: "700",
    color: "#00AEEC",
  },
  tabUnderline: {
    position: "absolute",
    bottom: 6,
    width: 28,
    height: 3.5,
    backgroundColor: "#00AEEC",
    borderRadius: 2,
  },
  row: {
    flexDirection: "row",
    paddingHorizontal: 1,
    justifyContent: "flex-start",
  },
  leftCol: { marginLeft: 4, marginRight: 2 },
  rightCol: { marginLeft: 2, marginRight: 4 },
  footer: {
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  footerText: { fontSize: 12, color: "#999" },
  areaTabRow: {
    marginBottom: 6,
  },
  areaTabContent: {
    paddingHorizontal: 8,
    gap: 8,
    alignItems: "center",
    height: 36,
  },
  areaTab: {
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 16,
  },
  areaTabActive: {
    backgroundColor: "#00AEEC",
  },
  areaTabText: {
    fontSize: 13,
    color: "#333",
    fontWeight: "500",
  },
  areaTabTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
});
