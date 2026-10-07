import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import type { Comment } from '../services/types';
import { formatTime } from '../utils/format';
import { proxyImageUrl } from '../utils/imageUrl';
import { useTheme } from '../utils/theme';

interface Props {
  item: Comment;
  onToggleLike: (item: Comment) => void;
}

export const CommentItem = React.memo(function CommentItem({ item, onToggleLike }: Props) {
  const theme = useTheme();
  const liked = (item.action ?? 0) === 1;
  return (
    <View style={[styles.row, { borderBottomColor: theme.border }]}>
      <Image source={{ uri: proxyImageUrl(item.member.avatar) }} style={styles.avatar} />
      <View style={styles.content}>
        <Text style={styles.username}>{item.member.uname}</Text>
        <Text style={[styles.message, { color: theme.text }]}>{item.content.message}</Text>
        <View style={styles.footer}>
          <Text style={[styles.time, { color: theme.textSub }]}>{formatTime(item.ctime)}</Text>
          <TouchableOpacity
            style={styles.likeRow}
            onPress={() => onToggleLike(item)}
            hitSlop={8}
            activeOpacity={0.7}
          >
            <Ionicons
              name={liked ? "thumbs-up" : "thumbs-up-outline"}
              size={12}
              color={liked ? "#00AEEC" : theme.textSub}
            />
            <Text style={[styles.likeCount, { color: liked ? "#00AEEC" : theme.textSub }]}>
              {item.like > 0 ? item.like : ''}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee' },
  avatar: { width: 34, height: 34, borderRadius: 17, marginRight: 10 },
  content: { flex: 1 },
  username: { fontSize: 12, color: '#00AEEC', marginBottom: 3 },
  message: { fontSize: 14, color: '#212121', lineHeight: 20 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  time: { fontSize: 11, color: '#bbb' },
  likeRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  likeCount: { fontSize: 11, color: '#999' },
});
