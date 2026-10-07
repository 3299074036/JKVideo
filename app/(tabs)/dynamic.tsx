import React, { useCallback, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import PagerView from "react-native-pager-view";
import { DynamicList, type DynFilter } from "../../components/DynamicList";
import { LoginModal } from "../../components/LoginModal";
import { useTheme } from "../../utils/theme";

const FILTERS: { key: DynFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "video", label: "视频" },
  { key: "text", label: "图文" },
];

export default function DynamicScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const pagerRef = useRef<PagerView>(null);
  const [pageIdx, setPageIdx] = useState(0);
  const [showLogin, setShowLogin] = useState(false);

  const switchFilter = useCallback((idx: number) => {
    if (idx === pageIdx) return;
    setPageIdx(idx);
    pagerRef.current?.setPage(idx);
  }, [pageIdx]);

  const onPageSelected = useCallback((e: any) => {
    const pos = e.nativeEvent.position ?? 0;
    setPageIdx(pos);
  }, []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={["left", "right"]}>
      <View
        style={[
          styles.topBar,
          {
            height: 44 + insets.top,
            paddingTop: insets.top,
            backgroundColor: theme.card,
            borderBottomColor: theme.border,
          },
        ]}
      >
        <Text style={[styles.topTitle, { color: theme.text }]}>动态</Text>
      </View>
      {/* 筛选条：固定在 PagerView 上方，点选与滑动互相同步 */}
      <View style={[styles.filterBar, { backgroundColor: theme.bg }]}>
        {FILTERS.map((f, i) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, pageIdx === i && styles.filterChipActive]}
            activeOpacity={0.7}
            onPress={() => switchFilter(i)}
          >
            <Text
              style={[
                styles.filterText,
                { color: theme.textSub },
                pageIdx === i && styles.filterTextActive,
              ]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.listWrap}>
        <PagerView
          ref={pagerRef}
          style={styles.pager}
          initialPage={0}
          onPageSelected={onPageSelected}
        >
          {FILTERS.map((f) => (
            <View key={f.key} collapsable={false} style={styles.page}>
              <DynamicList
                filter={f.key}
                topPadding={0}
                onScroll={() => {}}
                onLoginPress={() => setShowLogin(true)}
              />
            </View>
          ))}
        </PagerView>
      </View>
      <LoginModal visible={showLogin} onClose={() => setShowLogin(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topTitle: { fontSize: 17, fontWeight: "600" },
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
  listWrap: { flex: 1 },
  pager: { flex: 1 },
  page: { flex: 1 },
});
