import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ChatMessage } from '../types/message';
import { EmotionIcon } from './EmotionIcon';
import { PinyinRow } from './PinyinRow';
import { TranslationSlide } from './TranslationSlide';
import { useAuthStore } from '../../../stores/auth.store';
import { useChatStore } from '../store/chat.store';
import { useCharactersMap } from '../hooks/useCharactersMap';
import { theme } from '../../../theme';

interface CharacterBubbleProps {
  msg: Extract<ChatMessage, { kind: 'assistant' }>;
}

export function CharacterBubble({ msg }: CharacterBubbleProps) {
  const [showTranslation, setShowTranslation] = useState(false);
  const showPinyinGlobal = useAuthStore(
    (s) => s.user?.preferences?.showPinyin ?? true
  );

  const storyId = useChatStore((s) => s.storyId);
  const charMap = useCharactersMap(storyId);

  const char = msg.characterId ? charMap.get(msg.characterId) : undefined;
  const avatarUrl = char?.avatarUrl;
  const displayName = char?.name || msg.characterName || 'Nhân vật';

  const words = msg.words || [];
  const hasWords = words.length > 0;

  return (
    <Animated.View
      entering={FadeInDown.duration(250)}
      style={styles.container}
    >
      {/* Avatar đại diện */}
      <View style={styles.avatarContainer}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarPlaceholderText}>
              {displayName.charAt(0)}
            </Text>
          </View>
        )}
      </View>

      {/* Bong bóng thoại */}
      <View style={styles.contentContainer}>
        <View style={styles.nameRow}>
          <Text style={styles.characterName}>{displayName}</Text>
          <EmotionIcon emotion={msg.emotion} />
        </View>

        <Pressable
          style={styles.bubble}
          onPress={() => setShowTranslation((s) => !s)}
        >
          {showPinyinGlobal && hasWords ? (
            <View style={styles.wordsRow}>
              {words.map((w, idx) => (
                <View key={idx} style={styles.wordBlock}>
                  <Text style={styles.pinyinText}>{w.py}</Text>
                  <Text style={styles.hanziText}>{w.hz}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View>
              <Text style={styles.assistantText}>{msg.text}</Text>
              {showPinyinGlobal && !hasWords && <PinyinRow text={msg.text} />}
            </View>
          )}

          {/* Hiệu ứng slide-down cho bản dịch */}
          <TranslationSlide
            translation={msg.translation}
            visible={showTranslation}
          />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  avatarContainer: {
    marginRight: theme.spacing.md,
    marginTop: 4,
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPlaceholderText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 18,
  },
  contentContainer: {
    flex: 1,
    maxWidth: '80%',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    marginLeft: 4,
  },
  characterName: {
    ...theme.typography.small,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  bubble: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderBottomLeftRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  assistantText: {
    ...theme.typography.body,
    color: theme.colors.text,
    lineHeight: 24,
  },
  wordsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    rowGap: 8,
    columnGap: 4,
    marginVertical: 4,
  },
  wordBlock: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    minWidth: 26,
    paddingHorizontal: 2,
  },
  pinyinText: {
    fontSize: 11,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginBottom: 2,
  },
  hanziText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
    textAlign: 'center',
  },
});
