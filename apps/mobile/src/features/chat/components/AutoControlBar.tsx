import React from 'react';
import { View, Text, ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { theme } from '../../../theme';

interface AutoControlBarProps {
  onStop: () => void;
}

export function AutoControlBar({ onStop }: AutoControlBarProps) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="small" color={theme.colors.primary} />
      <Text style={styles.label}>Đang tự động...</Text>
      <Pressable onPress={onStop} style={styles.stopBtn} android_ripple={{ color: '#FCA5A5' }}>
        <Text style={styles.stopText}>⏹ Dừng</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  label: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.textMuted,
    fontStyle: 'italic',
  },
  stopBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  stopText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.error,
  },
});
