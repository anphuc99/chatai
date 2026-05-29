import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { PlaceholderHomeScreen } from '../screens/PlaceholderHomeScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="PlaceholderHome">
        <Stack.Screen
          name="PlaceholderHome"
          component={PlaceholderHomeScreen}
          options={{ title: 'ChatAI' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
