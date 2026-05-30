import React from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, Pressable, ActivityIndicator } from 'react-native';
import { useProfile } from '../hooks/useProfile';
import { AvatarPicker } from '../components/AvatarPicker';
import { PreferenceRow } from '../components/PreferenceRow';
import { HskLevelSelector } from '../components/HskLevelSelector';
import { theme } from '../../../theme';
import { NarratorLanguage } from '@chatai/shared-types';

const LANGUAGES: { code: NarratorLanguage; label: string }[] = [
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'en', label: 'Tiếng Anh' },
  { code: 'zh', label: 'Tiếng Trung' },
];

const SPEEDS = [
  { value: 0.75, label: '0.75x' },
  { value: 1.0, label: '1.0x' },
  { value: 1.25, label: '1.25x' },
];

export function ProfileScreen() {
  const { user, loading, updatePref, pickAndUploadAvatar, signOut } = useProfile();

  if (!user) {
    return (
      <View style={styles.loadingCenter}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* 1. Profile Header */}
      <View style={styles.card}>
        <AvatarPicker
          photoURL={user.photoURL}
          loading={loading}
          onPress={pickAndUploadAvatar}
        />
        <Text style={styles.displayName}>{user.displayName || 'Học viên ChatAI'}</Text>
        <Text style={styles.email}>{user.email}</Text>

        {/* Learning Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statEmoji}>🔥</Text>
            <Text style={styles.statValue}>{user.currentStreak}</Text>
            <Text style={styles.statLabel}>Streak hiện tại</Text>
          </View>
          <View style={[styles.statBox, styles.statBoxDivider]}>
            <Text style={styles.statEmoji}>🏆</Text>
            <Text style={styles.statValue}>{user.highestStreak}</Text>
            <Text style={styles.statLabel}>Kỷ lục Streak</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statEmoji}>💎</Text>
            <Text style={styles.statValue}>{user.gems}</Text>
            <Text style={styles.statLabel}>Gems tích luỹ</Text>
          </View>
        </View>
      </View>

      {/* 2. Section: Cài đặt học tập */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Cài đặt học tập</Text>
      </View>
      
      <View style={styles.card}>
        {/* HSK Selector */}
        <PreferenceRow
          label="Cấp độ HSK hiện tại"
          description="Cá nhân hóa nội dung học tập và hội thoại AI."
        >
          <HskLevelSelector
            value={user.hskLevel}
            onChange={(val) => updatePref('hskLevel', val)}
          />
        </PreferenceRow>

        {/* Show Pinyin Switch */}
        <PreferenceRow
          label="Hiển thị phiên âm (Pinyin)"
          description="Hiển thị Pinyin phía trên các từ tiếng Trung."
        >
          <Switch
            value={user.preferences?.showPinyin ?? true}
            onValueChange={(val) => updatePref('showPinyin', val)}
            trackColor={{ false: theme.colors.border, true: 'rgba(99, 102, 241, 0.4)' }}
            thumbColor={user.preferences?.showPinyin ?? true ? theme.colors.primary : '#FFFFFF'}
          />
        </PreferenceRow>

        {/* Subtitle Language Segmented Control */}
        <PreferenceRow
          label="Ngôn ngữ phụ đề dịch"
          description="Ngôn ngữ dịch nghĩa của phụ đề hội thoại."
        >
          <View style={styles.segmentedContainer}>
            {LANGUAGES.map((lang) => {
              const isActive = user.preferences?.narratorLanguage === lang.code;
              return (
                <Pressable
                  key={lang.code}
                  onPress={() => updatePref('narratorLanguage', lang.code)}
                  style={[
                    styles.segmentButton,
                    isActive ? styles.segmentButtonActive : styles.segmentButtonInactive,
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      isActive ? styles.segmentTextActive : styles.segmentTextInactive,
                    ]}
                  >
                    {lang.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </PreferenceRow>

        {/* TTS Speed Segmented Control */}
        <PreferenceRow
          label="Tốc độ đọc (Giọng AI)"
          description="Tốc độ phát âm của trợ lý AI."
        >
          <View style={styles.segmentedContainer}>
            {SPEEDS.map((speed) => {
              const isActive = Math.abs((user.preferences?.ttsSpeed ?? 1.0) - speed.value) < 0.05;
              return (
                <Pressable
                  key={speed.value}
                  onPress={() => updatePref('ttsSpeed', speed.value)}
                  style={[
                    styles.segmentButton,
                    isActive ? styles.segmentButtonActive : styles.segmentButtonInactive,
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      isActive ? styles.segmentTextActive : styles.segmentTextInactive,
                    ]}
                  >
                    {speed.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </PreferenceRow>
      </View>

      {/* 3. Section: Tài khoản */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Tài khoản</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.accountRow}>
          <View style={styles.accountDetails}>
            <Text style={styles.accountText}>Đóng băng Streak</Text>
            <Text style={styles.accountSubText}>
              Số lượt bảo vệ Streak hiện có: {user.streakFreezeCount} lượt
            </Text>
          </View>
          <Text style={styles.freezeIcon}>❄️</Text>
        </View>
      </View>

      <Pressable
        onPress={signOut}
        style={({ pressed }) => [
          styles.logoutButton,
          pressed && styles.logoutButtonPressed,
        ]}
      >
        <Text style={styles.logoutText}>Đăng xuất</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  contentContainer: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.xxl * 1.5,
  },
  loadingCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: theme.radius.lg,
    padding: theme.spacing.xl,
    marginBottom: theme.spacing.xl,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  displayName: {
    ...theme.typography.h2,
    color: theme.colors.text,
    textAlign: 'center',
    marginTop: theme.spacing.md,
    fontWeight: '700',
  },
  email: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.xl,
    paddingTop: theme.spacing.xl,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statBoxDivider: {
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.border,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
  },
  statEmoji: {
    fontSize: 20,
    marginBottom: theme.spacing.xs,
  },
  statValue: {
    ...theme.typography.h3,
    color: theme.colors.text,
    fontWeight: '800',
  },
  statLabel: {
    ...theme.typography.small,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  sectionHeader: {
    paddingHorizontal: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  sectionTitle: {
    ...theme.typography.caption,
    fontWeight: '700',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  segmentedContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: theme.radius.md,
    padding: 3,
  },
  segmentButton: {
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.sm + 2,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 70,
  },
  segmentButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentButtonInactive: {
    backgroundColor: 'transparent',
  },
  segmentText: {
    ...theme.typography.small,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: theme.colors.primary,
  },
  segmentTextInactive: {
    color: theme.colors.textMuted,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  accountDetails: {
    flex: 1,
  },
  accountText: {
    ...theme.typography.body,
    fontWeight: '600',
    color: theme.colors.text,
  },
  accountSubText: {
    ...theme.typography.small,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  freezeIcon: {
    fontSize: 22,
  },
  logoutButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: theme.radius.md,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  logoutButtonPressed: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    transform: [{ scale: 0.98 }],
  },
  logoutText: {
    ...theme.typography.body,
    color: theme.colors.error,
    fontWeight: '700',
  },
});
