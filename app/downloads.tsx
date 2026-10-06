import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  TouchableOpacity,
  Modal,
  StatusBar,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Video from 'react-native-video';
let ScreenOrientation: typeof import('expo-screen-orientation') | null = null;
try { ScreenOrientation = require('expo-screen-orientation'); } catch {}
import { useDownloadStore, DownloadTask } from '../store/downloadStore';
import { LanShareModal } from '../components/LanShareModal';
import { proxyImageUrl } from '../utils/imageUrl';
import { useTheme } from '../utils/theme';

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function DownloadsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { tasks, loadFromStorage, removeTask } = useDownloadStore();
  const [playingUri, setPlayingUri] = useState<string | null>(null);
  const [playingTitle, setPlayingTitle] = useState('');
  const [shareTask, setShareTask] = useState<(DownloadTask & { key: string }) | null>(null);

  async function openPlayer(uri: string, title: string) {
    setPlayingTitle(title);
    setPlayingUri(uri);
    await ScreenOrientation?.unlockAsync();
  }

  async function closePlayer() {
    setPlayingUri(null);
    await ScreenOrientation?.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  }

  function confirmDelete(key: string, status: DownloadTask['status']) {
    const isDownloading = status === 'downloading';
    Alert.alert(
      isDownloading ? '取消下载' : '删除下载',
      isDownloading ? '确定取消该下载任务？' : '确定删除该文件？删除后不可恢复。',
      [
        { text: '取消', style: 'cancel' },
        { text: isDownloading ? '取消下载' : '删除', style: 'destructive', onPress: () => removeTask(key) },
      ],
    );
  }

  useEffect(() => {
    loadFromStorage();
  }, []);

  const all = Object.entries(tasks).map(([key, task]) => ({ key, ...task }));
  const downloading = all.filter((t) => t.status === 'downloading' || t.status === 'error');
  const done = all.filter((t) => t.status === 'done');

  const sections = [];
  if (downloading.length > 0) sections.push({ title: '下载中', data: downloading });
  if (done.length > 0) sections.push({ title: '已下载', data: done });

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
      <View style={[styles.topBar, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.topTitle, { color: theme.text }]}>我的下载</Text>
        <View style={{ width: 32 }} />
      </View>

      {sections.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="cloud-download-outline" size={56} color={theme.textSub} />
          <Text style={[styles.emptyTxt, { color: theme.textSub }]}>暂无下载记录</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.key}
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHeader, { backgroundColor: theme.bg }]}>
              <Text style={[styles.sectionTitle, { color: theme.textSub }]}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <DownloadRow
              task={item}
              theme={theme}
              onPlay={() => {
                if (item.localUri) openPlayer(item.localUri, item.title);
              }}
              onDelete={() => confirmDelete(item.key, item.status)}
              onShare={() => setShareTask(item)}
              onRetry={() => router.push(`/video/${item.bvid}` as any)}
            />
          )}
          ItemSeparatorComponent={() => (
            <View style={[styles.separator, { backgroundColor: theme.border, marginLeft: 108 }]} />
          )}
          contentContainerStyle={{ paddingBottom: 32 }}
        />
      )}

      <LanShareModal
        visible={!!shareTask}
        task={shareTask}
        onClose={() => setShareTask(null)}
      />

      {/* Local file player modal */}
      <Modal
        visible={!!playingUri}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closePlayer}
      >
        <StatusBar hidden />
        <View style={styles.playerBg}>
          {playingUri && (
            <Video
              source={{ uri: playingUri }}
              style={StyleSheet.absoluteFillObject}
              resizeMode="contain"
              controls
              paused={false}
            />
          )}
          <View style={styles.playerBar}>
            <TouchableOpacity onPress={closePlayer} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.playerTitle} numberOfLines={1}>{playingTitle}</Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function DownloadRow({
  task,
  theme,
  onPlay,
  onDelete,
  onShare,
  onRetry,
}: {
  task: DownloadTask & { key: string };
  theme: ReturnType<typeof useTheme>;
  onPlay: () => void;
  onDelete: () => void;
  onShare: () => void;
  onRetry: () => void;
}) {
  const isDone = task.status === 'done';
  const isError = task.status === 'error';
  const isDownloading = task.status === 'downloading';

  const rowContent = (
    <View style={[styles.row, { backgroundColor: theme.card }]}>
      <Image source={{ uri: proxyImageUrl(task.cover) }} style={styles.cover} contentFit="cover" recyclingKey={task.bvid} />
      <View style={styles.info}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>{task.title}</Text>
        <Text style={[styles.qdesc, { color: theme.textSub }]}>
          {task.qdesc}{task.fileSize ? `  ·  ${formatFileSize(task.fileSize)}` : ''}
        </Text>
        {isDownloading && (
          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(task.progress * 100)}%` as any }]} />
            </View>
            <Text style={styles.progressTxt}>{Math.round(task.progress * 100)}%</Text>
          </View>
        )}
        {isError && (
          <View style={styles.errorRow}>
            <Text style={styles.errorTxt} numberOfLines={1}>{task.error ?? '下载失败'}</Text>
            <TouchableOpacity onPress={onRetry} style={styles.retryBtn}>
              <Text style={styles.retryTxt}>重新下载</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      <View style={styles.actions}>
        {isDone && (
          <TouchableOpacity style={styles.actionBtn} onPress={onShare}>
            <Ionicons name="share-social-outline" size={20} color="#00AEEC" />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={onDelete}
        >
          <Ionicons
            name={isDownloading ? 'close-circle-outline' : 'trash-outline'}
            size={20}
            color="#bbb"
          />
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isDone) {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={onPlay}>
        {rowContent}
      </TouchableOpacity>
    );
  }

  return rowContent;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 4 },
  topTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 4,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyTxt: { fontSize: 14 },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sectionTitle: { fontSize: 13, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  cover: { width: 80, height: 54, borderRadius: 6, backgroundColor: '#eee', flexShrink: 0 },
  info: { flex: 1 },
  title: { fontSize: 13, lineHeight: 18, marginBottom: 4 },
  qdesc: { fontSize: 12, marginBottom: 4 },
  progressWrap: { flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 6 },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#e0e0e0',
    overflow: 'hidden',
  },
  progressFill: { height: 3, backgroundColor: '#00AEEC', borderRadius: 2 },
  progressTxt: { fontSize: 11, color: '#999', minWidth: 30 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  errorTxt: { fontSize: 12, color: '#f44', flex: 1 },
  retryBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: '#e8f7fd',
  },
  retryTxt: { fontSize: 12, color: '#00AEEC', fontWeight: '600' },
  actions: { alignItems: 'center', gap: 12 },
  actionBtn: { padding: 4 },
  separator: { height: StyleSheet.hairlineWidth },
  // player modal
  playerBg: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  playerBar: {
    position: 'absolute',
    top: 44,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingVertical: 8,
  },
  closeBtn: { padding: 6 },
  playerTitle: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600', marginLeft: 4 },
});
