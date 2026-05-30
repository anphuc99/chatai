import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StoryStackParamList } from './types';
import { StoryListScreen } from '../features/story/screens/StoryListScreen';
import { StoryCreateScreen } from '../features/story/screens/StoryCreateScreen';
import { StoryDetailScreen } from '../features/story/screens/StoryDetailScreen';
import { CharacterEditorScreen } from '../features/character/screens/CharacterEditorScreen';
import { theme } from '../theme';

const Stack = createNativeStackNavigator<StoryStackParamList>();

export function StoryStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.colors.background,
        },
        headerTintColor: theme.colors.primary,
        headerTitleStyle: {
          ...theme.typography.h3,
          color: theme.colors.text,
        },
        headerShadowVisible: false,
        contentStyle: {
          backgroundColor: theme.colors.background,
        },
      }}
    >
      <Stack.Screen
        name="List"
        component={StoryListScreen}
        options={{ title: 'Truyện AI', headerShown: false }}
      />
      <Stack.Screen
        name="Create"
        component={StoryCreateScreen}
        options={({ route }) => ({
          title: route.params?.mode === 'edit' ? 'Chỉnh sửa Story' : 'Tạo Story mới',
        })}
      />
      <Stack.Screen
        name="Detail"
        component={StoryDetailScreen}
        options={{ title: 'Chi tiết Story' }}
      />
      <Stack.Screen
        name="CharacterEditor"
        component={CharacterEditorScreen}
        options={({ route }) => ({
          title: route.params?.characterId ? 'Chỉnh sửa nhân vật' : 'Tạo nhân vật mới',
        })}
      />
    </Stack.Navigator>
  );
}
