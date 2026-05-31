import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  Pressable,
  View,
  TouchableOpacity,
  Platform,
  ToastAndroid,
  Alert,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ChatMessage, Word } from '../types/message';
import { PinyinRow } from './PinyinRow';
import { TranslationSlide } from './TranslationSlide';
import { TappableChineseText } from './TappableChineseText';
import { WordTooltip } from './WordTooltip';
import { useAuthStore } from '../../../stores/auth.store';
import { theme } from '../../../theme';

const showToast = (message: string) => {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    Alert.alert('Thông báo', message);
  }
};

interface NarratorBubbleProps {
  msg: Extract<ChatMessage, { kind: 'assistant' }>;
}

export function NarratorBubble({ msg }: NarratorBubbleProps) {
  const [showTranslation, setShowTranslation] = useState(false);
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
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
      <View style={styles.bubble}>
        {isZh ? (
          <TappableChineseText
            text={msg.text}
            words={msg.words}
            onWordTap={setSelectedWord}
            baseStyle={styles.text}
          />
        ) : (
          <Text style={styles.text}>{msg.text}</Text>
        )}

        {isZh && showPinyinGlobal && <PinyinRow text={msg.text} />}

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

        <TranslationSlide
          translation={msg.translation}
          visible={showTranslation}
        />
      </View>

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
  translateToggle: {
    alignSelf: 'flex-end',
    marginTop: theme.spacing.xs,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: theme.radius.sm,
    backgroundColor: '#E2E8F0',
  },
  translateToggleText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
});
