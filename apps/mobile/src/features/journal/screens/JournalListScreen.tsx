import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { JournalStackParamList } from '../../../navigation/types';
import { useJournalStore } from '../store/journal.store';
import { SessionCard } from '../components/SessionCard';
import { theme } from '../../../theme';

type NavigationProp = NativeStackNavigationProp<JournalStackParamList, 'JournalList'>;

export function JournalListScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { items, loading, error, loadFirstPage, loadMore, reset } = useJournalStore();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadFirstPage();
    return () => reset();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadFirstPage();
    } catch (e) {
      console.warn('Failed to refresh journal list:', e);
    } finally {
      setRefreshing(false);
    }
  };

  const handleLoadMore = () => {
    loadMore();
  };

  if (loading && items.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <SessionCard
            item={item}
            onPress={() => navigation.navigate('JournalDetail', { sessionId: item.id })}
          />
        )}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.2}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[theme.colors.primary]} />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>📝</Text>
              <Text style={styles.emptyText}>Chưa có phiên hội thoại nào kết thúc.</Text>
            </View>
          ) : null
        }
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
  listContent: {
    paddingVertical: theme.spacing.md,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xxl,
    marginTop: 100,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: theme.spacing.md,
  },
  emptyText: {
    ...theme.typography.body,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
});
