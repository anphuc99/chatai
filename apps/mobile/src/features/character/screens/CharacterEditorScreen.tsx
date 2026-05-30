import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { StoryStackParamList } from '../../../navigation/types';
import { useCharacters } from '../hooks/useCharacters';
import { createCharacterSchema, CreateCharacterInput } from '../services/character.schemas';
import { VoiceSelector } from '../components/VoiceSelector';
import { PitchSlider } from '../components/PitchSlider';
import { AvatarPicker } from '../../profile/components/AvatarPicker';
import { avatarService } from '../../profile/services/avatar.service';
import { VoiceName } from '@chatai/shared-types';
import { theme } from '../../../theme';
import { ttsClientService } from '../services/tts.service';

type Nav = NativeStackNavigationProp<StoryStackParamList, 'CharacterEditor'>;
type Route = RouteProp<StoryStackParamList, 'CharacterEditor'>;

export function CharacterEditorScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { storyId, characterId } = route.params;

  const { charactersByStory, create, update, uploadAvatar } = useCharacters();
  
  const mode = characterId ? 'edit' : 'create';
  const character = characterId
    ? charactersByStory(storyId).find((c) => c.id === characterId)
    : undefined;

  const [submitting, setSubmitting] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [localAvatarUri, setLocalAvatarUri] = useState<string | null>(character?.avatarUrl ?? null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors, isValid },
  } = useForm<CreateCharacterInput>({
    resolver: zodResolver(createCharacterSchema),
    defaultValues: {
      name: character?.name ?? '',
      age: character?.age !== null ? character?.age : undefined,
      personality: character?.personality ?? '',
      voiceName: (character?.voiceName as VoiceName) ?? 'Achernar',
      pitch: character?.pitch ?? 1.0,
    },
    mode: 'onChange',
  });

  const formVoiceName = watch('voiceName');
  const formPitch = watch('pitch');

  // Dọn dẹp âm thanh khi đóng màn hình
  useEffect(() => {
    return () => {
      ttsClientService.stop().catch(() => {});
    };
  }, []);

  const handlePickAvatar = async () => {
    try {
      const picked = await avatarService.pickImage();
      if (!picked) return;

      if (mode === 'edit' && characterId) {
        setAvatarUploading(true);
        try {
          const newUrl = await uploadAvatar(characterId, picked.uri);
          setLocalAvatarUri(newUrl);
          Alert.alert('Thành công', 'Đã cập nhật ảnh đại diện nhân vật');
        } catch (err: any) {
          Alert.alert('Lỗi', err.message || 'Không thể upload ảnh đại diện');
        } finally {
          setAvatarUploading(false);
        }
      } else {
        setLocalAvatarUri(picked.uri);
      }
    } catch (err: any) {
      Alert.alert('Lỗi', err.message || 'Không thể chọn ảnh');
    }
  };

  const handlePreviewVoice = async () => {
    if (previewLoading) return;
    if (!formVoiceName) {
      Alert.alert('Thông báo', 'Vui lòng chọn giọng nói trước');
      return;
    }
    setPreviewLoading(true);
    try {
      const url = await ttsClientService.testVoice(formVoiceName, formPitch ?? 1.0);
      await ttsClientService.playUrl(url);
    } catch (err: any) {
      if (err.code === 'TTS_ENGINE_DOWN') {
        Alert.alert('Thông báo', 'Hệ thống TTS đang bảo trì');
      } else if (err.code === 'RATE_LIMIT') {
        Alert.alert('Thông báo', 'Quá nhiều yêu cầu, thử lại sau');
      } else {
        Alert.alert('Thông báo', err.message || 'Không phát được giọng đọc');
      }
    } finally {
      setPreviewLoading(false);
    }
  };

  const onSubmit = async (values: CreateCharacterInput) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (mode === 'edit' && characterId) {
        await update(characterId, values);
        Alert.alert('Thành công', 'Đã cập nhật thông tin nhân vật');
        navigation.goBack();
      } else {
        const newChar = await create(storyId, values);
        if (localAvatarUri) {
          setAvatarUploading(true);
          try {
            await uploadAvatar(newChar.id, localAvatarUri);
          } catch (err: any) {
            Alert.alert(
              'Nhân vật đã tạo',
              'Đã tạo nhân vật nhưng không thể upload ảnh đại diện: ' + (err.message || 'Lỗi mạng')
            );
          } finally {
            setAvatarUploading(false);
          }
        }
        Alert.alert('Thành công', 'Đã tạo nhân vật mới');
        navigation.goBack();
      }
    } catch (err: any) {
      Alert.alert('Lỗi', err.message || 'Không thể lưu nhân vật');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar Picker */}
        <View style={styles.avatarSection}>
          <AvatarPicker
            photoURL={localAvatarUri}
            loading={avatarUploading}
            onPress={handlePickAvatar}
          />
          <Text style={styles.avatarHint}>Chọn ảnh đại diện nhân vật</Text>
        </View>

        {/* Tên nhân vật */}
        <View style={styles.field}>
          <Text style={styles.label}>Tên nhân vật *</Text>
          <Controller
            control={control}
            name="name"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={[styles.input, errors.name && styles.inputError]}
                placeholder="Nhập tên nhân vật..."
                placeholderTextColor={theme.colors.textMuted}
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                maxLength={50}
              />
            )}
          />
          {errors.name && <Text style={styles.errorText}>{errors.name.message}</Text>}
        </View>

        {/* Tuổi nhân vật */}
        <View style={styles.field}>
          <Text style={styles.label}>Tuổi (Tùy chọn)</Text>
          <Controller
            control={control}
            name="age"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={[styles.input, errors.age && styles.inputError]}
                placeholder="Nhập tuổi nhân vật..."
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="numeric"
                onBlur={onBlur}
                onChangeText={(text) => {
                  if (text === '') {
                    onChange(undefined);
                  } else {
                    const num = parseInt(text, 10);
                    onChange(isNaN(num) ? undefined : num);
                  }
                }}
                value={value !== undefined && value !== null && !isNaN(value) ? String(value) : ''}
              />
            )}
          />
          {errors.age && <Text style={styles.errorText}>{errors.age.message}</Text>}
        </View>

        {/* Tính cách / Cá tính */}
        <View style={styles.field}>
          <Text style={styles.label}>Cá tính / Cốt truyện nhân vật *</Text>
          <Controller
            control={control}
            name="personality"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={[styles.input, styles.textarea, errors.personality && styles.inputError]}
                placeholder="Mô tả cá tính, giọng điệu, cách nói chuyện hoặc tiểu sử của nhân vật..."
                placeholderTextColor={theme.colors.textMuted}
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                maxLength={3000}
              />
            )}
          />
          {errors.personality && <Text style={styles.errorText}>{errors.personality.message}</Text>}
        </View>

        {/* Giọng nói Selector */}
        <Controller
          control={control}
          name="voiceName"
          render={({ field: { onChange, value } }) => (
            <VoiceSelector value={value} onChange={onChange} />
          )}
        />

        {/* Pitch Slider */}
        <Controller
          control={control}
          name="pitch"
          render={({ field: { onChange, value } }) => (
            <PitchSlider value={value} onChange={onChange} />
          )}
        />

        {/* Nút nghe thử */}
        <TouchableOpacity
          style={[
            styles.previewBtn,
            (!formVoiceName || formPitch === undefined || previewLoading) && styles.previewBtnDisabled,
          ]}
          onPress={handlePreviewVoice}
          disabled={!formVoiceName || formPitch === undefined || previewLoading}
          activeOpacity={0.7}
        >
          {previewLoading ? (
            <View style={styles.previewBtnContent}>
              <ActivityIndicator size="small" color={theme.colors.textMuted} style={{ marginRight: 8 }} />
              <Text style={styles.previewBtnText}>Đang chuẩn bị giọng đọc...</Text>
            </View>
          ) : (
            <Text style={styles.previewBtnText}>🔊 Nghe thử giọng nói</Text>
          )}
        </TouchableOpacity>

        {/* Nút Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, (!isValid || submitting) && styles.submitBtnDisabled]}
          onPress={handleSubmit(onSubmit)}
          disabled={!isValid || submitting}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.submitText}>
              {mode === 'edit' ? 'Lưu thay đổi' : 'Tạo nhân vật'}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  avatarHint: {
    ...theme.typography.small,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.xs,
    fontWeight: '500',
  },
  field: {
    marginBottom: theme.spacing.md,
  },
  label: {
    ...theme.typography.caption,
    color: theme.colors.text,
    fontWeight: '600',
    marginBottom: theme.spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    ...theme.typography.body,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },
  textarea: {
    minHeight: 100,
    paddingTop: theme.spacing.md,
  },
  inputError: {
    borderColor: theme.colors.error,
  },
  errorText: {
    ...theme.typography.small,
    color: theme.colors.error,
    marginTop: theme.spacing.xs,
  },
  previewBtn: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
  },
  previewBtnDisabled: {
    opacity: 0.5,
  },
  previewBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBtnText: {
    ...theme.typography.body,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  submitBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitText: {
    ...theme.typography.body,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
