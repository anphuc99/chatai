import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { apiClient } from '../api/client';
import { theme } from '../theme';

export function PlaceholderHomeScreen() {
  const [serverStatus, setServerStatus] = useState<string>('checking...');

  useEffect(() => {
    apiClient
      .get<{ status: string }>('/healthz')
      .then((data) => setServerStatus(data.status))
      .catch(() => setServerStatus('offline'));
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ChatAI</Text>
      <Text style={styles.subtitle}>Learn English through AI conversations</Text>
      <Text style={styles.status}>Server: {serverStatus}</Text>
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
  title: {
    ...theme.typography.h1,
    color: theme.colors.primary,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    ...theme.typography.body,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.xl,
  },
  status: {
    ...theme.typography.caption,
    color: theme.colors.text,
  },
});
