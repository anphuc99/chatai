import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StoryStackParamList } from '../../../navigation/types';
import { useCharacters } from '../hooks/useCharacters';
import { CharacterCard } from './CharacterCard';
import { theme } from '../../../theme';

type NavigationProp = NativeStackNavigationProp<StoryStackParamList, 'Detail'>;

interface CharacterListSectionProps {
  storyId: string;
}

export function CharacterListSection({ storyId }: CharacterListSectionProps) {
  const navigation = useNavigation<NavigationProp>();
  const { charactersByStory, loadingByStory, load, delete: deleteChar } = useCharacters();

  const list = charactersByStory(storyId);
  const loading = loadingByStory(storyId);

  useEffect(() => {
    load(storyId).catch((err) => {
      console.warn('[CharacterListSection] Failed to load characters:', err);
    });
  }, [storyId, load]);

  const handleAdd = () => {
    navigation.navigate('CharacterEditor', { storyId });
  };

  const handleEdit = (id: string) => {
    navigation.navigate('CharacterEditor', { storyId, characterId: id });
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteChar(id, storyId);
    } catch (err: any) {
      Alert.alert('Lỗi', err.message || 'Không thể xóa nhân vật');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>👥 Nhân vật</Text>
        <TouchableOpacity style={styles.addBtn} onPress={handleAdd} activeOpacity={0.7}>
          <Text style={styles.addBtnText}>+ Thêm nhân vật</Text>
        </TouchableOpacity>
      </View>

      {loading && list.length === 0 ? (
        <ActivityIndicator size="small" color={theme.colors.primary} style={styles.loader} />
      ) : list.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Story chưa có nhân vật nào.</Text>
          <Text style={styles.emptySubText}>Tạo tối thiểu 1 nhân vật để có thể bắt đầu chat.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {list.map((char) => (
            <CharacterCard
              key={char.id}
              character={char}
              onPress={() => handleEdit(char.id)}
              onDelete={() => handleDelete(char.id)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  title: {
    ...theme.typography.h3,
    color: theme.colors.text,
  },
  addBtn: {
    backgroundColor: `${theme.colors.primary}10`,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.full,
  },
  addBtnText: {
    ...theme.typography.small,
    color: theme.colors.primary,
    fontWeight: '700',
  },
  loader: {
    marginVertical: theme.spacing.xl,
  },
  emptyContainer: {
    padding: theme.spacing.xl,
    backgroundColor: theme.colors.surface || '#FFFFFF',
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    ...theme.typography.body,
    fontWeight: '600',
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
  },
  emptySubText: {
    ...theme.typography.small,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  list: {
    marginTop: theme.spacing.xs,
  },
});
