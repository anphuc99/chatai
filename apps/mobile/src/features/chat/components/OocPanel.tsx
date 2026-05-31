import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Animated,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { theme } from '../../../theme';
import { useChatStore } from '../store/chat.store';
import { CharacterRow } from './CharacterRow';
import { TempCharacterForm } from './TempCharacterForm';

interface OocPanelProps {
  visible: boolean;
  onClose: () => void;
}

const { width: windowWidth } = Dimensions.get('window');
const PANEL_WIDTH = windowWidth * 0.8;

export function OocPanel({ visible, onClose }: OocPanelProps) {
  const {
    persistentOOC,
    activeCharacters,
    charactersFull,
    temporaryCharacters,
    setPersistentOOC,
    toggleCharacter,
    loadStoryCharacters,
    addTempCharacter,
  } = useChatStore();

  const [localOoc, setLocalOoc] = useState(persistentOOC);
  const [savingOoc, setSavingOoc] = useState(false);
  const [clearingOoc, setClearingOoc] = useState(false);
  const [loadingChars, setLoadingChars] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Quản lý animation
  const translateX = useRef(new Animated.Value(PANEL_WIDTH)).current;
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    if (visible) {
      setModalVisible(true);
      setLocalOoc(persistentOOC);
      
      // Load story characters nếu chưa có
      if (charactersFull.length === 0) {
        setLoadingChars(true);
        loadStoryCharacters()
          .catch((err) => console.warn('Lỗi tải nhân vật story:', err))
          .finally(() => setLoadingChars(false));
      }

      Animated.timing(translateX, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      // Khi component cha set visible = false trực tiếp (nếu có)
      // Ta đảm bảo đồng bộ đóng modal cục bộ
      handleClose();
    }
  }, [visible]);

  const handleClose = () => {
    Animated.timing(translateX, {
      toValue: PANEL_WIDTH,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setModalVisible(false);
      onClose();
    });
  };

  const handleSaveOoc = async () => {
    setSavingOoc(true);
    try {
      await setPersistentOOC(localOoc.trim());
      Alert.alert('Thành công', 'Đã lưu bối cảnh cốt truyện.');
    } catch (e: any) {
      Alert.alert('Lỗi', e?.message || 'Không thể lưu bối cảnh.');
    } finally {
      setSavingOoc(false);
    }
  };

  const handleClearOoc = async () => {
    setClearingOoc(true);
    try {
      await setPersistentOOC('');
      setLocalOoc('');
      Alert.alert('Thành công', 'Đã xóa bối cảnh cốt truyện.');
    } catch (e: any) {
      Alert.alert('Lỗi', e?.message || 'Không thể xóa bối cảnh.');
    } finally {
      setClearingOoc(false);
    }
  };

  const handleToggleChar = async (charId: string, on: boolean) => {
    setTogglingId(charId);
    try {
      await toggleCharacter(charId, on);
    } catch (e: any) {
      Alert.alert('Lỗi', e?.message || 'Không thể thay đổi trạng thái nhân vật.');
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <Modal visible={modalVisible} transparent animationType="none" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        {/* Backdrop che 20% bên trái */}
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />

        {/* Panel Sidebar trượt từ phải */}
        <Animated.View style={[styles.container, { transform: [{ translateX }] }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>⚙️ Bối cảnh & Nhân vật</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Section 1: Persistent OOC */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📌 Bối cảnh cốt truyện</Text>
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
              
              <View style={styles.oocBtnRow}>
                <TouchableOpacity
                  style={[styles.saveBtn, savingOoc && styles.btnDisabled]}
                  onPress={handleSaveOoc}
                  disabled={savingOoc}
                  activeOpacity={0.8}
                >
                  <Text style={styles.btnText}>
                    {savingOoc ? 'Đang lưu...' : 'Lưu'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.clearBtn, (!persistentOOC || clearingOoc) && styles.clearBtnDisabled]}
                  onPress={handleClearOoc}
                  disabled={!persistentOOC || clearingOoc}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.clearBtnText, !persistentOOC && styles.clearBtnTextDisabled]}>
                    {clearingOoc ? 'Đang xóa...' : 'Xóa'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Section 2: Active Characters */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>👥 Nhân vật hoạt động</Text>
              <Text style={styles.sectionDesc}>
                Bật/tắt các nhân vật tham gia vào cuộc hội thoại hiện tại.
              </Text>
              {loadingChars ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                  <Text style={styles.loadingText}>Đang tải danh sách nhân vật...</Text>
                </View>
              ) : charactersFull.length === 0 ? (
                <Text style={styles.emptyText}>Không tìm thấy nhân vật nào.</Text>
              ) : (
                charactersFull.map((char) => (
                  <CharacterRow
                    key={char.id}
                    name={char.name}
                    avatarUrl={char.avatarUrl}
                    checked={activeCharacters.includes(char.id)}
                    isToggling={togglingId === char.id}
                    onChange={(on) => handleToggleChar(char.id, on)}
                  />
                ))
              )}
            </View>

            {/* Section 3: Temporary Characters */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>👥 Nhân vật tạm thời</Text>
              <Text style={styles.sectionDesc}>
                Nhân vật dùng một lần xuất hiện trong phiên chat hiện tại.
              </Text>
              
              {/* Danh sách nhân vật tạm thời */}
              {temporaryCharacters.length > 0 ? (
                <View style={styles.tempList}>
                  {temporaryCharacters.map((temp) => (
                    <View key={temp.tempId} style={styles.tempItem}>
                      <Text style={styles.tempName}>{temp.name}</Text>
                      <Text style={styles.tempDesc}>{temp.description}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyText}>Chưa có nhân vật tạm thời nào.</Text>
              )}

              {/* Form thêm mới */}
              <TempCharacterForm onAdd={addTempCharacter} />
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  backdrop: {
    flex: 2, // Chiếm khoảng 20% màn hình
  },
  container: {
    flex: 8, // Chiếm khoảng 80% màn hình
    backgroundColor: '#FFFFFF',
    height: '100%',
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 10,
    paddingBottom: theme.spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    marginTop: 20, // Dự phòng cho Safe Area trên iOS
  },
  title: {
    ...theme.typography.h3,
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    fontSize: 18,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  body: {
    padding: theme.spacing.lg,
  },
  section: {
    marginBottom: theme.spacing.xl,
    paddingBottom: theme.spacing.md,
  },
  sectionTitle: {
    ...theme.typography.body,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 4,
  },
  sectionDesc: {
    ...theme.typography.small,
    fontSize: 12,
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
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  oocBtnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  saveBtn: {
    flex: 2,
    backgroundColor: theme.colors.primary,
    paddingVertical: 10,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    paddingVertical: 10,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtnDisabled: {
    borderColor: theme.colors.border,
  },
  clearBtnText: {
    color: theme.colors.primary,
    fontWeight: '700',
    fontSize: 14,
  },
  clearBtnTextDisabled: {
    color: theme.colors.textMuted,
  },
  btnDisabled: {
    backgroundColor: theme.colors.border,
  },
  btnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.lg,
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  emptyText: {
    fontSize: 13,
    color: theme.colors.textMuted,
    fontStyle: 'italic',
    paddingVertical: theme.spacing.sm,
  },
  tempList: {
    gap: 10,
    marginBottom: theme.spacing.md,
  },
  tempItem: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
  },
  tempName: {
    ...theme.typography.body,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 4,
  },
  tempDesc: {
    ...theme.typography.small,
    color: theme.colors.textMuted,
  },
});
