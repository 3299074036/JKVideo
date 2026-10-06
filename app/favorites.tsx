import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getFavFolders, getFavResources } from '../services/bilibili';
import type { FavFolder, FavResource, VideoItem } from '../services/types';
import { VideoCard } from '../components/VideoCard';
import { useTheme } from '../utils/theme';

const PAGE_SIZE = 20;

function toVideoItem(r: FavResource): VideoItem {
  return {
    bvid: r.bvid,
    aid: r.aid,
    title: r.title,
    pic: r.pic,
    duration: r.duration,
    desc: '',
    owner: { mid: r.owner.mid, name: r.owner.name, face: r.owner.face },
    stat: null,
  };
}

export default function FavoritesScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [folders, setFolders] = useState<FavFolder[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [videos, setVideos] = useState<FavResource[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const loadingRef = useRef(false);

  useEffect(() => {
    getFavFolders().then((list) => {
      setFolders(list);
      if (list.length > 0) setSelectedId(list[0].id);
    }).catch(() => {});
  }, []);

  const loadResources = useCallback(async (folderId: number, pn: number, reset = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (reset) setRefreshing(true); else setLoading(true);
    try {
      const r = await getFavResources(folderId, pn, PAGE_SIZE);
      setVideos((prev) => (reset ? r.items : [...prev, ...r.items]));
      setPage(pn);
      setHasMore(r.hasMore);
    } catch {}
    finally {
      loadingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId != null) {
      setVideos([]);
      setHasMore(true);
      loadResources(selectedId, 1, true);
    }
  }, [selectedId, loadResources]);

  const rows = useMemo(() => {
    const result: { left: FavResource; right?: FavResource }[] = [];
    for (let i = 0; i < videos.length; i += 2) {
      result.push({ left: videos[i], right: videos[i + 1] });
    }
    return result;
  }, [videos]);

  const renderRow = useCallback(({ item }: { item: { left: FavResource; right?: FavResource } }) => (
    <View style={styles.row}>
      <View style={styles.leftCol}>
        <VideoCard
          item={toVideoItem(item.left)}
          onPress={() => router.push(`/video/${item.left.bvid}` as any)}
        />
      </View>
      {item.right && (
        <View style={styles.rightCol}>
          <VideoCard
            item={toVideoItem(item.right)}
            onPress={() => router.push(`/video/${item.right!.bvid}` as any)}
          />
        </View>
      )}
    </View>
  ), [router]);

  const selectedFolder = folders.find((f) => f.id === selectedId);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['left', 'right']}>
      <View style={[styles.topBar, { paddingTop: insets.top, backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.topTitle, { color: theme.text }]}>我的收藏</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipRow}
        contentContainerStyle={styles.chipContent}
      >
        {folders.map((f) => (
          <TouchableOpacity
            key={f.id}
            style={[
              styles.chip,
              { backgroundColor: theme.inputBg },
              selectedId === f.id && styles.chipActive,
            ]}
            onPress={() => setSelectedId(f.id)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.chipText,
                { color: theme.textSub },
                selectedId === f.id && styles.chipTextActive,
              ]}
            >
              {f.title}（{f.mediaCount}）
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={rows}
        keyExtractor={(r) => `${r.left.bvid}-${r.right?.bvid ?? 'x'}`}
        renderItem={renderRow}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => selectedId != null && loadResources(selectedId, 1, true)}
          />
        }
        onEndReached={() => {
          if (selectedId != null && hasMore && !loadingRef.current) {
            loadResources(selectedId, page + 1);
          }
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loading ? (
            <View style={styles.footer}>
              <ActivityIndicator color="#00AEEC" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          !loading && !refreshing ? (
            <View style={styles.empty}>
              <Ionicons name="star-outline" size={48} color={theme.iconDefault} />
              <Text style={[styles.emptyText, { color: theme.textSub }]}>
                {selectedFolder ? '这个收藏夹是空的' : '暂无收藏夹'}
              </Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, alignItems: 'center' },
  topTitle: { fontSize: 17, fontWeight: '600' },
  chipRow: { maxHeight: 52 },
  chipContent: { paddingHorizontal: 12, gap: 8, alignItems: 'center', height: 52 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18 },
  chipActive: { backgroundColor: '#00AEEC' },
  chipText: { fontSize: 13, fontWeight: '500' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  list: { paddingBottom: 16 },
  row: { flexDirection: 'row', paddingHorizontal: 1 },
  leftCol: { marginLeft: 4, marginRight: 2 },
  rightCol: { marginLeft: 2, marginRight: 4 },
  empty: { alignItems: 'center', paddingTop: 120, gap: 12 },
  emptyText: { fontSize: 14 },
  footer: { paddingVertical: 16, alignItems: 'center' },
});
