import React, { useRef, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { DynamicList, type DynamicListHandle } from "../../components/DynamicList";
import { LoginModal } from "../../components/LoginModal";
import { useTheme } from "../../utils/theme";

export default function DynamicScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const listRef = useRef<DynamicListHandle>(null);
  const [showLogin, setShowLogin] = useState(false);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={["left", "right"]}>
      <View
        style={[
          styles.topBar,
          {
            height: 44 + insets.top,
            paddingTop: insets.top,
            backgroundColor: theme.card,
            borderBottomColor: theme.border,
          },
        ]}
      >
        <Text style={[styles.topTitle, { color: theme.text }]}>动态</Text>
      </View>
      <View style={styles.listWrap}>
        <DynamicList
          ref={listRef}
          topPadding={0}
          onScroll={() => {}}
          onLoginPress={() => setShowLogin(true)}
          showFilter
        />
      </View>
      <LoginModal visible={showLogin} onClose={() => setShowLogin(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topTitle: { fontSize: 17, fontWeight: "600" },
  listWrap: { flex: 1 },
});
