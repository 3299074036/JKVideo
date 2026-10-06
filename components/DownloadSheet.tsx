import React from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Animated,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useDownload } from "../hooks/useDownload";
import { useTheme } from "../utils/theme";
import { useSheetTransition } from "../utils/useSheetTransition";

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Sheet 顶部对齐到屏幕的绝对 Y（一般是播放器底部） */
  topOffset: number;
  bvid: string;
  cid: number;
  title: string;
  cover: string;
  qualities: { qn: number; desc: string }[];
}

export function DownloadSheet({
  visible,
  onClose,
  topOffset,
  bvid,
  cid,
  title,
  cover,
  qualities,
}: Props) {
  const { tasks, startDownload, taskKey } = useDownload();
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const sheetH = Math.max(120, height - topOffset);
  const { rendered, slideAnim } = useSheetTransition(visible, sheetH);

  if (!rendered || qualities.length === 0) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Animated.View
        style={[
          styles.sheet,
          {
            top: topOffset,
            backgroundColor: theme.sheetBg,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <View style={[styles.header, { borderBottomColor: theme.modalBorder }]}>
          <Text style={[styles.headerTitle, { color: theme.modalText }]}>下载视频</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={8}>
            <Ionicons name="close" size={22} color={theme.modalTextSub} />
          </TouchableOpacity>
        </View>
        <ScrollView
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
        >
          {qualities.map((q) => {
            const key = taskKey(bvid, q.qn);
            const task = tasks[key];
            return (
              <View
                key={q.qn}
                style={[styles.row, { borderBottomColor: theme.modalBorder }]}
              >
                <Text style={[styles.qualityLabel, { color: theme.modalText }]}>
                  {q.desc}
                </Text>
                <View style={styles.right}>
                  {!task && (
                    <TouchableOpacity
                      style={styles.downloadBtn}
                      onPress={() =>
                        startDownload(bvid, cid, q.qn, q.desc, title, cover)
                      }
                    >
                      <Text style={styles.downloadBtnTxt}>下载</Text>
                    </TouchableOpacity>
                  )}
                  {task?.status === "downloading" && (
                    <View style={styles.progressWrap}>
                      <View style={styles.progressTrack}>
                        <View
                          style={[
                            styles.progressFill,
                            {
                              width: `${Math.round(task.progress * 100)}%` as any,
                            },
                          ]}
                        />
                      </View>
                      <Text style={[styles.progressTxt, { color: theme.modalTextSub }]}>
                        {Math.round(task.progress * 100)}%
                      </Text>
                    </View>
                  )}
                  {task?.status === "done" && (
                    <View style={styles.doneRow}>
                      <Ionicons name="checkmark-circle" size={16} color="#00AEEC" />
                      <Text style={styles.doneTxt}>已下载</Text>
                    </View>
                  )}
                  {task?.status === "error" && (
                    <View style={styles.errorWrap}>
                      {!!task.error && (
                        <Text style={styles.errorMsg} numberOfLines={2}>
                          {task.error}
                        </Text>
                      )}
                      <TouchableOpacity
                        style={styles.retryBtn}
                        onPress={() =>
                          startDownload(bvid, cid, q.qn, q.desc, title, cover)
                        }
                      >
                        <Ionicons name="refresh" size={14} color="#f44" />
                        <Text style={styles.retryTxt}>重试</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 16, fontWeight: "700" },
  closeBtn: { padding: 4 },
  body: { paddingHorizontal: 20, paddingBottom: 40 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  qualityLabel: { fontSize: 15 },
  right: { flexDirection: "row", alignItems: "center" },
  downloadBtn: {
    backgroundColor: "#00AEEC",
    paddingHorizontal: 16,
    paddingVertical: 5,
    borderRadius: 14,
  },
  downloadBtnTxt: { color: "#fff", fontSize: 13, fontWeight: "600" },
  progressWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  progressTrack: {
    width: 80,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#e0e0e0",
    overflow: "hidden",
  },
  progressFill: { height: 4, backgroundColor: "#00AEEC", borderRadius: 2 },
  progressTxt: { fontSize: 12, minWidth: 32 },
  doneRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  doneTxt: { fontSize: 13, color: "#00AEEC" },
  errorWrap: { alignItems: "flex-end", gap: 2 },
  errorMsg: { fontSize: 11, color: "#f44", maxWidth: 160, textAlign: "right" },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  retryTxt: { fontSize: 13, color: "#f44" },
});
