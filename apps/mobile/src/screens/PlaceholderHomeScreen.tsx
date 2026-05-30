import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { apiClient } from '../api/client';
import { theme } from '../theme';

export function PlaceholderHomeScreen() {
  const [serverStatus, setServerStatus] = useState<string>('checking...');
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  useEffect(() => {
    apiClient
      .get<{ status: string }>('/healthz')
      .then((data) => setServerStatus(data.status))
      .catch(() => setServerStatus('offline'));
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ChatAI</Text>
      <Text style={styles.subtitle}>Learn Chinese through AI conversations</Text>
      <Text style={styles.status}>Server: {serverStatus}</Text>

      <Pressable
        style={({ pressed }) => [
          styles.profileButton,
          pressed && styles.profileButtonPressed,
        ]}
        onPress={() => navigation.navigate('Profile')}
      >
        <Text style={styles.profileButtonText}>Hồ sơ cá nhân</Text>
      </Pressable>
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
    marginBottom: theme.spacing.xl,
  },
  profileButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.radius.md,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  profileButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  profileButtonText: {
    ...theme.typography.body,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
