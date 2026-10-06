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
import { useAuthStore } from '../store/authStore';
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
  const [foldersError, setFoldersError] = useState('');
  const [videos, setVideos] = useState<FavResource[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const loadingRef = useRef(false);
  // 当前 selectedId 保鲜：响应返回时校验 folderId 是否仍等于它
  const selectedIdRef = useRef<number | null>(null);
  selectedIdRef.current = selectedId;
  // 请求序号：reset 请求抢占时，旧请求的迟到响应被丢弃
  const reqSeqRef = useRef(0);

  const loadFolders = useCallback(() => {
    setFoldersError('');
    const uid = useAuthStore.getState().uid;
    getFavFolders(uid ? Number(uid) : undefined).then((list) => {
      setFolders(list);
      if (list.length > 0) setSelectedId((prev) => prev ?? list[0].id);
    }).catch((e: any) => {
      setFoldersError(e?.message || '加载失败');
    });
  }, []);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  const loadResources = useCallback(async (folderId: number, pn: number, reset = false) => {
    // 非 reset 请求仍走互斥锁；reset 请求抢占（序号递增使在飞旧响应被丢弃）
    if (!reset && loadingRef.current) return;
    const seq = ++reqSeqRef.current;
    loadingRef.current = true;
    if (reset) setRefreshing(true); else setLoading(true);
    try {
      const r = await getFavResources(folderId, pn, PAGE_SIZE);
      if (seq !== reqSeqRef.current) return; // 已被更新的请求抢占，丢弃旧响应
      if (folderId !== selectedIdRef.current) return; // 收藏夹已切换，丢弃旧响应
      setVideos((prev) => (reset ? r.items : [...prev, ...r.items]));
      setPage(pn);
      setHasMore(r.hasMore);
    } catch {}
    finally {
      // 只有最新请求释放锁，避免旧请求把新请求的 loading 状态清掉
      if (seq === reqSeqRef.current) {
        loadingRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
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
      <View style={[styles.topBar, { height: 44 + insets.top, paddingTop: insets.top, backgroundColor: theme.card, borderBottomColor: theme.border }]}>
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
              <Ionicons
                name={foldersError ? 'cloud-offline-outline' : 'star-outline'}
                size={48}
                color={theme.iconDefault}
              />
              <Text style={[styles.emptyText, { color: theme.textSub }]}>
                {foldersError
                  ? `加载失败：${foldersError}`
                  : selectedFolder
                    ? '这个收藏夹是空的'
                    : '暂无收藏夹'}
              </Text>
              {foldersError ? (
                <TouchableOpacity style={styles.retryBtn} onPress={loadFolders} activeOpacity={0.7}>
                  <Text style={styles.retryText}>重试</Text>
                </TouchableOpacity>
              ) : null}
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
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#00AEEC',
  },
  retryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
