import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SessionSummaryDto } from '@chatai/shared-types';
import { theme } from '../../../theme';

interface SessionCardProps {
  item: SessionSummaryDto;
  onPress: () => void;
}

export function SessionCard({ item, onPress }: SessionCardProps) {
  // Định dạng ngày: từ timestamp -> ngày tháng năm
  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.header}>
        <Text style={styles.storyTitle} numberOfLines={1}>
          📚 {item.storyTitle}
        </Text>
        <Text style={styles.date}>{formatDate(item.endedAt)}</Text>
      </View>

      <Text style={styles.summary} numberOfLines={2}>
        {item.summary || 'Không có tóm tắt cho phiên này.'}
      </Text>

      <View style={styles.footer}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>📝 {item.messageCount} tin</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>📚 {item.wordCount} từ</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginVertical: theme.spacing.xs,
    marginHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardPressed: {
    opacity: 0.7,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  storyTitle: {
    ...theme.typography.body,
    fontWeight: '700',
    color: theme.colors.text,
    flex: 1,
    marginRight: theme.spacing.md,
  },
  date: {
    ...theme.typography.small,
    color: theme.colors.textMuted,
  },
  summary: {
    ...theme.typography.body,
    fontSize: 13,
    color: theme.colors.text,
    lineHeight: 18,
    marginBottom: theme.spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.sm,
  },
  badgeText: {
    fontSize: 11,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
});
