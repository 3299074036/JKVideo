import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useTheme } from "../utils/theme";
import { useKeyboardHeight } from "../hooks/useKeyboardHeight";
import { toast } from "../utils/toast";

interface Props {
  placeholder?: string;
  /** 成功 resolve；失败 throw（NOT_LOGGED_IN / NO_CSRF 视为已提示，不再重复 toast） */
  onSend: (text: string) => Promise<void>;
  /** 深色模式：用于全屏播放器内的输入条 */
  dark?: boolean;
  maxLength?: number;
}

/**
 * 底部输入条：弹幕 / 评论共用。
 * 键盘弹起时用实测键盘高度把输入条顶到键盘上沿（translateY），
 * 不依赖 windowSoftInputMode 的压缩行为。
 */
export const BottomInputBar = React.memo(function BottomInputBar({
  placeholder,
  onSend,
  dark,
  maxLength = 200,
}: Props) {
  const theme = useTheme();
  const kb = useKeyboardHeight();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const canSend = text.trim().length > 0 && !sending;

  const doSend = async () => {
    const msg = text.trim();
    if (!msg || sending) return;
    setSending(true);
    try {
      await onSend(msg);
      setText("");
    } catch (e: any) {
      const m = e?.message;
      if (m && m !== "NOT_LOGGED_IN" && m !== "NO_CSRF") {
        toast(`发送失败：${m}`);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <View
      style={[
        styles.bar,
        dark ? styles.barDark : { backgroundColor: theme.sheetBg, borderTopColor: theme.modalBorder },
        { transform: [{ translateY: -kb }] },
      ]}
    >
      <TextInput
        style={[
          styles.input,
          dark ? styles.inputDark : { backgroundColor: theme.inputBg, color: theme.text },
        ]}
        placeholder={placeholder ?? "说点什么…"}
        placeholderTextColor={dark ? "#9aa0a8" : theme.textSub}
        value={text}
        onChangeText={setText}
        maxLength={maxLength}
        returnKeyType="send"
        onSubmitEditing={doSend}
        editable={!sending}
      />
      <TouchableOpacity
        style={[styles.send, !canSend && styles.sendDim]}
        onPress={doSend}
        disabled={!canSend}
        activeOpacity={0.8}
      >
        {sending ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.sendTxt}>发送</Text>
        )}
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  barDark: { backgroundColor: "rgba(20,22,26,.92)", borderTopColor: "rgba(255,255,255,.12)" },
  input: { flex: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, fontSize: 13 },
  inputDark: { backgroundColor: "#2b2e33", color: "#fff" },
  send: {
    backgroundColor: "#00AEEC",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 64,
    alignItems: "center",
  },
  sendDim: { backgroundColor: "#c9eafb" },
  sendTxt: { color: "#fff", fontSize: 13, fontWeight: "700" },
});
