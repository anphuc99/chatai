import React, { useEffect, useState, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StoryStackParamList } from '../../../navigation/types';
import { useChat } from '../hooks/useChat';
import { useStoryStore } from '../../story/store/story.store';
import { MessageBubble } from '../components/MessageBubble';
import { InputBar } from '../components/InputBar';
import { OocPanel } from '../components/OocPanel';
import { CharacterToggleSheet } from '../components/CharacterToggleSheet';
import { theme } from '../../../theme';
import { characterApi } from '../../character/services/character.api';
import {
  PlaybackQueueManager,
  setPlaybackManagerSingleton,
  getPlaybackManagerSingleton,
} from '../services/playback-queue.manager';
import { useChatStore } from '../store/chat.store';

type Route = RouteProp<StoryStackParamList, 'ChatRoom'>;

export function ChatRoomScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation();
  const { storyId } = route.params;

  // Lấy cached story để có title hiển thị nhanh
  const story = useStoryStore((s) => s.storiesById[storyId]);

  const {
    messages,
    activeCharacters,
    persistentOOC,
    inputLocked,
    loading,
    error,
    startSession,
    loadHistory,
    sendMessage,
    setPersistentOOC,
    toggleCharacter,
    addTempCharacter,
    reset,
  } = useChat();

  const [showOocPanel, setShowOocPanel] = useState(false);
  const [showCharToggle, setShowCharToggle] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Cấu hình header navigation bar
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: story?.title || 'Phòng Chat',
      headerRight: () => (
        <View style={styles.headerRightContainer}>
          <TouchableOpacity
            onPress={() => setShowCharToggle(true)}
            style={styles.headerBtn}
            activeOpacity={0.7}
          >
            <Text style={styles.headerBtnText}>👥</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowOocPanel(true)}
            style={styles.headerBtn}
            activeOpacity={0.7}
          >
            <Text style={styles.headerBtnText}>⚙️</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, story, setShowCharToggle, setShowOocPanel]);

  // Khởi động session và load history
  useEffect(() => {
    let active = true;

    async function init() {
      try {
        await startSession(storyId);
        
        // Tải danh sách nhân vật để cấu hình PlaybackQueueManager
        const { loadStoryCharacters } = useChatStore.getState();
        await loadStoryCharacters();
        const characters = useChatStore.getState().charactersFull;
        const charMap = new Map(
          (characters || []).map((c) => [
            c.id,
            { voiceName: c.voiceName, pitch: c.pitch },
          ])
        );

        if (active) {
          const mgr = new PlaybackQueueManager({
            onBubbleShow: (msg) => useChatStore.getState().appendAssistantBubble(msg),
            onQueueFinished: () => useChatStore.getState().setInputLocked(false),
            onError: (e) => console.warn('[PlaybackQueueManager]', e),
            charactersVoice: charMap,
          });
          setPlaybackManagerSingleton(mgr);

          await loadHistory();
        }
      } catch (e: any) {
        if (active) {
          Alert.alert('Lỗi khởi tạo', e?.message || 'Không thể mở phòng chat.');
        }
      } finally {
        if (active) {
          setInitialLoading(false);
        }
      }
    }

    init();

    return () => {
      active = false;
      const mgr = getPlaybackManagerSingleton();
      if (mgr) {
        mgr.stop();
        setPlaybackManagerSingleton(null);
      }
      reset(); // Reset store state khi đóng màn hình
    };
  }, [storyId]);

  const handleSend = async (text: string, ephemeralOOC?: string) => {
    try {
      if (text === '' && ephemeralOOC) {
        // Gửi OOC inline
        const { pushEphemeralOOC } = useChatStore.getState();
        await pushEphemeralOOC(ephemeralOOC);
      } else {
        // Gửi tin nhắn thường
        await sendMessage(text, ephemeralOOC);
      }
    } catch (e: any) {
      if (e?.code === 'SESSION_LOCKED') {
        Alert.alert('Thất bại', 'Đang xử lý tin trước, vui lòng đợi một lát nhé.');
      } else if (e?.code === 'LLM_UNAVAILABLE' || e?.code === 'LLM_TIMEOUT') {
        Alert.alert('Thất bại', 'AI đang bận, vui lòng thử lại sau.');
      } else {
        Alert.alert('Lỗi', e?.message || 'Không thể gửi tin nhắn.');
      }
    }
  };

  // Đảo ngược danh sách tin nhắn để hiển thị inverted FlatList
  const invertedMessages = [...messages].reverse();

  if (initialLoading && loading && messages.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Đang kết nối phòng chat...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Banner báo lỗi nếu có */}
      {error && messages.length === 0 ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>
            ⚠️ Kết nối bị gián đoạn: {error?.message || 'Lỗi không xác định'}
          </Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={loadHistory}
            activeOpacity={0.7}
          >
            <Text style={styles.retryText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Danh sách tin nhắn */}
      <FlatList
        data={invertedMessages}
        inverted
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <MessageBubble msg={item} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={true}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>👋</Text>
              <Text style={styles.emptyText}>
                Hãy bắt đầu cuộc hội thoại bằng tiếng Trung!
              </Text>
            </View>
          ) : null
        }
      />

      {/* Thanh nhập liệu */}
      <InputBar onSend={handleSend} disabled={inputLocked} />

      {/* Modal chỉnh sửa OOC & nhân vật tạm thời */}
      <OocPanel
        visible={showOocPanel}
        onClose={() => setShowOocPanel(false)}
      />

      {/* Sheet toggle trạng thái nhân vật trong cốt truyện */}
      <CharacterToggleSheet
        visible={showCharToggle}
        onClose={() => setShowCharToggle(false)}
        storyId={storyId}
        activeCharacters={activeCharacters}
        onToggleCharacter={toggleCharacter}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: theme.spacing.xl,
  },
  loadingText: {
    ...theme.typography.body,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.md,
  },
  headerRightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerBtn: {
    padding: 4,
  },
  headerBtnText: {
    fontSize: 22,
  },
  listContent: {
    paddingVertical: theme.spacing.md,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xxl,
    transform: [{ scaleY: -1 }], // Vì list inverted nên empty view cũng bị lật ngược, cần lật lại
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
    lineHeight: 22,
  },
  errorBanner: {
    backgroundColor: '#FEE2E2',
    padding: theme.spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#FCA5A5',
  },
  errorText: {
    fontSize: 13,
    color: theme.colors.error,
    flex: 1,
    marginRight: theme.spacing.md,
  },
  retryBtn: {
    backgroundColor: theme.colors.error,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    borderRadius: theme.radius.sm,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
