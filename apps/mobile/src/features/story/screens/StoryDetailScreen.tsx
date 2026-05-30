import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StoryStackParamList } from '../../../navigation/types';
import { StoryDto } from '@chatai/shared-types';
import { storyApi } from '../services/story.api';
import { useStoryStore } from '../store/story.store';
import { theme } from '../../../theme';
import { CharacterListSection } from '../../character/components/CharacterListSection';
import { useCharacterStore } from '../../character/store/character.store';

type Nav = NativeStackNavigationProp<StoryStackParamList>;
type Route = RouteProp<StoryStackParamList, 'Detail'>;

export function StoryDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { id } = route.params;

  const cachedStory = useStoryStore((s) => s.storiesById[id]);
  const [story, setStory] = useState<StoryDto | null>(cachedStory ?? null);
  const [loading, setLoading] = useState(!cachedStory);
  const [error, setError] = useState<string | null>(null);

  const characters = useCharacterStore((s) => s.byStory[id]);
  const characterCount = characters !== undefined ? characters.length : (story?.characterCount ?? 0);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await storyApi.getById(id);
      setStory(data);
    } catch (e: any) {
      setError(e?.message ?? 'Không thể tải Story');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handleEdit = useCallback(() => {
    if (!story) return;
    navigation.navigate('Create', {
      mode: 'edit',
      id: story.id,
      title: story.title,
      initialSetting: story.initialSetting,
    });
  }, [navigation, story]);

  const handleStartChat = useCallback(() => {
    // P04: wire lên chat session
    Alert.alert('Sắp ra mắt', 'Tính năng Chat sẽ được mở ở P04!');
  }, []);

  if (loading && !story) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Đang tải...</Text>
      </View>
    );
  }

  if (error || !story) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorEmoji}>⚠️</Text>
        <Text style={styles.errorText}>{error ?? 'Không tìm thấy Story'}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={loadDetail}>
          <Text style={styles.retryText}>Thử lại</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Story Header */}
        <View style={styles.storyHeader}>
          <View style={styles.storyTitleRow}>
            <Text style={styles.storyTitle} numberOfLines={2}>
              {story.title}
            </Text>
            <TouchableOpacity style={styles.editBtn} onPress={handleEdit} activeOpacity={0.7}>
              <Text style={styles.editBtnText}>✏️</Text>
            </TouchableOpacity>
          </View>

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statChip}>
              <Text style={styles.statText}>👥 {characterCount} nhân vật</Text>
            </View>
            <View style={styles.statChip}>
              <Text style={styles.statText}>💬 {story.sessionCount} phiên</Text>
            </View>
          </View>
        </View>

        {/* Initial Setting */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>📖 Bối cảnh ban đầu</Text>
          <View style={styles.settingCard}>
            <Text style={styles.settingText}>{story.initialSetting}</Text>
          </View>
        </View>

        {/* Current Progress */}
        {story.currentProgress ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>🗺️ Tiến độ hiện tại</Text>
            <View style={[styles.settingCard, styles.progressCard]}>
              <Text style={styles.settingText}>{story.currentProgress}</Text>
            </View>
          </View>
        ) : null}

        {/* Characters Stub (P02.T5) */}
        <CharacterListSection storyId={id} />
      </ScrollView>

      {/* Footer: Start Chat Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.chatBtn,
            characterCount === 0 && styles.chatBtnDisabled,
          ]}
          onPress={handleStartChat}
          disabled={characterCount === 0}
          activeOpacity={0.8}
        >
          <Text style={styles.chatBtnText}>
            {characterCount === 0
              ? '🔒 Thêm nhân vật để chat'
              : '🚀 Bắt đầu Chat'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: theme.spacing.xxl,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
    backgroundColor: theme.colors.background,
  },
  loadingText: {
    ...theme.typography.body,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.md,
  },
  errorEmoji: {
    fontSize: 48,
    marginBottom: theme.spacing.md,
  },
  errorText: {
    ...theme.typography.body,
    color: theme.colors.error,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  retryBtn: {
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
  },
  retryText: {
    ...theme.typography.body,
    color: '#fff',
    fontWeight: '600',
  },
  storyHeader: {
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  storyTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  storyTitle: {
    ...theme.typography.h2,
    color: theme.colors.text,
    flex: 1,
  },
  editBtn: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editBtnText: {
    fontSize: 18,
  },
  statsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  statChip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  statText: {
    ...theme.typography.small,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  section: {
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  sectionLabel: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: theme.spacing.md,
  },
  settingCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  progressCard: {
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
  },
  settingText: {
    ...theme.typography.body,
    color: theme.colors.text,
    lineHeight: 24,
  },
  charSection: {
    padding: theme.spacing.lg,
  },
  charTitle: {
    ...theme.typography.h3,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  charPlaceholder: {
    ...theme.typography.body,
    color: theme.colors.textMuted,
    fontStyle: 'italic',
  },
  footer: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  chatBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.full,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  chatBtnDisabled: {
    backgroundColor: theme.colors.border,
    shadowOpacity: 0,
    elevation: 0,
  },
  chatBtnText: {
    ...theme.typography.body,
    color: '#fff',
    fontWeight: '700',
  },
});
