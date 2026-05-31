import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { theme } from '../../../theme';

interface OocPanelProps {
  visible: boolean;
  onClose: () => void;
  persistentOOC: string;
  onSavePersistentOOC: (text: string) => Promise<void>;
  onAddTempCharacter: (name: string, desc: string) => Promise<string | undefined>;
}

export function OocPanel({
  visible,
  onClose,
  persistentOOC,
  onSavePersistentOOC,
  onAddTempCharacter,
}: OocPanelProps) {
  const [localOoc, setLocalOoc] = useState(persistentOOC);
  const [tempName, setTempName] = useState('');
  const [tempDesc, setTempDesc] = useState('');
  const [savingOoc, setSavingOoc] = useState(false);
  const [addingChar, setAddingChar] = useState(false);

  useEffect(() => {
    if (visible) {
      setLocalOoc(persistentOOC);
    }
  }, [visible, persistentOOC]);

  const handleSaveOoc = async () => {
    setSavingOoc(true);
    try {
      await onSavePersistentOOC(localOoc.trim());
      Alert.alert('Thành công', 'Đã cập nhật bối cảnh câu chuyện.');
    } catch (e: any) {
      Alert.alert('Lỗi', e?.message || 'Không thể lưu bối cảnh.');
    } finally {
      setSavingOoc(false);
    }
  };

  const handleAddChar = async () => {
    if (!tempName.trim() || !tempDesc.trim()) {
      Alert.alert('Thông báo', 'Vui lòng nhập đầy đủ tên và mô tả nhân vật.');
      return;
    }
    setAddingChar(true);
    try {
      await onAddTempCharacter(tempName.trim(), tempDesc.trim());
      Alert.alert('Thành công', `Đã thêm nhân vật tạm thời "${tempName.trim()}"`);
      setTempName('');
      setTempDesc('');
    } catch (e: any) {
      Alert.alert('Lỗi', e?.message || 'Không thể thêm nhân vật.');
    } finally {
      setAddingChar(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>⚙️ Quản lý bối cảnh & OOC</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Section 1: Persistent OOC */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📌 Bối cảnh cốt truyện (Persistent OOC)</Text>
              <Text style={styles.sectionDesc}>
                Thiết lập ngữ cảnh cố định cho toàn bộ cuộc trò chuyện (tối đa 200 ký tự).
              </Text>
              <TextInput
                style={styles.textArea}
                value={localOoc}
                onChangeText={setLocalOoc}
                placeholder="Ví dụ: Hai người đang đi bộ trong rừng đào vào một ngày gió nhẹ..."
                placeholderTextColor={theme.colors.textMuted}
                multiline
                maxLength={200}
              />
              <View style={styles.charCountContainer}>
                <Text style={styles.charCountText}>{localOoc.length}/200</Text>
              </View>
              <TouchableOpacity
                style={[styles.saveBtn, savingOoc && styles.btnDisabled]}
                onPress={handleSaveOoc}
                disabled={savingOoc}
                activeOpacity={0.8}
              >
                <Text style={styles.btnText}>
                  {savingOoc ? 'Đang lưu...' : 'Lưu bối cảnh'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Section 2: Temporary Character */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>👤 Thêm nhân vật tạm thời</Text>
              <Text style={styles.sectionDesc}>
                Tạo một nhân vật xuất hiện ngẫu nhiên trong cảnh này (ví dụ: Tiểu nhị, Thầy bói...).
              </Text>
              
              <Text style={styles.label}>Tên nhân vật</Text>
              <TextInput
                style={styles.input}
                value={tempName}
                onChangeText={setTempName}
                placeholder="Ví dụ: Chủ quán rượu"
                placeholderTextColor={theme.colors.textMuted}
              />

              <Text style={styles.label}>Mô tả / Vai trò</Text>
              <TextInput
                style={[styles.input, styles.descInput]}
                value={tempDesc}
                onChangeText={setTempDesc}
                placeholder="Ví dụ: Vui tính, hay nói to, bán rượu lâu năm và biết nhiều tin đồn..."
                placeholderTextColor={theme.colors.textMuted}
                multiline
              />

              <TouchableOpacity
                style={[styles.addBtn, addingChar && styles.btnDisabled]}
                onPress={handleAddChar}
                disabled={addingChar}
                activeOpacity={0.8}
              >
                <Text style={styles.btnText}>
                  {addingChar ? 'Đang thêm...' : 'Thêm vào cuộc trò chuyện'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    maxHeight: '85%',
    paddingBottom: theme.spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: {
    ...theme.typography.h3,
    color: theme.colors.text,
  },
  closeBtn: {
    padding: 4,
  },
  closeBtnText: {
    fontSize: 20,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  body: {
    padding: theme.spacing.lg,
  },
  section: {
    marginBottom: theme.spacing.xl,
  },
  sectionTitle: {
    ...theme.typography.body,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 4,
  },
  sectionDesc: {
    ...theme.typography.small,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.md,
  },
  textArea: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    fontSize: 14,
    color: theme.colors.text,
    height: 80,
    textAlignVertical: 'top',
    backgroundColor: '#F8FAFC',
  },
  charCountContainer: {
    alignItems: 'flex-end',
    marginTop: 4,
    marginBottom: theme.spacing.sm,
  },
  charCountText: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  saveBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.full,
    alignItems: 'center',
  },
  addBtn: {
    backgroundColor: theme.colors.secondary,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.full,
    alignItems: 'center',
  },
  btnDisabled: {
    backgroundColor: theme.colors.border,
  },
  btnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text,
    marginTop: theme.spacing.md,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.colors.text,
    backgroundColor: '#F8FAFC',
  },
  descInput: {
    height: 60,
    textAlignVertical: 'top',
    marginBottom: theme.spacing.lg,
  },
});
