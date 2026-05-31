import React from 'react';
import { View, Text, StyleSheet, Switch, ActivityIndicator, Image } from 'react-native';
import { theme } from '../../../theme';

interface CharacterRowProps {
  name: string;
  avatarUrl: string | null;
  checked: boolean;
  isToggling?: boolean;
  onChange: (on: boolean) => void;
}

export function CharacterRow({ name, avatarUrl, checked, isToggling = false, onChange }: CharacterRowProps) {
  return (
    <View style={styles.container}>
      <View style={styles.info}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>{name ? name.charAt(0) : '👤'}</Text>
          </View>
        )}
        <Text style={styles.name}>{name}</Text>
      </View>
      {isToggling ? (
        <ActivityIndicator size="small" color={theme.colors.primary} style={styles.loader} />
      ) : (
        <Switch
          value={checked}
          onValueChange={onChange}
          trackColor={{ false: '#CBD5E1', true: '#C7D2FE' }}
          thumbColor={checked ? theme.colors.primary : '#94A3B8'}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  info: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: theme.spacing.md,
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  name: {
    ...theme.typography.body,
    fontWeight: '600',
    color: theme.colors.text,
  },
  loader: {
    marginRight: 10,
  },
});
