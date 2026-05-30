import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../../theme';

export function StoryListScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>📚</Text>
      <Text style={styles.title}>Truyện AI (Stories)</Text>
      <Text style={styles.subtitle}>Tính năng học qua câu chuyện AI đang được xây dựng. Coming soon!</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
    padding: theme.spacing.lg,
  },
  emoji: {
    fontSize: 48,
    marginBottom: theme.spacing.md,
  },
  title: {
    ...theme.typography.h2,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    ...theme.typography.body,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
});
