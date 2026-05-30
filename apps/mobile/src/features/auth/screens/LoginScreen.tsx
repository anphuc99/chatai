import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useAuthStore } from '../../../stores/auth.store';
import { GoogleSigninButton } from '../components/GoogleSigninButton';
import { theme } from '../../../theme';

export function LoginScreen() {
  const { login, bypassLoginDev, isLoading } = useAuthStore();
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setError(null);
    try {
      await login();
    } catch (e: any) {
      if (e.code === 'SIGN_IN_CANCELLED') {
        return; // Hủy đăng nhập thì im lặng
      }
      setError(e.message || 'Đăng nhập với Google thất bại');
      console.error('[Login] Google sign in error:', e);
    }
  };

  const handleBypassLogin = async () => {
    setError(null);
    try {
      await bypassLoginDev();
    } catch (e: any) {
      setError(e.message || 'Bypass đăng nhập thất bại');
      console.error('[Login] Bypass login error:', e);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.logoSection}>
        {/* App Logo cách điệu hình biểu tượng Học thuật và Công nghệ */}
        <View style={styles.logoOuter}>
          <View style={styles.logoInner}>
            <Text style={styles.logoSymbol}>文</Text>
          </View>
        </View>
        <Text style={styles.appName}>ChatAI</Text>
        <Text style={styles.tagline}>Học Tiếng Trung qua hội thoại AI sinh động</Text>
      </View>

      <View style={styles.actionSection}>
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <GoogleSigninButton loading={isLoading} onPress={handleGoogleLogin} />

        {__DEV__ && (
          <Pressable
            onPress={handleBypassLogin}
            disabled={isLoading}
            style={({ pressed }) => [
              styles.bypassButton,
              pressed && styles.bypassButtonPressed,
            ]}
          >
            {isLoading ? (
              <ActivityIndicator color={theme.colors.primary} size="small" />
            ) : (
              <Text style={styles.bypassText}>⚡ Bypass Login (Dev Mode)</Text>
            )}
          </Pressable>
        )}
      </View>

      <Text style={styles.footerText}>
        Bằng cách đăng nhập, bạn đồng ý với Điều khoản dịch vụ và Chính sách bảo mật của chúng tôi.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.spacing.xl,
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.xxl * 1.5,
  },
  logoSection: {
    alignItems: 'center',
    marginTop: theme.spacing.xxl,
  },
  logoOuter: {
    width: 90,
    height: 90,
    borderRadius: 36,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  logoInner: {
    width: 68,
    height: 68,
    borderRadius: 24,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  logoSymbol: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  appName: {
    ...theme.typography.h1,
    color: theme.colors.text,
    letterSpacing: 0.5,
    marginBottom: theme.spacing.xs,
  },
  tagline: {
    ...theme.typography.body,
    color: theme.colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  actionSection: {
    width: '100%',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  errorContainer: {
    width: '100%',
    padding: theme.spacing.md,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    marginBottom: theme.spacing.sm,
  },
  errorText: {
    ...theme.typography.small,
    color: theme.colors.error,
    textAlign: 'center',
    fontWeight: '500',
  },
  bypassButton: {
    marginTop: theme.spacing.sm,
    width: '100%',
    height: 52,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: theme.colors.primary,
    backgroundColor: 'rgba(99, 102, 241, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bypassButtonPressed: {
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    transform: [{ scale: 0.98 }],
  },
  bypassText: {
    ...theme.typography.body,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  footerText: {
    ...theme.typography.small,
    color: theme.colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.md,
    lineHeight: 18,
  },
});
