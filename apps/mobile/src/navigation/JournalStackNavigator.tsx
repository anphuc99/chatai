import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { JournalStackParamList } from './types';
import { JournalListScreen } from '../features/journal/screens/JournalListScreen';
import { JournalDetailScreen } from '../features/journal/screens/JournalDetailScreen';
import { theme } from '../theme';

const Stack = createNativeStackNavigator<JournalStackParamList>();

export function JournalStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.colors.background,
        },
        headerShadowVisible: false,
        headerTitleStyle: {
          ...theme.typography.h3,
          color: theme.colors.text,
        },
        headerTintColor: theme.colors.primary,
        headerTitleAlign: 'center',
      }}
    >
      <Stack.Screen
        name="JournalList"
        component={JournalListScreen}
        options={{ title: 'Nhật ký học tập' }}
      />
      <Stack.Screen
        name="JournalDetail"
        component={JournalDetailScreen}
        options={{ title: 'Chi tiết phiên' }}
      />
    </Stack.Navigator>
  );
}
