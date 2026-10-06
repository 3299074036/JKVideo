import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/authStore';
import { usePlayProgressStore } from '../store/playProgressStore';
import {
  getHistoryList,
  deleteHistoryItem,
  clearHistory,
} from '../services/bilibili';
import type { HistoryItem } from '../services/types';
import { useTheme } from '../utils/theme';
import { proxyImageUrl } from '../utils/imageUrl';
import { formatDuration, formatTime } from '../utils/format';
import { toast } from '../utils/toast';

interface LocalRecord {
  bvid: string;
  time: number;
  duration: number;
  ts: number;
}

export default function HistoryScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const localRecords = usePlayProgressStore((s) => s.records);
  const localClear = usePlayProgressStore((s) => s.clear);
  const hydrated = usePlayProgressStore((s) => s.hydrated);

  const [items, setItems] = useState<HistoryItem[]>([]);
  const [cursor, setCursor] = useState({ max: 0, viewAt: 0 });
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const loadingRef = useRef(false);

  const load = useCallback(async (reset = false, c = cursor) => {
    if (!isLoggedIn || loadingRef.current) return;
    loadingRef.current = true;
    if (reset) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const r = await getHistoryList(c.max, c.viewAt);
      setItems((prev) => (reset ? r.items : [...prev, ...r.items]));
      setCursor({ max: r.max, viewAt: r.viewAt });
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [isLoggedIn, cursor]);

  useEffect(() => {
    if (isLoggedIn) {
      setItems([]);
      setCursor({ max: 0, viewAt: 0 });
      load(true, { max: 0, viewAt: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]);

  const handleDelete = useCallback((item: HistoryItem) => {
    Alert.alert('删除记录', '确定删除这条观看记录吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteHistoryItem(item.kid);
            setItems((prev) => prev.filter((i) => i.kid !== item.kid));
          } catch {
            toast('删除失败，请重试');
          }
        },
      },
    ]);
  }, []);

  const handleClear = useCallback(() => {
    Alert.alert('清空历史', '确定清空全部观看记录吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '清空',
        style: 'destructive',
        onPress: async () => {
          try {
            await clearHistory();
            setItems([]);
            setCursor({ max: 0, viewAt: 0 });
            toast('已清空');
          } catch {
            toast('清空失败，请重试');
          }
        },
      },
    ]);
  }, []);

  const localList: LocalRecord[] = Object.values(localRecords).sort((a, b) => b.ts - a.ts);

  const renderCloudItem = ({ item }: { item: HistoryItem }) => {
    const pct = item.duration > 0 && item.progress > 0
      ? Math.min(100, (item.progress / item.duration) * 100)
      : 0;
    return (
      <TouchableOpacity
        style={[styles.row, { backgroundColor: theme.card }]}
        onPress={() => router.push(`/video/${item.bvid}` as any)}
        activeOpacity={0.85}
      >
        <Image
          source={{ uri: proxyImageUrl(item.pic) }}
          style={styles.cover}
          contentFit="cover"
        />
        <View style={styles.info}>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={[styles.sub, { color: theme.textSub }]} numberOfLines={1}>
            {item.owner.name} · {formatTime(item.viewAt)}
          </Text>
          {pct > 0 && (
            <View style={styles.progressRow}>
              <View style={[styles.progressBg, { backgroundColor: theme.inputBg }]}>
                <View style={[styles.progressFg, { width: `${pct}%` }]} />
              </View>
              <Text style={[styles.progressText, { color: theme.textSub }]}>
                {formatDuration(item.progress)}
              </Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          style={styles.delBtn}
          onPress={() => handleDelete(item)}
          hitSlop={8}
        >
          <Ionicons name="close" size={18} color={theme.iconDefault} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderLocalItem = ({ item }: { item: LocalRecord }) => {
    const pct = item.duration > 0 ? Math.min(100, (item.time / item.duration) * 100) : 0;
    return (
      <TouchableOpacity
        style={[styles.row, { backgroundColor: theme.card }]}
        onPress={() => router.push(`/video/${item.bvid}` as any)}
        activeOpacity={0.85}
      >
        <View style={[styles.cover, styles.localCover, { backgroundColor: theme.inputBg }]}>
          <Ionicons name="play-circle-outline" size={28} color={theme.iconDefault} />
        </View>
        <View style={styles.info}>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
            {item.bvid}
          </Text>
          <Text style={[styles.sub, { color: theme.textSub }]} numberOfLines={1}>
            上次看到 {formatDuration(item.time)} / 共 {formatDuration(item.duration)}
          </Text>
          <View style={styles.progressRow}>
            <View style={[styles.progressBg, { backgroundColor: theme.inputBg }]}>
              <View style={[styles.progressFg, { width: `${pct}%` }]} />
            </View>
          </View>
        </View>
        <TouchableOpacity
          style={styles.delBtn}
          onPress={() => localClear(item.bvid)}
          hitSlop={8}
        >
          <Ionicons name="close" size={18} color={theme.iconDefault} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['left', 'right']}>
      <View style={[styles.topBar, { paddingTop: insets.top, backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.topTitle, { color: theme.text }]}>观看历史</Text>
        {isLoggedIn && items.length > 0 ? (
          <TouchableOpacity style={styles.backBtn} onPress={handleClear} activeOpacity={0.7}>
            <Ionicons name="trash-outline" size={20} color={theme.textSub} />
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}
      </View>

      {isLoggedIn ? (
        error && items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="cloud-offline-outline" size={48} color={theme.iconDefault} />
            <Text style={[styles.emptyText, { color: theme.textSub }]}>加载失败：{error}</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => load(true, { max: 0, viewAt: 0 })}
            >
              <Text style={styles.retryText}>重试</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(it) => it.kid}
            renderItem={renderCloudItem}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => load(true, { max: 0, viewAt: 0 })}
              />
            }
            onEndReached={() => load()}
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
                  <Ionicons name="time-outline" size={48} color={theme.iconDefault} />
                  <Text style={[styles.emptyText, { color: theme.textSub }]}>暂无观看记录</Text>
                </View>
              ) : null
            }
          />
        )
      ) : (
        <FlatList
          data={hydrated ? localList : []}
          keyExtractor={(it) => it.bvid}
          renderItem={renderLocalItem}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Text style={[styles.hint, { color: theme.textSub }]}>
              未登录，仅显示本机播放进度。登录后可查看云端同步记录。
            </Text>
          }
          ListEmptyComponent={
            hydrated ? (
              <View style={styles.empty}>
                <Ionicons name="time-outline" size={48} color={theme.iconDefault} />
                <Text style={[styles.emptyText, { color: theme.textSub }]}>暂无观看记录</Text>
              </View>
            ) : null
          }
        />
      )}
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
  list: { padding: 12, gap: 10 },
  hint: { fontSize: 12, textAlign: 'center', marginBottom: 4 },
  row: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  cover: { width: 112, height: 64, borderRadius: 6, backgroundColor: '#eee' },
  localCover: { alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, marginLeft: 10, gap: 4 },
  title: { fontSize: 14, fontWeight: '500', lineHeight: 19 },
  sub: { fontSize: 12 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  progressBg: { flex: 1, height: 3, borderRadius: 2, overflow: 'hidden' },
  progressFg: { height: 3, backgroundColor: '#00AEEC', borderRadius: 2 },
  progressText: { fontSize: 11 },
  delBtn: { padding: 6 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 120, gap: 12 },
  emptyText: { fontSize: 14 },
  retryBtn: {
    backgroundColor: '#00AEEC',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  footer: { paddingVertical: 16, alignItems: 'center' },
});
