import React, { useEffect, useState, useRef } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Alert,
  Linking,
} from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import QRCode from "react-native-qrcode-svg";
import { Ionicons } from "@expo/vector-icons";
import { generateQRCode, pollQRCode } from "../services/bilibili";
import { useAuthStore } from "../store/authStore";
import { useTheme } from "../utils/theme";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function LoginModal({ visible, onClose }: Props) {
  const [qrData, setQrData] = useState<string | null>(null);
  const [qrKey, setQrKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const qrRef = useRef<any>(null);
  const [status, setStatus] = useState<
    "loading" | "waiting" | "scanned" | "done" | "error"
  >("loading");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const login = useAuthStore((s) => s.login);
  const theme = useTheme();

  // sheet 滑入动画
  const slideY = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideY, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 4,
      }).start();
    } else {
      slideY.setValue(300);
    }
  }, [visible]);

  function initQRCode() {
    setStatus("loading");
    setQrData(null);
    setQrKey(null);
    generateQRCode()
      .then((data) => {
        setQrData(data.url);
        setQrKey(data.qrcode_key);
        setStatus("waiting");
      })
      .catch(() => setStatus("error"));
  }

  useEffect(() => {
    if (!visible) return;
    initQRCode();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [visible]);

  useEffect(() => {
    if (!qrKey || status !== "waiting") return;
    let cancelled = false;
    pollRef.current = setInterval(async () => {
      if (cancelled) return;
      try {
        const result = await pollQRCode(qrKey);
        if (cancelled) return;
        if (result.code === 86038) {
          setStatus("error");
          clearInterval(pollRef.current!);
        }
        if (result.code === 86090) setStatus("scanned");
        if (result.code === 0 && result.cookie) {
          clearInterval(pollRef.current!);
          try {
            await login(result.cookie, "", "", result.csrf);
          } catch {
            if (!cancelled) setStatus("error");
            return;
          }
          if (!cancelled) onClose();
        }
      } catch {
        // Network error during poll — ignore, will retry next interval
      }
    }, 2000);
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [qrKey, status]);

  async function handleSaveQR() {
    if (!qrRef.current) return;
    setSaving(true);
    try {
      const { status: perm } = await MediaLibrary.requestPermissionsAsync();
      if (perm !== "granted") {
        Alert.alert("提示", "需要相册权限才能保存图片");
        return;
      }
      qrRef.current.toDataURL(async (base64: string) => {
        try {
          const dest = `${FileSystem.cacheDirectory}bilibili_qr.png`;
          await FileSystem.writeAsStringAsync(dest, base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          await MediaLibrary.saveToLibraryAsync(dest);
          Alert.alert("已保存", "二维码已存入相册，请用哔哩哔哩扫码登录", [
            { text: "关闭", style: "cancel" },
            {
              text: "打开哔哩哔哩",
              onPress: () => Linking.openURL("bilibili://"),
            },
          ]);
        } catch {
          Alert.alert("失败", "保存失败，请重试");
        } finally {
          setSaving(false);
        }
      });
    } catch {
      Alert.alert("失败", "保存失败，请重试");
      setSaving(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      {/* 遮罩固定不动 */}
      <View style={styles.overlay} pointerEvents="box-none" />

      {/* sheet 独立滑入 */}
      <Animated.View
        style={[styles.sheetWrapper, { transform: [{ translateY: slideY }] }]}
      >
        <View style={[styles.sheet, { backgroundColor: theme.sheetBg }]}>
          <Text style={[styles.title, { color: theme.modalText }]}>扫码登录</Text>
          {status === "loading" && (
            <ActivityIndicator
              size="large"
              color="#00AEEC"
              style={styles.loader}
            />
          )}
          {(status === "waiting" || status === "scanned") && qrData && (
            <>
              <View style={styles.qrWrapper}>
                <QRCode
                  value={qrData}
                  size={200}
                  getRef={(ref) => { qrRef.current = ref; }}
                />
                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={handleSaveQR}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="download-outline" size={16} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
              <Text style={[styles.hint, { color: theme.modalTextSub }]}>
                {status === "scanned"
                  ? "扫描成功，请在手机确认"
                  : "使用 B站 APP 扫一扫"}
              </Text>
            </>
          )}
          {status === "error" && (
            <View style={styles.errorBox}>
              <Text style={[styles.hint, { color: theme.modalTextSub }]}>二维码已过期</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={initQRCode}>
                <Ionicons name="refresh" size={14} color="#fff" />
                <Text style={styles.retryTxt}>重新获取</Text>
              </TouchableOpacity>
            </View>
          )}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeTxt}>关闭</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheetWrapper: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
    alignItems: "center",
  },
  title: { fontSize: 18, fontWeight: "600", marginBottom: 20 },
  loader: { marginVertical: 40 },
  qrWrapper: { width: 200, height: 200, marginBottom: 12 },
  saveBtn: {
    position: "absolute",
    bottom: 6,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 14,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: { fontSize: 13, color: "#666", marginBottom: 12 },
  errorBox: { alignItems: "center", marginBottom: 8 },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#00AEEC",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 12,
  },
  retryTxt: { fontSize: 13, color: "#fff", fontWeight: "600" },
  closeBtn: { padding: 12 },
  closeTxt: { fontSize: 14, color: "#00AEEC" },
});
