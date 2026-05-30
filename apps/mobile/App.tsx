import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { RootNavigator } from './src/navigation/RootNavigator';
import { authService } from './src/features/auth/services/auth.service';
import { useAuthStore } from './src/stores/auth.store';

export default function App() {
  useEffect(() => {
    // Cấu hình Google Sign-in khi khởi động
    authService.configure();
    
    // Khôi phục session người dùng từ secure storage
    useAuthStore.getState().hydrate();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <RootNavigator />
    </SafeAreaProvider>
  );
}
