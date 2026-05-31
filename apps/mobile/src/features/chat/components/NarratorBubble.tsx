import React, { useState } from 'react';
import { StyleSheet, Text, Pressable } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ChatMessage } from '../types/message';
import { PinyinRow } from './PinyinRow';
import { TranslationSlide } from './TranslationSlide';
import { useAuthStore } from '../../../stores/auth.store';
import { theme } from '../../../theme';

interface NarratorBubbleProps {
  msg: Extract<ChatMessage, { kind: 'assistant' }>;
}

export function NarratorBubble({ msg }: NarratorBubbleProps) {
  const [showTranslation, setShowTranslation] = useState(false);
  const showPinyinGlobal = useAuthStore(
    (s) => s.user?.preferences?.showPinyin ?? true
  );

  // Phát hiện nếu văn bản chứa chữ Hán (tiếng Trung)
  const isZh = /[\u4e00-\u9fa5]/.test(msg.text);

  return (
    <Animated.View
      entering={FadeInDown.duration(250)}
      style={styles.container}
    >
      <Pressable
        style={styles.bubble}
        onPress={() => setShowTranslation((s) => !s)}
      >
        <Text style={styles.text}>{msg.text}</Text>
        {isZh && showPinyinGlobal && <PinyinRow text={msg.text} />}
        <TranslationSlide
          translation={msg.translation}
          visible={showTranslation}
        />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    width: '100%',
  },
  bubble: {
    backgroundColor: '#F1F5F9', // Nền màu xám nhẹ
    borderColor: '#E2E8F0',
    borderWidth: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
  },
  text: {
    ...theme.typography.body,
    color: '#475569',
    fontStyle: 'italic',
    lineHeight: 22,
  },
});
