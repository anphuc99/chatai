import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TouchableOpacity,
} from 'react-native';
import { Word } from '../types/message';
import { theme } from '../../../theme';

interface WordTooltipProps {
  visible: boolean;
  word: Word | null;
  onClose: () => void;
  onSave: (word: Word) => void;
}

export function WordTooltip({ visible, word, onClose, onSave }: WordTooltipProps) {
  if (!word) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          {/* Nút Đóng góc trên bên phải */}
          <TouchableOpacity style={styles.closeIconButton} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.closeIconText}>×</Text>
          </TouchableOpacity>

          <Text style={styles.hzText}>{word.hz}</Text>
          <Text style={styles.pyText}>{word.py}</Text>
          <Text style={styles.vnText}>{word.vn}</Text>

          <TouchableOpacity
            style={styles.saveButton}
            onPress={() => {
              onSave(word);
              onClose();
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.saveButtonText}>💾 Lưu vào sổ từ</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)', // Nền overlay tối mờ
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  card: {
    width: '85%',
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.xxl,
    alignItems: 'center',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  closeIconButton: {
    position: 'absolute',
    top: 12,
    right: 16,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: theme.radius.full,
    backgroundColor: '#F1F5F9',
  },
  closeIconText: {
    fontSize: 22,
    color: theme.colors.textMuted,
    fontWeight: '300',
    marginTop: -2,
  },
  hzText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
    letterSpacing: 2,
  },
  pyText: {
    fontSize: 18,
    color: theme.colors.secondary,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  vnText: {
    fontSize: 16,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
    lineHeight: 24,
    paddingHorizontal: theme.spacing.md,
  },
  saveButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.radius.md,
    width: '100%',
    alignItems: 'center',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
});
