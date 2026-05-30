import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StoryStackParamList } from '../../../navigation/types';
import { useStories } from '../hooks/useStories';
import { StoryCard } from '../components/StoryCard';
import { StoryDto } from '@chatai/shared-types';
import { theme } from '../../../theme';

type Nav = NativeStackNavigationProp<StoryStackParamList>;

export function StoryListScreen() {
  const navigation = useNavigation<Nav>();
  const { stories, loading, loadMore, refresh, delete: deleteStory } = useStories();

  useEffect(() => {
    refresh().catch(console.warn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = useCallback(() => {
    navigation.navigate('Create', { mode: 'create' });
  }, [navigation]);

  const handlePress = useCallback(
    (story: StoryDto) => {
      navigation.navigate('Detail', { id: story.id });
    },
    [navigation],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteStory(id);
      } catch (e) {
        console.warn('[StoryListScreen] Delete failed:', e);
      }
    },
    [deleteStory],
  );

  const renderItem = useCallback(
    ({ item }: { item: StoryDto }) => (
      <StoryCard
        story={item}
        onPress={() => handlePress(item)}
        onDelete={() => handleDelete(item.id)}
      />
    ),
    [handlePress, handleDelete],
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyEmoji}>📚</Text>
      <Text style={styles.emptyTitle}>Chưa có Story nào</Text>
      <Text style={styles.emptySubtitle}>
        Tạo câu chuyện nhập vai đầu tiên của bạn để bắt đầu cuộc phiêu lưu!
      </Text>
      <TouchableOpacity style={styles.emptyBtn} onPress={handleCreate} activeOpacity={0.8}>
        <Text style={styles.emptyBtnText}>✨ Tạo Story đầu tiên</Text>
      </TouchableOpacity>
    </View>
  );

  const renderFooter = () => {
    if (!loading || stories.length === 0) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Truyện AI</Text>
          <Text style={styles.headerSub}>{stories.length} câu chuyện</Text>
        </View>
        <TouchableOpacity style={styles.fab} onPress={handleCreate} activeOpacity={0.8}>
          <Text style={styles.fabIcon}>＋</Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      <FlatList
        data={stories}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListEmptyComponent={loading ? null : renderEmpty}
        ListFooterComponent={renderFooter}
        refreshControl={
          <RefreshControl
            refreshing={loading && stories.length === 0}
            onRefresh={refresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        contentContainerStyle={stories.length === 0 ? styles.emptyList : styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {/* Loading overlay on first load */}
      {loading && stories.length === 0 && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Đang tải...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: {
    ...theme.typography.h2,
    color: theme.colors.text,
  },
  headerSub: {
    ...theme.typography.small,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  fab: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  fabIcon: {
    fontSize: 24,
    color: '#fff',
    lineHeight: 28,
  },
  listContent: {
    paddingVertical: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
  },
  emptyList: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.xxl,
  },
  emptyEmoji: {
    fontSize: 56,
    marginBottom: theme.spacing.lg,
  },
  emptyTitle: {
    ...theme.typography.h3,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...theme.typography.body,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: theme.spacing.xl,
  },
  emptyBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.full,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyBtnText: {
    ...theme.typography.body,
    color: '#fff',
    fontWeight: '700',
  },
  footerLoader: {
    paddingVertical: theme.spacing.lg,
    alignItems: 'center',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  loadingText: {
    ...theme.typography.body,
    color: theme.colors.textMuted,
  },
});
