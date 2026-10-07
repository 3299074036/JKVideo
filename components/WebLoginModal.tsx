import React, { useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
} from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { getNativeLoginCookies } from "../services/bilibili";
import { useAuthStore } from "../store/authStore";
import { useTheme } from "../utils/theme";

const LOGIN_URL = "https://passport.bilibili.com/login";

/**
 * 注入官方登录页的 JS：
 * 1. 用 MutationObserver 藏掉「扫码登录」tab（原生入口已有扫码，不重复）；
 *    官方页是 SPA，首屏 HTML 几乎为空，只能等渲染后动态隐藏。
 * 2. 每 2s 轮询 /x/web-interface/nav，登录成功后 postMessage 通知 RN。
 */
const INJECTED_JS = `
(function() {
  function hideScanTab() {
    try {
      var nodes = document.querySelectorAll('div,span,li,a,button,p');
      for (var i = 0; i < nodes.length; i++) {
        var t = (nodes[i].textContent || '').trim();
        if (t === '扫码登录' || t === '扫码') {
          var el = nodes[i];
          for (var d = 0; d < 3 && el && el !== document.body; d++) {
            var txt = (el.textContent || '').trim();
            if (txt.length < 12) { el.style.display = 'none'; break; }
            el = el.parentElement;
          }
        }
      }
    } catch (e) {}
  }
  // 藏掉官方页自己的顶栏（标题 + 返回键），只留 App 原生顶栏，避免双顶栏叠加
  function hideOfficialHeader() {
    try {
      var titles = ['手机号登录/注册', '账号密码登录'];
      var nodes = document.querySelectorAll('div,span,p,h1,h2,header');
      for (var i = 0; i < nodes.length; i++) {
        var t = (nodes[i].textContent || '').trim();
        if (titles.indexOf(t) >= 0) {
          var el = nodes[i];
          for (var d = 0; d < 5 && el && el !== document.body; d++) {
            try {
              var r = el.getBoundingClientRect();
              if (r.height > 0 && r.height < 160 && r.top < 140) { el.style.display = 'none'; break; }
            } catch (e) {}
            el = el.parentElement;
          }
        }
      }
    } catch (e) {}
  }
  function sweep() { hideScanTab(); hideOfficialHeader(); }
  sweep();
  try {
    new MutationObserver(sweep).observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}
  function checkLogin() {
    try {
      fetch('https://api.bilibili.com/x/web-interface/nav', { credentials: 'include' })
        .then(function(r) { return r.json(); })
        .then(function(j) {
          if (j && j.data && j.data.isLogin) {
            window.ReactNativeWebView.postMessage('BILI_LOGIN_OK');
          }
        })
        .catch(function() {});
    } catch (e) {}
  }
  setInterval(checkLogin, 2000);
  checkLogin();
  true;
})();
`;

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Web 页登录成功、Cookie 已写入 authStore 后调用 */
  onLoggedIn: () => void;
}

export function WebLoginModal({ visible, onClose, onLoggedIn }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [webKey, setWebKey] = useState(0);
  const doneRef = useRef(false);
  const lastAttemptRef = useRef(0);
  const login = useAuthStore((s) => s.login);
  const theme = useTheme();

  function resetWebView() {
    doneRef.current = false;
    setLoading(true);
    setError(false);
    setWebKey((k) => k + 1);
  }

  /** 登录成功后：从原生 Cookie 存储读 SESSDATA / bili_jct，写入 authStore */
  async function tryFinishLogin() {
    if (doneRef.current) return;
    const now = Date.now();
    if (now - lastAttemptRef.current < 5000) return;
    lastAttemptRef.current = now;
    try {
      const { sessdata, biliJct } = await getNativeLoginCookies();
      if (sessdata) {
        doneRef.current = true;
        await login(sessdata, "", "", biliJct);
        onLoggedIn();
      }
    } catch {
      // 忽略，等下一次触发
    }
  }

  function handleMessage(e: any) {
    if (e?.nativeEvent?.data === "BILI_LOGIN_OK") {
      tryFinishLogin();
    }
  }

  function handleNavState(nav: any) {
    const url: string = nav?.url || "";
    // 登录成功后官方页会跳离登录页；此时尝试收尾（Cookie 可能已写入原生存储）
    if (url && url.includes("bilibili.com") && !url.includes("passport.bilibili.com/login")) {
      tryFinishLogin();
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
    >
      <SafeAreaView style={[styles.container, { backgroundColor: theme.sheetBg }]}>
        {/* 顶栏 */}
        <View style={[styles.nav, { borderBottomColor: theme.border || "#eef0f3" }]}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={24} color={theme.modalText} />
          </TouchableOpacity>
          <Text style={[styles.navTitle, { color: theme.modalText }]}>登录</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* WebView / 加载中 / 加载失败 */}
        <View style={styles.body}>
          {!error && (
            <WebView
              key={webKey}
              source={{ uri: LOGIN_URL }}
              javaScriptEnabled
              domStorageEnabled
              startInLoadingState={false}
              injectedJavaScript={INJECTED_JS}
              onMessage={handleMessage}
              onNavigationStateChange={handleNavState}
              onLoadEnd={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setError(true);
              }}
              style={styles.webview}
            />
          )}
          {loading && !error && (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#00AEEC" />
              <Text style={[styles.loadingText, { color: theme.modalTextSub }]}>
                正在加载官方登录页…
              </Text>
            </View>
          )}
          {error && (
            <View style={styles.center}>
              <Text style={styles.errIcon}>📡</Text>
              <Text style={[styles.errTitle, { color: theme.modalText }]}>官方登录页加载失败</Text>
              <Text style={[styles.errDesc, { color: theme.modalTextSub }]}>
                请检查网络连接，{"\n"}或返回使用扫码登录
              </Text>
              <TouchableOpacity style={styles.retryBtn} onPress={resetWebView}>
                <Text style={styles.retryTxt}>重新加载</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* 安全提示 */}
        <View style={styles.shield}>
          <Text style={[styles.shieldText, { color: theme.modalTextSub }]}>
            🔒 这是哔哩哔哩官方登录页面，账号信息由 B 站处理，
            <Text style={{ fontWeight: "700", color: theme.modalText }}>JKVideo 不会保存您的密码</Text>。
          </Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  nav: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", marginRight: 24 },
  body: { flex: 1, backgroundColor: "#fff" },
  webview: { flex: 1 },
  center: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "#fff", paddingHorizontal: 40 },
  loadingText: { marginTop: 12, fontSize: 13 },
  errIcon: { fontSize: 52, marginBottom: 16 },
  errTitle: { fontSize: 15, fontWeight: "700", marginBottom: 8 },
  errDesc: { fontSize: 12, textAlign: "center", lineHeight: 22, marginBottom: 20 },
  retryBtn: { backgroundColor: "#00AEEC", paddingHorizontal: 40, paddingVertical: 11, borderRadius: 22 },
  retryTxt: { color: "#fff", fontSize: 14, fontWeight: "700" },
  shield: { paddingVertical: 12, paddingHorizontal: 20, backgroundColor: "#f6f7f9" },
  shieldText: { fontSize: 11, textAlign: "center", lineHeight: 20 },
});
