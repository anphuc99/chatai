import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { CharacterDto } from '@chatai/shared-types';
import { theme } from '../../../theme';

interface CharacterCardProps {
  character: CharacterDto;
  onPress: () => void;
  onDelete: () => void;
}

const DEFAULT_AVATAR = 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y';

export function CharacterCard({ character, onPress, onDelete }: CharacterCardProps) {
  const avatarSource = character.avatarUrl ? { uri: character.avatarUrl } : { uri: DEFAULT_AVATAR };

  const handleDeletePress = () => {
    Alert.alert(
      'Xóa nhân vật',
      `Bạn có chắc chắn muốn xóa nhân vật ${character.name}?`,
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Xóa', style: 'destructive', onPress: onDelete },
      ],
      { cancelable: true }
    );
  };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      onLongPress={handleDeletePress}
      activeOpacity={0.7}
    >
      <Image source={avatarSource} style={styles.avatar} />
      
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.name} numberOfLines={1}>
            {character.name}
          </Text>
          {character.age ? (
            <Text style={styles.age}>({character.age} tuổi)</Text>
          ) : null}
        </View>

        <Text style={styles.personality} numberOfLines={2}>
          {character.personality}
        </Text>

        <View style={styles.metaRow}>
          <View style={styles.metaBadge}>
            <Text style={styles.metaBadgeText}>
              🎙️ {character.voiceName} ({character.pitch.toFixed(2)}x)
            </Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={handleDeletePress}
        activeOpacity={0.6}
      >
        <Text style={styles.deleteIcon}>🗑️</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface || '#FFFFFF',
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.border,
  },
  content: {
    flex: 1,
    marginLeft: theme.spacing.md,
    marginRight: theme.spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  name: {
    ...theme.typography.body,
    fontWeight: '700',
    color: theme.colors.text,
    fontSize: 16,
  },
  age: {
    ...theme.typography.small,
    color: theme.colors.textMuted,
  },
  personality: {
    ...theme.typography.small,
    color: theme.colors.textMuted,
    lineHeight: 16,
    marginBottom: theme.spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
  },
  metaBadge: {
    backgroundColor: '#F1F5F9',
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.xs + 2,
    paddingVertical: 2,
  },
  metaBadgeText: {
    ...theme.typography.small,
    fontSize: 11,
    color: theme.colors.text,
    fontWeight: '600',
  },
  deleteBtn: {
    padding: theme.spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteIcon: {
    fontSize: 18,
  },
});
