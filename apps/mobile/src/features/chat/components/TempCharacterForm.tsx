import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { theme } from '../../../theme';

interface TempCharacterFormProps {
  onAdd: (name: string, desc: string) => Promise<string | undefined>;
}

export function TempCharacterForm({ onAdd }: TempCharacterFormProps) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [loading, setLoading] = useState(false);

  const isNameValid = name.trim().length >= 1 && name.trim().length <= 50;
  const isDescValid = desc.trim().length >= 1 && desc.trim().length <= 500;
  const isValid = isNameValid && isDescValid;

  const handleSubmit = async () => {
    if (!isValid) return;
    setLoading(true);
    try {
      await onAdd(name.trim(), desc.trim());
      Alert.alert('Thành công', `Đã thêm nhân vật tạm thời "${name.trim()}"`);
      setName('');
      setDesc('');
    } catch (error: any) {
      Alert.alert('Lỗi', error?.message || 'Không thể thêm nhân vật tạm thời');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.formTitle}>👤 Thêm nhân vật tạm thời</Text>
      
      <Text style={styles.label}>Tên nhân vật ({name.trim().length}/50)</Text>
      <TextInput
        style={styles.input}
        placeholder="Ví dụ: Chủ quán rượu, tiểu nhị..."
        placeholderTextColor={theme.colors.textMuted}
        value={name}
        onChangeText={setName}
        maxLength={50}
      />

      <Text style={styles.label}>Mô tả / Vai trò ({desc.trim().length}/500)</Text>
      <TextInput
        style={[styles.input, styles.descInput]}
        placeholder="Ví dụ: Vui tính, hay nói to, bán rượu lâu năm và biết nhiều tin đồn..."
        placeholderTextColor={theme.colors.textMuted}
        value={desc}
        onChangeText={setDesc}
        multiline
        maxLength={500}
      />

      <TouchableOpacity
        style={[styles.submitBtn, (!isValid || loading) && styles.btnDisabled]}
        onPress={handleSubmit}
        disabled={!isValid || loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={styles.btnText}>Thêm vào cuộc trò chuyện</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing.lg,
  },
  formTitle: {
    ...theme.typography.body,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    fontSize: 14,
    color: theme.colors.text,
    backgroundColor: '#F8FAFC',
    marginBottom: theme.spacing.md,
  },
  descInput: {
    height: 80,
    textAlignVertical: 'top',
  },
  submitBtn: {
    backgroundColor: theme.colors.secondary,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.sm,
  },
  btnDisabled: {
    backgroundColor: theme.colors.border,
  },
  btnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
