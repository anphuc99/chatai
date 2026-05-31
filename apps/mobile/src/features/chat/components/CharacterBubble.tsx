import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  ToastAndroid,
  Alert,
  TouchableOpacity,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ChatMessage, Word } from '../types/message';
import { EmotionIcon } from './EmotionIcon';
import { PinyinRow } from './PinyinRow';
import { TranslationSlide } from './TranslationSlide';
import { TappableChineseText } from './TappableChineseText';
import { WordTooltip } from './WordTooltip';
import { useAuthStore } from '../../../stores/auth.store';
import { useChatStore } from '../store/chat.store';
import { WordPinyinRow } from './WordPinyinRow';
import { theme } from '../../../theme';

const showToast = (message: string) => {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    Alert.alert('Thông báo', message);
  }
};

interface CharacterBubbleProps {
  msg: Extract<ChatMessage, { kind: 'assistant' }>;
}

export function CharacterBubble({ msg }: CharacterBubbleProps) {
  const [showTranslation, setShowTranslation] = useState(false);
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const showPinyinGlobal = useAuthStore(
    (s) => s.user?.preferences?.showPinyin ?? true
  );

  const charactersFull = useChatStore((s) => s.charactersFull);
  const char = msg.characterId ? charactersFull.find((c) => c.id === msg.characterId) : undefined;
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
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarPlaceholderText}>
            {displayName.charAt(0)}
          </Text>
        </View>
      </View>

      {/* Bong bóng thoại */}
      <View style={styles.contentContainer}>
        <View style={styles.nameRow}>
          <Text style={styles.characterName}>{displayName}</Text>
          <EmotionIcon emotion={msg.emotion} />
        </View>

        <View style={styles.bubble}>
          <TappableChineseText
            text={msg.text}
            words={msg.words}
            onWordTap={setSelectedWord}
            baseStyle={styles.assistantText}
          />

          {showPinyinGlobal && (
            hasWords
              ? <WordPinyinRow words={words} onWordTap={setSelectedWord} />
              : <PinyinRow text={msg.text} />
          )}

          {/* Nút dịch nhỏ ở góc dưới */}
          {msg.translation && (
            <TouchableOpacity
              style={styles.translateToggle}
              onPress={() => setShowTranslation((s) => !s)}
              activeOpacity={0.7}
            >
              <Text style={styles.translateToggleText}>
                {showTranslation ? 'Ẩn bản dịch ▲' : 'Xem bản dịch ▼'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Hiệu ứng slide-down cho bản dịch */}
          <TranslationSlide
            translation={msg.translation}
            visible={showTranslation}
          />
        </View>
      </View>

      {/* Modal giải nghĩa từ vựng */}
      <WordTooltip
        visible={selectedWord !== null}
        word={selectedWord}
        onClose={() => setSelectedWord(null)}
        onSave={(w) => {
          showToast(`Đã lưu "${w.hz}" vào sổ từ`);
        }}
      />
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
  translateToggle: {
    alignSelf: 'flex-end',
    marginTop: theme.spacing.xs,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: theme.radius.sm,
    backgroundColor: '#F1F5F9',
  },
  translateToggleText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
});
