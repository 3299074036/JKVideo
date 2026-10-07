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
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../store/authStore';
import { getFavFolders, getFavResources, renameFavFolder, deleteFavFolder } from '../services/bilibili';
import type { FavFolder, FavResource, VideoItem } from '../services/types';
import { VideoCard } from '../components/VideoCard';
import { useTheme } from '../utils/theme';
import { toast } from '../utils/toast';

const PAGE_SIZE = 20;
// 收藏夹本机排序（B站未提供排序接口，只影响本 App 内显示顺序）
const ORDER_KEY = 'fav_folder_order';

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
  // ---------- 收藏夹管理 ----------
  const [managing, setManaging] = useState(false);
  const [folderOrder, setFolderOrder] = useState<number[] | null>(null);
  const [renameTarget, setRenameTarget] = useState<FavFolder | null>(null);
  const [renameText, setRenameText] = useState('');
  // 默认收藏夹 id：首次拉取列表时的第一项，不可删除
  const defaultIdRef = useRef<number | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ORDER_KEY).then((raw) => {
      if (!raw) return;
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          setFolderOrder(arr.filter((x) => typeof x === 'number'));
        }
      } catch {}
    }).catch(() => {});
  }, []);

  const persistOrder = useCallback((ids: number[]) => {
    setFolderOrder(ids);
    AsyncStorage.setItem(ORDER_KEY, JSON.stringify(ids)).catch(() => {});
  }, []);

  const orderedFolders = useMemo(() => {
    if (!folderOrder || folderOrder.length === 0) return folders;
    const idx = new Map(folderOrder.map((id, i) => [id, i]));
    return [...folders].sort((a, b) => {
      const ia = idx.has(a.id) ? idx.get(a.id)! : Number.MAX_SAFE_INTEGER;
      const ib = idx.has(b.id) ? idx.get(b.id)! : Number.MAX_SAFE_INTEGER;
      return ia - ib;
    });
  }, [folders, folderOrder]);

  const moveFolder = useCallback((id: number, dir: -1 | 1) => {
    const ids = orderedFoldersRef.current.map((f) => f.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    persistOrder(ids);
  }, [persistOrder]);
  const orderedFoldersRef = useRef<FavFolder[]>([]);
  orderedFoldersRef.current = orderedFolders;

  const openFolderMenu = useCallback((f: FavFolder) => {
    const isDefault = f.id === defaultIdRef.current;
    const buttons: Array<{ text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }> = [
      {
        text: '重命名',
        onPress: () => {
          setRenameTarget(f);
          setRenameText(f.title);
        },
      },
    ];
    if (!isDefault) {
      buttons.push({
        text: '删除',
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            '删除收藏夹',
            `确定删除「${f.title}」吗？\n里面的 ${f.mediaCount} 个视频不会被删除。`,
            [
              { text: '取消', style: 'cancel' },
              {
                text: '删除',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await deleteFavFolder(f.id);
                    setFolders((prev) => prev.filter((x) => x.id !== f.id));
                    setFolderOrder((prev) => prev?.filter((id) => id !== f.id) ?? null);
                    if (selectedIdRef.current === f.id) {
                      const rest = orderedFoldersRef.current.filter((x) => x.id !== f.id);
                      setSelectedId(rest.length > 0 ? rest[0].id : null);
                    }
                    toast('已删除');
                  } catch (e: any) {
                    toast(e?.message || '删除失败');
                  }
                },
              },
            ],
          );
        },
      });
    }
    buttons.push({ text: '取消', style: 'cancel' });
    Alert.alert(f.title, isDefault ? '默认收藏夹不可删除' : undefined, buttons);
  }, []);

  const submitRename = useCallback(async () => {
    const target = renameTarget;
    const t = renameText.trim();
    setRenameTarget(null);
    if (!target || !t || t === target.title) return;
    try {
      await renameFavFolder(target.id, t);
      setFolders((prev) => prev.map((x) => (x.id === target.id ? { ...x, title: t } : x)));
      toast('已重命名');
    } catch (e: any) {
      toast(e?.message || '重命名失败');
    }
  }, [renameTarget, renameText]);

  const loadFolders = useCallback(() => {
    setFoldersError('');
    const uid = useAuthStore.getState().uid;
    getFavFolders(uid ? Number(uid) : undefined).then((list) => {
      setFolders(list);
      if (list.length > 0) {
        if (defaultIdRef.current == null) defaultIdRef.current = list[0].id;
        setSelectedId((prev) => prev ?? list[0].id);
      }
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

  // ---------- 管理模式 ----------
  if (managing) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['left', 'right']}>
        <View style={[styles.topBar, { height: 44 + insets.top, paddingTop: insets.top, backgroundColor: theme.card, borderBottomColor: theme.border }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => setManaging(false)} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.topTitle, { color: theme.text }]}>管理收藏夹</Text>
          <View style={styles.backBtn} />
        </View>
        <FlatList
          data={orderedFolders}
          keyExtractor={(f) => String(f.id)}
          contentContainerStyle={styles.mgmtList}
          renderItem={({ item: f, index }) => (
            <View style={[styles.mgmtRow, { backgroundColor: theme.card }]}>
              <View style={styles.mgmtInfo}>
                <Text style={[styles.mgmtName, { color: theme.text }]} numberOfLines={1}>
                  {f.title}
                  {f.id === defaultIdRef.current ? <Text style={[styles.mgmtDefault, { color: theme.textSub }]}> · 默认</Text> : null}
                </Text>
                <Text style={[styles.mgmtCount, { color: theme.textSub }]}>{f.mediaCount} 个视频</Text>
              </View>
              <View style={styles.arrowCol}>
                <TouchableOpacity
                  style={[styles.arrowBtn, { backgroundColor: theme.inputBg }]}
                  disabled={index === 0}
                  onPress={() => moveFolder(f.id, -1)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="chevron-up" size={14} color={index === 0 ? theme.border : theme.iconDefault} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.arrowBtn, { backgroundColor: theme.inputBg }]}
                  disabled={index === orderedFolders.length - 1}
                  onPress={() => moveFolder(f.id, 1)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="chevron-down" size={14} color={index === orderedFolders.length - 1 ? theme.border : theme.iconDefault} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.dotsBtn} onPress={() => openFolderMenu(f)} activeOpacity={0.7}>
                <Ionicons name="ellipsis-vertical" size={18} color={theme.iconDefault} />
              </TouchableOpacity>
            </View>
          )}
        />
        <View style={[styles.doneBar, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          <TouchableOpacity style={styles.doneBtn} onPress={() => setManaging(false)} activeOpacity={0.85}>
            <Text style={styles.doneText}>完成</Text>
          </TouchableOpacity>
        </View>
        <Modal visible={renameTarget != null} transparent animationType="fade" onRequestClose={() => setRenameTarget(null)}>
          <TouchableOpacity
            style={styles.modalMask}
            activeOpacity={1}
            onPress={() => setRenameTarget(null)}
          >
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>
              <View style={[styles.dialog, { backgroundColor: theme.card }]}>
                <Text style={[styles.dlgTitle, { color: theme.text }]}>重命名收藏夹</Text>
                <TextInput
                  style={[styles.dlgInput, { color: theme.text, borderColor: '#00AEEC', backgroundColor: theme.inputBg }]}
                  value={renameText}
                  onChangeText={setRenameText}
                  maxLength={20}
                  autoFocus
                  selectTextOnFocus
                  onSubmitEditing={submitRename}
                />
                <View style={styles.dlgRow}>
                  <TouchableOpacity style={[styles.dlgBtn, { backgroundColor: theme.inputBg }]} onPress={() => setRenameTarget(null)} activeOpacity={0.8}>
                    <Text style={[styles.dlgBtnText, { color: theme.textSub }]}>取消</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.dlgBtn, styles.dlgOk]} onPress={submitRename} activeOpacity={0.8}>
                    <Text style={[styles.dlgBtnText, { color: '#fff' }]}>确定</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['left', 'right']}>
      <View style={[styles.topBar, { height: 44 + insets.top, paddingTop: insets.top, backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.topTitle, { color: theme.text }]}>我的收藏</Text>
        {orderedFolders.length > 0 ? (
          <TouchableOpacity style={styles.manageBtn} onPress={() => setManaging(true)} activeOpacity={0.7}>
            <Text style={styles.manageText}>管理</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipRow}
        contentContainerStyle={styles.chipContent}
      >
        {orderedFolders.map((f) => (
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
  // ---------- 收藏夹管理 ----------
  manageBtn: { width: 52, alignItems: 'center', justifyContent: 'center' },
  manageText: { fontSize: 14, color: '#00AEEC', fontWeight: '500' },
  mgmtList: { padding: 12, gap: 10 },
  mgmtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    padding: 12,
  },
  mgmtInfo: { flex: 1, gap: 2 },
  mgmtName: { fontSize: 14, fontWeight: '500' },
  mgmtDefault: { fontSize: 11, fontWeight: '400' },
  mgmtCount: { fontSize: 12 },
  arrowCol: { flexDirection: 'column', gap: 4, marginRight: 4 },
  arrowBtn: {
    width: 30,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotsBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  doneBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  doneBtn: {
    backgroundColor: '#00AEEC',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  doneText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  modalMask: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialog: { width: 280, borderRadius: 14, padding: 18 },
  dlgTitle: { fontSize: 16, fontWeight: '600', textAlign: 'center', marginBottom: 14 },
  dlgInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 14,
  },
  dlgRow: { flexDirection: 'row', gap: 10 },
  dlgBtn: { flex: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  dlgOk: { backgroundColor: '#00AEEC' },
  dlgBtnText: { fontSize: 14, fontWeight: '600' },
});
