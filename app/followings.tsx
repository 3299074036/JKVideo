import React, { useEffect, useState, useCallback, useRef } from 'react';
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
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/authStore';
import { getFollowings, getFollowTags, getTagFollowings } from '../services/bilibili';
import type { FollowUser, FollowTag } from '../services/types';
import { useTheme } from '../utils/theme';
import { proxyImageUrl } from '../utils/imageUrl';

const PAGE_SIZE = 20;

/** null = 全部关注，其他为 tagid */
type SelTag = number | null;

export default function FollowingsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const uid = useAuthStore((s) => s.uid);

  const [tags, setTags] = useState<FollowTag[]>([]);
  const [selTag, setSelTag] = useState<SelTag>(null);
  const [users, setUsers] = useState<FollowUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const loadingRef = useRef(false);
  const selTagRef = useRef<SelTag>(null);
  selTagRef.current = selTag;
  // 请求序号：reset 请求抢占时，旧请求的迟到响应被丢弃
  const reqSeqRef = useRef(0);

  const load = useCallback(async (pn: number, reset = false) => {
    if (!uid) return;
    // 非 reset 请求仍走互斥锁；reset 请求抢占（序号递增使在飞旧响应被丢弃）
    if (!reset && loadingRef.current) return;
    const seq = ++reqSeqRef.current;
    const tag = selTagRef.current;
    loadingRef.current = true;
    if (reset) setRefreshing(true); else setLoading(true);
    try {
      if (tag == null) {
        const r = await getFollowings(Number(uid), pn, PAGE_SIZE);
        if (seq !== reqSeqRef.current) return; // 已被更新的请求抢占，丢弃旧响应
        if (selTagRef.current !== tag) return; // 分组已切换，丢弃旧分组的响应
        setUsers((prev) => (reset ? r.items : [...prev, ...r.items]));
        setTotal(r.total);
        setHasMore(pn * PAGE_SIZE < r.total);
        setPage(pn);
      } else {
        const r = await getTagFollowings(tag, pn, PAGE_SIZE);
        if (seq !== reqSeqRef.current) return; // 已被更新的请求抢占，丢弃旧响应
        if (selTagRef.current !== tag) return; // 分组已切换，丢弃旧分组的响应
        setUsers((prev) => (reset ? r.items : [...prev, ...r.items]));
        setTotal(0);
        setHasMore(r.hasMore);
        setPage(pn);
      }
    } catch {}
    finally {
      // 只有最新请求释放锁，避免旧请求把新请求的 loading 状态清掉
      if (seq === reqSeqRef.current) {
        loadingRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [uid]);

  useEffect(() => {
    getFollowTags().then(setTags).catch(() => {});
  }, []);

  useEffect(() => {
    setUsers([]);
    setPage(1);
    setHasMore(true);
    load(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, selTag]);

  const switchTag = (t: SelTag) => {
    if (t === selTag) return;
    setSelTag(t);
  };

  const renderItem = useCallback(({ item }: { item: FollowUser }) => (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: theme.card }]}
      onPress={() => router.push(`/creator/${item.mid}` as any)}
      activeOpacity={0.8}
    >
      <Image
        source={{ uri: proxyImageUrl(item.face) }}
        style={styles.avatar}
        contentFit="cover"
      />
      <View style={styles.info}>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
          {item.uname}
        </Text>
        {item.sign ? (
          <Text style={[styles.sign, { color: theme.textSub }]} numberOfLines={1}>
            {item.sign}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.iconDefault} />
    </TouchableOpacity>
  ), [router, theme]);

  const selTagName = selTag == null ? '全部' : (tags.find((t) => t.tagid === selTag)?.name ?? '');

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['left', 'right']}>
      <View style={[styles.topBar, { height: 44 + insets.top, paddingTop: insets.top, backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.topTitle, { color: theme.text }]}>
          我的关注{total > 0 && selTag == null ? `（${total}）` : ''}
        </Text>
        <View style={styles.backBtn} />
      </View>

      {tags.length > 0 && (
        <View style={[styles.chipBar, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipContent}
          >
            <TouchableOpacity
              style={[styles.chip, selTag == null && styles.chipActive]}
              activeOpacity={0.7}
              onPress={() => switchTag(null)}
            >
              <Text style={[styles.chipText, { color: theme.textSub }, selTag == null && styles.chipTextActive]}>
                全部
              </Text>
            </TouchableOpacity>
            {tags.map((t) => (
              <TouchableOpacity
                key={t.tagid}
                style={[styles.chip, selTag === t.tagid && styles.chipActive]}
                activeOpacity={0.7}
                onPress={() => switchTag(t.tagid)}
              >
                <Text style={[styles.chipText, { color: theme.textSub }, selTag === t.tagid && styles.chipTextActive]}>
                  {t.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <FlatList
        data={users}
        keyExtractor={(u) => String(u.mid)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(1, true)} />
        }
        onEndReached={() => {
          if (hasMore && !loading) load(page + 1);
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
              <Ionicons name="heart-outline" size={48} color={theme.iconDefault} />
              <Text style={[styles.emptyText, { color: theme.textSub }]}>
                {selTag == null ? '还没有关注任何 UP 主' : `「${selTagName}」分组暂无 UP 主`}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, alignItems: 'center' },
  topTitle: { fontSize: 17, fontWeight: '600' },
  chipBar: { borderBottomWidth: StyleSheet.hairlineWidth },
  chipContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(128,128,128,0.12)',
  },
  chipActive: { backgroundColor: '#00AEEC' },
  chipText: { fontSize: 13 },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  list: { padding: 12, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    padding: 12,
  },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#eee' },
  info: { flex: 1, marginLeft: 12, gap: 4 },
  name: { fontSize: 15, fontWeight: '600' },
  sign: { fontSize: 12 },
  empty: { alignItems: 'center', paddingTop: 120, gap: 12 },
  emptyText: { fontSize: 14 },
  footer: { paddingVertical: 16, alignItems: 'center' },
});
