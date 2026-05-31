import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../../../theme';

interface StoryProgressSectionProps {
  progress: string | null | undefined;
}

export function StoryProgressSection({ progress }: StoryProgressSectionProps) {
  const [expanded, setExpanded] = useState(false);

  if (!progress || progress.trim() === '') {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>
          📭 Chưa có tiến độ. Bắt đầu phiên chat để xây dựng cốt truyện.
        </Text>
      </View>
    );
  }

  // Chuẩn hóa line endings và split các đoạn dựa trên dấu phân tách '\n\n---\n+'
  const normalizedProgress = progress.replace(/\r\n/g, '\n');
  const paragraphs = normalizedProgress
    .split(/\n\n---\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>
          📭 Chưa có tiến độ. Bắt đầu phiên chat để xây dựng cốt truyện.
        </Text>
      </View>
    );
  }

  const isLongProgress = progress.length > 500;

  if (isLongProgress && !expanded) {
    // Chỉ lấy đoạn cuối cùng của câu chuyện (đoạn mới nhất) cắt ngắn 300 ký tự làm preview
    const latestParagraph = paragraphs[paragraphs.length - 1] || '';
    const previewText = latestParagraph.length > 300 
      ? latestParagraph.slice(0, 300) + '...'
      : latestParagraph;

    return (
      <View style={styles.container}>
        <View style={styles.paragraphContainer}>
          <Text style={styles.progressText}>{previewText}</Text>
        </View>
        <TouchableOpacity
          style={styles.toggleBtn}
          onPress={() => setExpanded(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.toggleBtnText}>
            Xem thêm ({paragraphs.length} đoạn) ▼
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {paragraphs.map((p, i) => (
        <View key={i}>
          <View style={styles.paragraphContainer}>
            <Text style={styles.progressText}>{p}</Text>
          </View>
          {i < paragraphs.length - 1 && <View style={styles.divider} />}
        </View>
      ))}

      {isLongProgress && expanded && (
        <TouchableOpacity
          style={styles.toggleBtn}
          onPress={() => setExpanded(false)}
          activeOpacity={0.7}
        >
          <Text style={styles.toggleBtnText}>Thu gọn ▲</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
  },
  paragraphContainer: {
    marginVertical: theme.spacing.xs,
  },
  progressText: {
    ...theme.typography.body,
    color: theme.colors.text,
    lineHeight: 24,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.md,
    borderStyle: 'dashed',
    borderWidth: 0.5,
    borderRadius: 1,
  },
  emptyContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    ...theme.typography.body,
    color: theme.colors.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  toggleBtn: {
    alignSelf: 'center',
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  toggleBtnText: {
    ...theme.typography.small,
    color: theme.colors.primary,
    fontWeight: '700',
  },
});
