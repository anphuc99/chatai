import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { VOICE_METADATA, VoiceName, VoiceMeta } from '@chatai/shared-types';
import { theme } from '../../../theme';

interface VoiceSelectorProps {
  value?: VoiceName;
  onChange: (voiceName: VoiceName) => void;
}

export function VoiceSelector({ value, onChange }: VoiceSelectorProps) {
  const renderItem = ({ item }: { item: VoiceMeta }) => {
    const isSelected = item.name === value;
    const genderEmoji =
      item.gender === 'female' ? '👩' : item.gender === 'male' ? '👨' : '👤';

    return (
      <TouchableOpacity
        style={[styles.card, isSelected && styles.selectedCard]}
        onPress={() => onChange(item.name)}
        activeOpacity={0.7}
      >
        <Text style={styles.genderIcon}>{genderEmoji}</Text>
        <Text style={[styles.voiceName, isSelected && styles.selectedText]}>
          {item.name}
        </Text>
        <Text style={[styles.sampleHint, isSelected && styles.selectedTextMuted]}>
          {item.sampleHint}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Giọng nói nhân vật *</Text>
      <FlatList
        data={VOICE_METADATA}
        renderItem={renderItem}
        keyExtractor={(item) => item.name}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: theme.spacing.xs,
  },
  label: {
    ...theme.typography.caption,
    color: theme.colors.text,
    fontWeight: '600',
    marginBottom: theme.spacing.sm,
  },
  listContent: {
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  card: {
    width: 104,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  selectedCard: {
    borderColor: theme.colors.primary,
    backgroundColor: `${theme.colors.primary}0a`,
    borderWidth: 2,
  },
  genderIcon: {
    fontSize: 26,
    marginBottom: theme.spacing.xs,
  },
  voiceName: {
    ...theme.typography.body,
    fontWeight: 'bold',
    color: theme.colors.text,
    fontSize: 14,
    marginBottom: 2,
  },
  selectedText: {
    color: theme.colors.primary,
  },
  sampleHint: {
    ...theme.typography.small,
    color: theme.colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
  },
  selectedTextMuted: {
    color: theme.colors.primary,
    opacity: 0.8,
  },
});
