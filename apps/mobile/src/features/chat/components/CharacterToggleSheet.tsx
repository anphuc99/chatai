import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { CharacterDto } from '@chatai/shared-types';
import { characterApi } from '../../character/services/character.api';
import { theme } from '../../../theme';

interface CharacterToggleSheetProps {
  visible: boolean;
  onClose: () => void;
  storyId: string;
  activeCharacters: string[];
  onToggleCharacter: (charId: string, on: boolean) => Promise<void>;
}

export function CharacterToggleSheet({
  visible,
  onClose,
  storyId,
  activeCharacters,
  onToggleCharacter,
}: CharacterToggleSheetProps) {
  const [characters, setCharacters] = useState<CharacterDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    if (visible && storyId) {
      loadCharacters();
    }
  }, [visible, storyId]);

  const loadCharacters = async () => {
    setLoading(true);
    try {
      const data = await characterApi.listByStory(storyId);
      setCharacters(data || []);
    } catch (error) {
      console.error('[CharacterToggleSheet] Lỗi tải nhân vật:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (charId: string, value: boolean) => {
    setTogglingId(charId);
    try {
      await onToggleCharacter(charId, value);
    } catch (error) {
      console.error('[CharacterToggleSheet] Lỗi toggle nhân vật:', error);
    } finally {
      setTogglingId(null);
    }
  };

  const renderItem = ({ item }: { item: CharacterDto }) => {
    const isActive = activeCharacters.includes(item.id);
    const isToggling = togglingId === item.id;

    return (
      <View style={styles.itemRow}>
        <View style={styles.charInfo}>
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>
              {item.name ? item.name.charAt(0) : '👤'}
            </Text>
          </View>
          <View>
            <Text style={styles.charName}>{item.name}</Text>
            <Text style={styles.charRole} numberOfLines={1}>
              {item.personality || 'Không có mô tả'}
            </Text>
          </View>
        </View>
        
        {isToggling ? (
          <ActivityIndicator size="small" color={theme.colors.primary} style={styles.loader} />
        ) : (
          <Switch
            value={isActive}
            onValueChange={(val) => handleToggle(item.id, val)}
            trackColor={{ false: '#CBD5E1', true: '#C7D2FE' }}
            thumbColor={isActive ? theme.colors.primary : '#94A3B8'}
          />
        )}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>👥 Chọn nhân vật hoạt động</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Body */}
          <View style={styles.body}>
            {loading ? (
              <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={styles.loadingText}>Đang tải danh sách nhân vật...</Text>
              </View>
            ) : characters.length === 0 ? (
              <View style={styles.centerContainer}>
                <Text style={styles.emptyText}>Chưa có nhân vật nào trong Story này.</Text>
              </View>
            ) : (
              <FlatList
                data={characters}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>
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
    maxHeight: '60%',
    minHeight: '40%',
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
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  loadingText: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.md,
  },
  emptyText: {
    ...theme.typography.body,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  listContent: {
    padding: theme.spacing.lg,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  charInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: theme.spacing.md,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  avatarText: {
    fontSize: 16,
    color: theme.colors.text,
    fontWeight: 'bold',
  },
  charName: {
    ...theme.typography.body,
    fontWeight: '600',
    color: theme.colors.text,
  },
  charRole: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  loader: {
    marginRight: 10,
  },
});
