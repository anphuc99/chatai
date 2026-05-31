import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { JournalStackParamList } from '../../../navigation/types';
import { useJournalStore } from '../store/journal.store';
import { mapDtoToChatMessage } from '../../chat/store/chat.store';
import { MessageBubble } from '../../chat/components/MessageBubble';
import { theme } from '../../../theme';
import { useStoryStore } from '../../story/store/story.store';

type Route = RouteProp<JournalStackParamList, 'JournalDetail'>;

export function JournalDetailScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation();
  const { sessionId } = route.params;

  const { currentDetail, loading, error, loadDetail } = useJournalStore();
  const [summaryExpanded, setSummaryExpanded] = useState(false);

  useEffect(() => {
    loadDetail(sessionId);
  }, [sessionId]);

  // Cập nhật title header là Story Title nếu load xong và thêm nút Xem truyện
  useEffect(() => {
    if (currentDetail?.storyTitle) {
      navigation.setOptions({
        headerTitle: currentDetail.storyTitle,
        headerRight: () => (
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => {
              useStoryStore.getState().refetchStory(currentDetail.storyId);
              navigation.navigate('Main', {
                screen: 'Stories',
                params: {
                  screen: 'Detail',
                  params: { id: currentDetail.storyId },
                },
              });
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.headerBtnText}>Xem truyện</Text>
          </TouchableOpacity>
        ),
      });
    }
  }, [currentDetail, navigation]);

  if (loading && !currentDetail) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (error && !currentDetail) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>❌ Không thể tải chi tiết phiên nhật ký.</Text>
      </View>
    );
  }

  if (!currentDetail) return null;

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  // Convert MessageDto sang ChatMessage để reuse MessageBubble
  const chatMessages = (currentDetail.messages || []).map((m, i) => mapDtoToChatMessage(m, i));

  // Render header cho FlatList
  const renderHeader = () => (
    <View style={styles.headerContainer}>
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>📝 Thông tin phiên học</Text>
        <Text style={styles.infoRow}>📅 Thời gian: {formatDate(currentDetail.startedAt)} - {formatDate(currentDetail.endedAt)}</Text>
        <Text style={styles.infoRow}>💬 Thống kê: {currentDetail.messageCount} tin nhắn / {currentDetail.wordCount} từ vựng</Text>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>📌 Tóm tắt nội dung</Text>
        <Text style={styles.summaryText} numberOfLines={summaryExpanded ? undefined : 3}>
          {currentDetail.summary || 'Không có tóm tắt.'}
        </Text>
        {currentDetail.summary && currentDetail.summary.length > 120 && (
          <TouchableOpacity
            style={styles.expandBtn}
            onPress={() => setSummaryExpanded(!summaryExpanded)}
            activeOpacity={0.7}
          >
            <Text style={styles.expandBtnText}>
              {summaryExpanded ? 'Thu gọn ▲' : 'Xem thêm ▼'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.divider}>
        <Text style={styles.dividerText}>HỘI THOẠI ĐÃ LƯU</Text>
        <View style={styles.dividerLine} />
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={chatMessages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <MessageBubble msg={item} />}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    ...theme.typography.body,
    color: theme.colors.error,
  },
  listContent: {
    paddingBottom: theme.spacing.xl,
  },
  headerContainer: {
    padding: theme.spacing.md,
  },
  infoCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.md,
  },
  infoTitle: {
    ...theme.typography.body,
    fontWeight: '700',
    color: theme.colors.primary,
    marginBottom: theme.spacing.xs,
  },
  infoRow: {
    ...theme.typography.small,
    color: theme.colors.text,
    lineHeight: 18,
    marginBottom: 2,
  },
  summaryCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: theme.spacing.lg,
  },
  summaryTitle: {
    ...theme.typography.body,
    fontWeight: '700',
    color: theme.colors.warning,
    marginBottom: theme.spacing.xs,
  },
  summaryText: {
    ...theme.typography.body,
    fontSize: 13,
    color: theme.colors.text,
    lineHeight: 20,
  },
  expandBtn: {
    alignSelf: 'flex-end',
    marginTop: theme.spacing.xs,
  },
  expandBtnText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: theme.spacing.sm,
  },
  dividerText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textMuted,
    letterSpacing: 1,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.border,
  },
  headerBtn: {
    marginRight: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
  },
  headerBtnText: {
    ...theme.typography.small,
    color: '#fff',
    fontWeight: '700',
  },
});
