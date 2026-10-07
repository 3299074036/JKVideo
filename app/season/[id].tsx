import React, { useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getCachedSeason, type Season } from "../../utils/seasonCache";
import { proxyImageUrl } from "../../utils/imageUrl";
import { formatCount } from "../../utils/format";
import { useTheme } from "../../utils/theme";

type Episode = Season["sections"][number]["episodes"][number];
type Row =
  | { kind: "section"; key: string; title: string }
  | { kind: "ep"; key: string; ep: Episode; index: number };

export default function SeasonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const season = getCachedSeason(Number(id));

  const rows = useMemo<Row[]>(() => {
    if (!season) return [];
    const out: Row[] = [];
    let n = 0;
    const sections = season.sections ?? [];
    sections.forEach((sec, si) => {
      const eps = sec.episodes ?? [];
      if (sections.length > 1 && eps.length) {
        out.push({ kind: "section", key: `sec-${si}`, title: `第${si + 1}节 · 共${eps.length}个视频` });
      }
      eps.forEach((ep) => {
        n += 1;
        out.push({ kind: "ep", key: ep.bvid, ep, index: n });
      });
    });
    return out;
  }, [season]);

  if (!season) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.card }]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.topTitle, { color: theme.text }]}>合集</Text>
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="small" color="#00AEEC" />
          <Text style={[styles.hint, { color: theme.textSub }]}>
            合集数据已过期，请返回视频页重新进入
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.card }]}>
      <View style={[styles.topBar, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.topTitle, { color: theme.text }]} numberOfLines={1}>
          合集 · {season.title}
        </Text>
      </View>
      <View style={styles.head}>
        {season.cover ? (
          <Image source={{ uri: proxyImageUrl(season.cover) }} style={styles.cover} />
        ) : null}
        <View style={styles.headInfo}>
          <Text style={[styles.headTitle, { color: theme.text }]} numberOfLines={2}>
            {season.title}
          </Text>
          <Text style={[styles.headSub, { color: theme.textSub }]}>共 {season.ep_count} 个视频</Text>
        </View>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          if (item.kind === "section") {
            return (
              <Text style={[styles.secTitle, { color: theme.textSub }]}>{item.title}</Text>
            );
          }
          const { ep, index } = item;
          return (
            <TouchableOpacity
              style={[styles.row, { borderBottomColor: theme.border }]}
              activeOpacity={0.8}
              onPress={() => router.replace(`/video/${ep.bvid}`)}
            >
              <View style={styles.thumbWrap}>
                {ep.arc?.pic ? (
                  <Image source={{ uri: proxyImageUrl(ep.arc.pic) }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, { backgroundColor: theme.inputBg }]} />
                )}
              </View>
              <View style={styles.info}>
                <Text style={[styles.epNum, { color: theme.textSub }]}>第{index}集</Text>
                <Text style={[styles.epTitle, { color: theme.text }]} numberOfLines={2}>
                  {ep.title}
                </Text>
                {ep.arc?.stat?.view ? (
                  <Text style={[styles.epStat, { color: theme.textSub }]}>
                    {formatCount(ep.arc.stat.view)} 播放
                  </Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={16} color="#bbb" />
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
    gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topTitle: { fontSize: 16, fontWeight: "700", flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  hint: { fontSize: 13 },
  head: { flexDirection: "row", padding: 14, gap: 12, alignItems: "center" },
  cover: { width: 96, height: 60, borderRadius: 6 },
  headInfo: { flex: 1, gap: 6 },
  headTitle: { fontSize: 15, fontWeight: "700", lineHeight: 21 },
  headSub: { fontSize: 12 },
  secTitle: { fontSize: 12, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  thumbWrap: { width: 120, height: 68, borderRadius: 6, overflow: "hidden", flexShrink: 0 },
  thumb: { width: 120, height: 68 },
  info: { flex: 1, gap: 4 },
  epNum: { fontSize: 11 },
  epTitle: { fontSize: 13, lineHeight: 18 },
  epStat: { fontSize: 11 },
});
