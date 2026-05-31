import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { CHAT_LIMITS } from '@chatai/shared-types';
import { theme } from '../../../theme';

interface InputBarProps {
  onSend: (text: string, ephemeralOOC?: string) => void;
  disabled?: boolean;
}

export function InputBar({ onSend, disabled }: InputBarProps) {
  const [text, setText] = useState('');
  const [showOoc, setShowOoc] = useState(false);
  const [oocText, setOocText] = useState('');

  const handleSend = () => {
    if (!text.trim() || disabled) return;
    onSend(text.trim(), showOoc && oocText.trim() ? oocText.trim() : undefined);
    setText('');
    setOocText('');
    setShowOoc(false);
  };

  const isSendDisabled = !text.trim() || disabled;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      style={styles.container}
    >
      {/* Ô nhập Ephemeral OOC (nếu bật) */}
      {showOoc ? (
        <View style={styles.oocInputContainer}>
          <View style={styles.oocHeader}>
            <Text style={styles.oocTitle}>💭 Ngữ cảnh OOC tạm thời</Text>
            <TouchableOpacity onPress={() => setShowOoc(false)}>
              <Text style={styles.closeOocBtn}>✕</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.oocInput}
            value={oocText}
            onChangeText={setOocText}
            placeholder="Ví dụ: (Mình đang đứng dưới mưa/Có tiếng gõ cửa...)"
            placeholderTextColor={theme.colors.textMuted}
            multiline
            maxLength={CHAT_LIMITS.EPHEMERAL_OOC_MAX_LENGTH}
          />
        </View>
      ) : null}

      {/* Dòng chat chính */}
      <View style={styles.mainInputRow}>
        {/* Nút bật/tắt nhập Ephemeral OOC */}
        <TouchableOpacity
          style={[styles.oocToggleBtn, showOoc && styles.oocToggleBtnActive]}
          onPress={() => setShowOoc(!showOoc)}
          activeOpacity={0.7}
        >
          <Text style={[styles.oocToggleText, showOoc && styles.oocToggleTextActive]}>
            +OOC
          </Text>
        </TouchableOpacity>

        {/* Ô nhập tin nhắn */}
        <TextInput
          style={styles.textInput}
          value={text}
          onChangeText={setText}
          placeholder={disabled ? 'Đang chờ phản hồi...' : 'Gõ tin nhắn bằng tiếng Trung...'}
          placeholderTextColor={theme.colors.textMuted}
          multiline
          maxLength={CHAT_LIMITS.USER_MESSAGE_MAX_LENGTH}
          editable={!disabled}
        />

        {/* Nút gửi */}
        <TouchableOpacity
          style={[styles.sendBtn, isSendDisabled && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={isSendDisabled}
          activeOpacity={0.8}
        >
          <Text style={styles.sendBtnText}>Gửi</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  oocInputContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  oocHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  oocTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.warning,
  },
  closeOocBtn: {
    fontSize: 14,
    color: theme.colors.textMuted,
    paddingHorizontal: 6,
  },
  oocInput: {
    fontSize: 13,
    color: theme.colors.text,
    paddingVertical: 4,
    maxHeight: 60,
    textAlignVertical: 'top',
  },
  mainInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  oocToggleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  oocToggleBtnActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  oocToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  oocToggleTextActive: {
    color: theme.colors.warning,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 8,
    fontSize: 15,
    color: theme.colors.text,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sendBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: theme.colors.border,
  },
  sendBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
