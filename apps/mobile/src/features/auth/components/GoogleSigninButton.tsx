import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, View } from 'react-native';
import { theme } from '../../../theme';

interface GoogleSigninButtonProps {
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export function GoogleSigninButton({ onPress, loading = false, disabled = false }: GoogleSigninButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        disabled && styles.buttonDisabled,
        pressed && styles.buttonPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors.primary} size="small" />
      ) : (
        <View style={styles.content}>
          <View style={styles.logoContainer}>
            {/* Vẽ Logo Google mini bằng CSS Grid 2x2 cách điệu */}
            <View style={[styles.logoQuadrant, { backgroundColor: '#EA4335' }]} />
            <View style={[styles.logoQuadrant, { backgroundColor: '#4285F4' }]} />
            <View style={[styles.logoQuadrant, { backgroundColor: '#FBBC05' }]} />
            <View style={[styles.logoQuadrant, { backgroundColor: '#34A853' }]} />
            <View style={styles.logoInnerSquare}>
              <Text style={styles.logoText}>G</Text>
            </View>
          </View>
          <Text style={styles.buttonText}>Đăng nhập với Google</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: '100%',
    height: 52,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: theme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  buttonDisabled: {
    opacity: 0.6,
    backgroundColor: '#F8FAFC',
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
    backgroundColor: '#F8FAFC',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    width: 24,
    height: 24,
    marginRight: theme.spacing.md,
    position: 'relative',
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: 12,
    overflow: 'hidden',
  },
  logoQuadrant: {
    width: 12,
    height: 12,
  },
  logoInnerSquare: {
    position: 'absolute',
    top: 3,
    left: 3,
    width: 18,
    height: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#4285F4',
    lineHeight: 16,
    textAlign: 'center',
  },
  buttonText: {
    ...theme.typography.body,
    fontWeight: '600',
    color: '#1E293B',
  },
});
