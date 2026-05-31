import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { ChatMessage } from '../types/message';
import { theme } from '../../../theme';

interface MessageBubbleProps {
  msg: ChatMessage;
  avatarUrl?: string | null;
}

export function MessageBubble({ msg, avatarUrl }: MessageBubbleProps) {
  const [showTranslation, setShowTranslation] = useState(false);

  const handlePlayVoice = () => {
    Alert.alert(
      'Phát âm thanh',
      'Tính năng phát âm tự động (TTS) cho hội thoại sẽ được tích hợp ở Phase 5!'
    );
  };

  switch (msg.kind) {
    case 'user':
      return (
        <View style={styles.userContainer}>
          <View style={styles.userBubble}>
            <Text style={styles.userText}>{msg.text}</Text>
          </View>
        </View>
      );

    case 'assistant': {
      const hasWords = msg.words && msg.words.length > 0;
      return (
        <View style={styles.assistantContainer}>
          {/* Avatar đại diện */}
          <View style={styles.avatarContainer}>
            {avatarUrl ? (
              // Ở đây dùng một View placeholder thay cho Image thực tế nếu đường dẫn lỗi, 
              // hoặc vẽ một avatar chữ cái đầu tiên rất chuyên nghiệp
              <View style={styles.avatarIcon}>
                <Text style={styles.avatarText}>
                  {msg.characterName?.charAt(0) || 'AI'}
                </Text>
              </View>
            ) : (
              <View style={styles.avatarIcon}>
                <Text style={styles.avatarText}>
                  {msg.characterName?.charAt(0) || 'AI'}
                </Text>
              </View>
            )}
          </View>

          {/* Bong bóng thoại */}
          <View style={styles.contentContainer}>
            <Text style={styles.characterName}>{msg.characterName}</Text>
            
            <View style={styles.assistantBubble}>
              {/* Nội dung câu thoại (Chữ Hán kèm Pinyin nếu có) */}
              {hasWords && msg.words ? (
                <View style={styles.wordsRow}>
                  {msg.words.map((w, idx) => (
                    <View key={idx} style={styles.wordBlock}>
                      <Text style={styles.pinyinText}>{w.py}</Text>
                      <Text style={styles.hanziText}>{w.hz}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.assistantText}>{msg.text}</Text>
              )}

              {/* Phản hồi cảm xúc nếu có */}
              {msg.emotion ? (
                <View style={styles.emotionChip}>
                  <Text style={styles.emotionText}>
                    🎭 {msg.emotion} ({msg.intensity || 'medium'})
                  </Text>
                </View>
              ) : null}

              {/* Bản dịch dịch tiếng Việt */}
              {showTranslation && msg.translation ? (
                <View style={styles.translationContainer}>
                  <Text style={styles.translationText}>{msg.translation}</Text>
                </View>
              ) : null}

              {/* Nút tiện ích: Loa 🔊 và Dịch 🌐 */}
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={handlePlayVoice}
                  activeOpacity={0.7}
                >
                  <Text style={styles.actionIcon}>🔊</Text>
                </TouchableOpacity>

                {msg.translation ? (
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      showTranslation && styles.actionBtnActive,
                    ]}
                    onPress={() => setShowTranslation(!showTranslation)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionIcon}>🌐 Dịch</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>
        </View>
      );
    }

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
  userContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  userBubble: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderBottomRightRadius: theme.radius.sm,
    maxWidth: '80%',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  userText: {
    ...theme.typography.body,
    color: '#FFFFFF',
    lineHeight: 22,
  },
  assistantContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  avatarContainer: {
    marginRight: theme.spacing.md,
    marginTop: 4,
  },
  avatarIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 18,
  },
  contentContainer: {
    flex: 1,
    maxWidth: '80%',
  },
  characterName: {
    ...theme.typography.small,
    color: theme.colors.textMuted,
    fontWeight: '600',
    marginBottom: 4,
    marginLeft: 4,
  },
  assistantBubble: {
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
  emotionChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
    marginTop: theme.spacing.sm,
  },
  emotionText: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  translationContainer: {
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  translationText: {
    ...theme.typography.caption,
    color: theme.colors.text,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginTop: theme.spacing.sm,
    paddingTop: 4,
  },
  actionBtn: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radius.sm,
    backgroundColor: '#EDF2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnActive: {
    backgroundColor: '#C7D2FE',
  },
  actionIcon: {
    fontSize: 12,
    color: theme.colors.text,
    fontWeight: '600',
  },
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
