import React, { useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Alert,
} from 'react-native';
import { StoryDto } from '@chatai/shared-types';
import { theme } from '../../../theme';

interface StoryCardProps {
  story: StoryDto;
  onPress: () => void;
  onDelete: () => void;
}

function formatRelativeTime(isoString: string): string {
  const now = new Date();
  const date = new Date(isoString);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return 'Vừa xong';
  if (diffMin < 60) return `${diffMin} phút trước`;
  if (diffHour < 24) return `${diffHour} giờ trước`;
  if (diffDay < 30) return `${diffDay} ngày trước`;
  return date.toLocaleDateString('vi-VN');
}

export function StoryCard({ story, onPress, onDelete }: StoryCardProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const [showDelete, setShowDelete] = React.useState(false);

  const handleLongPress = () => {
    if (showDelete) {
      Animated.timing(translateX, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => setShowDelete(false));
    } else {
      setShowDelete(true);
      Animated.timing(translateX, {
        toValue: -80,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  };

  const handleDeletePress = () => {
    Alert.alert(
      'Xóa Story',
      `Bạn có chắc muốn xóa "${story.title}"?`,
      [
        { text: 'Hủy', style: 'cancel', onPress: () => {
          Animated.timing(translateX, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }).start(() => setShowDelete(false));
        }},
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: () => {
            Animated.timing(translateX, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }).start(() => {
              setShowDelete(false);
              onDelete();
            });
          },
        },
      ],
    );
  };

  return (
    <View style={styles.wrapper}>
      <Animated.View style={[styles.card, { transform: [{ translateX }] }]}>
        <TouchableOpacity
          style={styles.content}
          onPress={onPress}
          onLongPress={handleLongPress}
          activeOpacity={0.75}
        >
          <Text style={styles.title} numberOfLines={1}>
            {story.title}
          </Text>
          <Text style={styles.preview} numberOfLines={2}>
            {story.initialSetting}
          </Text>
          <View style={styles.footer}>
            <View style={styles.counts}>
              <Text style={styles.countText}>👥 {story.characterCount}</Text>
              <Text style={[styles.countText, styles.countSep]}>💬 {story.sessionCount}</Text>
            </View>
            <Text style={styles.time}>{formatRelativeTime(story.updatedAt)}</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>

      {showDelete && (
        <TouchableOpacity style={styles.deleteBtn} onPress={handleDeletePress}>
          <Text style={styles.deleteText}>🗑️</Text>
          <Text style={styles.deleteLbl}>Xóa</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: theme.spacing.lg,
    marginVertical: theme.spacing.xs,
    overflow: 'hidden',
    borderRadius: theme.radius.lg,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  content: {
    padding: theme.spacing.lg,
  },
  title: {
    ...theme.typography.h3,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  preview: {
    ...theme.typography.body,
    color: theme.colors.textMuted,
    lineHeight: 22,
    marginBottom: theme.spacing.md,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  counts: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  countText: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },
  countSep: {
    marginLeft: theme.spacing.sm,
  },
  time: {
    ...theme.typography.small,
    color: theme.colors.textMuted,
  },
  deleteBtn: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 80,
    backgroundColor: theme.colors.error,
    borderRadius: theme.radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteText: {
    fontSize: 20,
  },
  deleteLbl: {
    ...theme.typography.small,
    color: '#fff',
    fontWeight: '600',
  },
});
