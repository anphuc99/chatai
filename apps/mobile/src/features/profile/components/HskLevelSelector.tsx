import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { HskLevel } from '@chatai/shared-types';
import { theme } from '../../../theme';

interface HskLevelSelectorProps {
  value: HskLevel;
  onChange: (value: HskLevel) => void;
}

const HSK_LEVELS: HskLevel[] = ['HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5', 'HSK6'];

export function HskLevelSelector({ value, onChange }: HskLevelSelectorProps) {
  const [modalVisible, setModalVisible] = useState(false);

  const handleSelect = (level: HskLevel) => {
    onChange(level);
    setModalVisible(false);
  };

  return (
    <View>
      <Pressable
        onPress={() => setModalVisible(true)}
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={styles.buttonText}>{value}</Text>
      </Pressable>

      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Chọn cấp độ HSK</Text>
            <Text style={styles.modalSubtitle}>
              Cấp độ này sẽ tối ưu hóa nội dung học và các cuộc trò chuyện AI của bạn.
            </Text>

            <View style={styles.grid}>
              {HSK_LEVELS.map((level) => {
                const isActive = level === value;
                return (
                  <Pressable
                    key={level}
                    onPress={() => handleSelect(level)}
                    style={({ pressed }) => [
                      styles.gridItem,
                      isActive ? styles.gridItemActive : styles.gridItemInactive,
                      pressed && styles.gridItemPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.gridItemText,
                        isActive ? styles.gridItemTextActive : styles.gridItemTextInactive,
                      ]}
                    >
                      {level}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={() => setModalVisible(false)}
              style={({ pressed }) => [
                styles.closeButton,
                pressed && styles.closeButtonPressed,
              ]}
            >
              <Text style={styles.closeButtonText}>Đóng</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    ...theme.typography.body,
    color: theme.colors.primary,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  modalContent: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.xl,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10,
  },
  modalTitle: {
    ...theme.typography.h2,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
    fontWeight: '700',
  },
  modalSubtitle: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
    lineHeight: 18,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    width: '100%',
    rowGap: theme.spacing.md,
    marginBottom: theme.spacing.xl,
  },
  gridItem: {
    width: '47%',
    height: 52,
    borderRadius: theme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  gridItemPressed: {
    transform: [{ scale: 0.97 }],
  },
  gridItemActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  gridItemInactive: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
  gridItemText: {
    ...theme.typography.body,
    fontWeight: '700',
  },
  gridItemTextActive: {
    color: '#FFFFFF',
  },
  gridItemTextInactive: {
    color: theme.colors.text,
  },
  closeButton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
  },
  closeButtonPressed: {
    opacity: 0.7,
  },
  closeButtonText: {
    ...theme.typography.body,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
});
