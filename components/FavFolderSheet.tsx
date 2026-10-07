import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Animated,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import {
  getFavFoldersWithState,
  createFavFolder,
  setVideoFavBatch,
} from "../services/bilibili";
import { proxyImageUrl } from "../utils/imageUrl";
import { useTheme } from "../utils/theme";
import { useSheetTransition } from "../utils/useSheetTransition";
import { toast } from "../utils/toast";

interface Folder {
  id: number;
  title: string;
  mediaCount: number;
  cover: string;
  favState: boolean;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  aid: number;
  /** 批量生效后回调：faved=是否仍被至少一个夹收录 */
  onChanged: (faved: boolean) => void;
}

/**
 * 收藏夹选择：多选已有收藏夹 / 新建 / 确定后批量增删。
 */
export function FavFolderSheet({ visible, onClose, aid, onChanged }: Props) {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const sheetH = Math.min(480, height * 0.7);
  const { rendered, slideAnim } = useSheetTransition(visible, sheetH);

  const [folders, setFolders] = useState<Folder[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const initialRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!visible || !aid) return;
    let cancelled = false;
    setLoading(true);
    setShowCreate(false);
    setNewName("");
    getFavFoldersWithState(aid)
      .then((list) => {
        if (cancelled) return;
        setFolders(list);
        const sel = new Set(list.filter((f) => f.favState).map((f) => f.id));
        setSelected(sel);
        initialRef.current = sel;
      })
      .catch((e: any) => {
        if (!cancelled) toast(`加载失败：${e?.message || "未知错误"}`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, aid]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const id = await createFavFolder(name);
      const folder: Folder = { id, title: name, mediaCount: 0, cover: "", favState: false };
      setFolders((prev) => [folder, ...prev]);
      setSelected((prev) => new Set(prev).add(id));
      setShowCreate(false);
      setNewName("");
      toast("创建成功");
    } catch (e: any) {
      const m = e?.message;
      if (m === "NO_CSRF") toast("请重新登录后再操作");
      else toast(`创建失败：${m || "未知错误"}`);
    } finally {
      setCreating(false);
    }
  };

  const handleConfirm = async () => {
    if (saving) return;
    const initial = initialRef.current;
    const add = [...selected].filter((id) => !initial.has(id));
    const del = [...initial].filter((id) => !selected.has(id));
    if (add.length === 0 && del.length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await setVideoFavBatch(aid, add, del);
      toast("已保存");
      onChanged(selected.size > 0);
      onClose();
    } catch (e: any) {
      const m = e?.message;
      if (m === "NO_CSRF") toast("请重新登录后再操作");
      else toast(`保存失败：${m || "未知错误"}`);
    } finally {
      setSaving(false);
    }
  };

  if (!rendered) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      {/* 点击遮罩关闭 */}
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <Animated.View
        style={[
          styles.sheet,
          {
            height: sheetH,
            backgroundColor: theme.sheetBg,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <View style={styles.handle} />
        <Text style={[styles.title, { color: theme.modalText }]}>添加到收藏夹</Text>
        {loading ? (
          <ActivityIndicator style={styles.loader} color="#00AEEC" />
        ) : (
          <FlatList
            data={folders}
            keyExtractor={(f) => String(f.id)}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <Text style={[styles.emptyTxt, { color: theme.modalTextSub }]}>
                还没有收藏夹，先新建一个吧
              </Text>
            }
            renderItem={({ item: f }) => {
              const on = selected.has(f.id);
              return (
                <TouchableOpacity style={styles.row} onPress={() => toggle(f.id)} activeOpacity={0.7}>
                  {f.cover ? (
                    <Image source={{ uri: proxyImageUrl(f.cover) }} style={styles.cover} />
                  ) : (
                    <View style={[styles.cover, { backgroundColor: theme.inputBg }]} />
                  )}
                  <View style={styles.info}>
                    <Text style={[styles.name, { color: theme.modalText }]} numberOfLines={1}>
                      {f.title}
                    </Text>
                    <Text style={[styles.count, { color: theme.modalTextSub }]}>
                      {f.mediaCount} 个视频{f.favState ? " · 已收录" : ""}
                    </Text>
                  </View>
                  <View style={[styles.check, on && styles.checkOn]}>
                    {on && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
        {showCreate ? (
          <View style={[styles.createRow, { borderTopColor: theme.modalBorder }]}>
            <TextInput
              style={[styles.input, { color: theme.modalText, borderColor: theme.border }]}
              placeholder="新收藏夹名称"
              placeholderTextColor={theme.modalTextSub}
              value={newName}
              onChangeText={setNewName}
              maxLength={20}
              autoFocus
            />
            <TouchableOpacity
              style={[styles.createBtn, (!newName.trim() || creating) && styles.createBtnDim]}
              onPress={handleCreate}
              disabled={!newName.trim() || creating}
              activeOpacity={0.8}
            >
              {creating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.createBtnTxt}>创建</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.newRow, { borderTopColor: theme.modalBorder }]}
            onPress={() => setShowCreate(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={18} color="#00AEEC" />
            <Text style={styles.newTxt}>新建收藏夹</Text>
          </TouchableOpacity>
        )}
        <View style={[styles.foot, { borderTopColor: theme.modalBorder }]}>
          <TouchableOpacity
            style={[styles.ok, saving && styles.okDim]}
            onPress={handleConfirm}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.okTxt}>确定</Text>
            )}
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: "hidden",
    zIndex: 10,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#e2e6ea",
    marginTop: 10,
    marginBottom: 4,
    alignSelf: "center",
  },
  title: { textAlign: "center", fontSize: 15, fontWeight: "700", paddingVertical: 10 },
  loader: { marginVertical: 40 },
  emptyTxt: { textAlign: "center", padding: 30, fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
  cover: { width: 52, height: 36, borderRadius: 6 },
  info: { flex: 1, gap: 3 },
  name: { fontSize: 14, fontWeight: "600" },
  count: { fontSize: 11 },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "#d5dbe2",
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { backgroundColor: "#00AEEC", borderColor: "#00AEEC" },
  newRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  newTxt: { fontSize: 14, color: "#00AEEC", fontWeight: "600" },
  createRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
  },
  createBtn: {
    backgroundColor: "#00AEEC",
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
    alignItems: "center",
  },
  createBtnDim: { backgroundColor: "#c9eafb" },
  createBtnTxt: { color: "#fff", fontSize: 14, fontWeight: "700" },
  foot: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 22, borderTopWidth: StyleSheet.hairlineWidth },
  ok: { backgroundColor: "#00AEEC", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  okDim: { backgroundColor: "#c9eafb" },
  okTxt: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
