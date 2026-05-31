import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ChatMessage } from '../types/message';
import { UserBubble } from './UserBubble';
import { NarratorBubble } from './NarratorBubble';
import { CharacterBubble } from './CharacterBubble';
import { theme } from '../../../theme';

interface MessageBubbleProps {
  msg: ChatMessage;
}

export function MessageBubble({ msg }: MessageBubbleProps) {
  switch (msg.kind) {
    case 'user':
      return <UserBubble msg={msg} />;

    case 'assistant':
      // Nếu tên nhân vật là Narrator hoặc không có characterId thì là NarratorBubble
      if (msg.characterName === 'Narrator' || msg.characterId == null) {
        return <NarratorBubble msg={msg} />;
      }
      return <CharacterBubble msg={msg} />;

    case 'persistent_ooc':
      return (
        <View style={styles.oocContainer}>
          <View style={[styles.oocBubble, styles.persistentOocBg]}>
            <Text style={styles.oocLabel}>📌 Bối cảnh câu chuyện:</Text>
            <Text style={styles.oocText}>{msg.text}</Text>
          </View>
        </View>
      );

    case 'ephemeral_ooc':
      return (
        <View style={styles.oocContainer}>
          <View style={[styles.oocBubble, styles.ephemeralOocBg]}>
            <Text style={styles.oocLabel}>💭 Ngữ cảnh ngoài hội thoại (OOC):</Text>
            <Text style={styles.oocText}>{msg.text}</Text>
          </View>
        </View>
      );

    case 'system':
      return (
        <View style={styles.systemContainer}>
          <View style={styles.systemBubble}>
            <Text style={styles.systemText}>{msg.text}</Text>
          </View>
        </View>
      );

    default:
      return null;
  }
}

const styles = StyleSheet.create({
  oocContainer: {
    alignItems: 'center',
    marginVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
  },
  oocBubble: {
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    width: '100%',
    borderWidth: 1,
  },
  persistentOocBg: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  ephemeralOocBg: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  oocLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.warning,
    marginBottom: 4,
  },
  oocText: {
    fontSize: 13,
    fontStyle: 'italic',
    color: theme.colors.text,
    lineHeight: 18,
  },
  systemContainer: {
    alignItems: 'center',
    marginVertical: theme.spacing.sm,
  },
  systemBubble: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.full,
  },
  systemText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
});
