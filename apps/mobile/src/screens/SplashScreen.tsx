import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { theme } from '../theme';

export function SplashScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <View style={styles.logoOuter}>
          <View style={styles.logoInner}>
            <Text style={styles.logoSymbol}>文</Text>
          </View>
        </View>
        <Text style={styles.appName}>ChatAI</Text>
        <Text style={styles.tagline}>Học Tiếng Trung qua hội thoại AI</Text>
      </View>
      <ActivityIndicator size="large" color={theme.colors.primary} style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  logoContainer: {
    alignItems: 'center',
  },
  logoOuter: {
    width: 100,
    height: 100,
    borderRadius: 40,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  logoInner: {
    width: 76,
    height: 76,
    borderRadius: 28,
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
    fontSize: 38,
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
  },
  spinner: {
    marginTop: theme.spacing.xxl,
  },
});
