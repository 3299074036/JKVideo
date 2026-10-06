import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  TextInput,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../utils/theme";
import { useSheetTransition } from "../utils/useSheetTransition";
import { toast } from "../utils/toast";
import { getFollowTags, createFollowTag } from "../services/bilibili";
import type { FollowTag } from "../services/types";

interface Props {
  visible: boolean;
  onClose: () => void;
  /** 确定：返回选中的分组 tagid 数组（空 = 默认分组） */
  onConfirm: (tagids: number[]) => void;
}

const SHEET_H = 430;

export function FollowTagSheet({ visible, onClose, onConfirm }: Props) {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const sheetH = Math.min(SHEET_H, height * 0.7);
  const { rendered, slideAnim } = useSheetTransition(visible, sheetH);

  const [tags, setTags] = useState<FollowTag[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSelected(null);
    setShowCreate(false);
    setNewName("");
    setLoading(true);
    getFollowTags()
      .then(setTags)
      .catch(() => toast("分组加载失败"))
      .finally(() => setLoading(false));
  }, [visible]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      toast("请输入分组名称");
      return;
    }
    setCreating(true);
    let tagid: number;
    try {
      tagid = await createFollowTag(name);
    } catch (e: any) {
      toast(`创建失败：${e?.message || "未知错误"}`);
      setCreating(false);
      return;
    }
    // 刷新列表失败不影响已拿到的 tagid：只提示，仍选中新分组
    let refreshFailed = false;
    try {
      const next = await getFollowTags();
      setTags(next);
    } catch {
      refreshFailed = true;
    }
    setSelected(tagid);
    setShowCreate(false);
    setNewName("");
    toast(refreshFailed ? "分组已创建，但列表刷新失败" : "分组已创建");
    setCreating(false);
  };

  if (!rendered) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.mask}
        activeOpacity={1}
        onPress={onClose}
      />
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
        <Text style={[styles.title, { color: theme.modalText }]}>选择分组</Text>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#00AEEC" />
          </View>
        ) : (
          <ScrollView style={styles.list}>
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => setSelected(null)}
            >
              <Text style={[styles.rowText, { color: theme.modalText }]}>默认分组</Text>
              {selected === null && (
                <Ionicons name="checkmark" size={20} color="#00AEEC" />
              )}
            </TouchableOpacity>
            {tags.map((t) => (
              <TouchableOpacity
                key={t.tagid}
                style={styles.row}
                activeOpacity={0.7}
                onPress={() => setSelected(t.tagid)}
              >
                <Text style={[styles.rowText, { color: theme.modalText }]}>
                  {t.name}
                  <Text style={{ color: theme.modalTextSub }}>（{t.count}）</Text>
                </Text>
                {selected === t.tagid && (
                  <Ionicons name="checkmark" size={20} color="#00AEEC" />
                )}
              </TouchableOpacity>
            ))}
            {showCreate ? (
              <View style={styles.createRow}>
                <TextInput
                  style={[
                    styles.input,
                    { color: theme.modalText, borderColor: theme.border },
                  ]}
                  placeholder="新分组名称"
                  placeholderTextColor={theme.modalTextSub}
                  value={newName}
                  onChangeText={setNewName}
                  maxLength={16}
                  autoFocus
                />
                <TouchableOpacity
                  style={styles.createBtn}
                  activeOpacity={0.7}
                  onPress={handleCreate}
                  disabled={creating}
                >
                  {creating ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.createBtnText}>创建</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.row}
                activeOpacity={0.7}
                onPress={() => setShowCreate(true)}
              >
                <Ionicons name="add-circle-outline" size={20} color="#00AEEC" />
                <Text style={[styles.rowText, styles.newText]}>新建分组</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        )}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: theme.inputBg }]}
            activeOpacity={0.7}
            onPress={onClose}
          >
            <Text style={[styles.btnText, { color: theme.modalText }]}>取消</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.confirmBtn]}
            activeOpacity={0.7}
            onPress={() => {
              onConfirm(selected !== null ? [selected] : []);
              onClose();
            }}
          >
            <Text style={[styles.btnText, { color: "#fff" }]}>确定</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mask: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 20,
  },
  title: { fontSize: 16, fontWeight: "600", textAlign: "center", marginBottom: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { flex: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(128,128,128,0.25)",
    gap: 8,
  },
  rowText: { fontSize: 15, flex: 1 },
  newText: { color: "#00AEEC", marginLeft: 4 },
  createRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 10 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
  },
  createBtn: {
    backgroundColor: "#00AEEC",
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    minWidth: 72,
    alignItems: "center",
  },
  createBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  footer: { flexDirection: "row", gap: 12, marginTop: 12 },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  confirmBtn: { backgroundColor: "#00AEEC" },
  btnText: { fontSize: 15, fontWeight: "600" },
});
