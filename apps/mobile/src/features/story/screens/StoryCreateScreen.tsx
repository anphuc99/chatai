import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StoryStackParamList } from '../../../navigation/types';
import { StoryForm } from '../components/StoryForm';
import { useStories } from '../hooks/useStories';
import { CreateStoryInput } from '../services/story.schemas';
import { theme } from '../../../theme';

type Nav = NativeStackNavigationProp<StoryStackParamList>;
type Route = RouteProp<StoryStackParamList, 'Create'>;

export function StoryCreateScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const params = route.params;

  const { create, update } = useStories();
  const [submitting, setSubmitting] = useState(false);

  const isEdit = params.mode === 'edit';
  const initial = isEdit
    ? { title: params.title, initialSetting: params.initialSetting }
    : undefined;

  const handleSubmit = async (values: CreateStoryInput) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (isEdit) {
        await update(params.id, values);
        navigation.goBack();
      } else {
        const newStory = await create(values);
        navigation.replace('Detail', { id: newStory.id });
      }
    } catch (error: any) {
      Alert.alert(
        'Lỗi',
        error?.message ?? 'Không thể lưu Story. Vui lòng thử lại.',
        [{ text: 'OK' }],
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <StoryForm
        initial={initial}
        onSubmit={handleSubmit}
        submitting={submitting}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
});
