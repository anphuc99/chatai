import React from 'react';
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
} from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createStorySchema, CreateStoryInput } from '../services/story.schemas';
import { theme } from '../../../theme';

interface StoryFormProps {
  initial?: { title: string; initialSetting: string };
  onSubmit: (values: CreateStoryInput) => Promise<void>;
  submitting: boolean;
}

export function StoryForm({ initial, onSubmit, submitting }: StoryFormProps) {
  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<CreateStoryInput>({
    resolver: zodResolver(createStorySchema),
    defaultValues: {
      title: initial?.title ?? '',
      initialSetting: initial?.initialSetting ?? '',
    },
    mode: 'onChange',
  });

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Title */}
        <View style={styles.field}>
          <Text style={styles.label}>Tiêu đề *</Text>
          <Controller
            control={control}
            name="title"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={[styles.input, errors.title && styles.inputError]}
                placeholder="Nhập tiêu đề câu chuyện..."
                placeholderTextColor={theme.colors.textMuted}
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                maxLength={100}
                returnKeyType="next"
              />
            )}
          />
          {errors.title && (
            <Text style={styles.errorText}>{errors.title.message}</Text>
          )}
        </View>

        {/* Initial Setting */}
        <View style={styles.field}>
          <Text style={styles.label}>Bối cảnh ban đầu *</Text>
          <Controller
            control={control}
            name="initialSetting"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={[styles.input, styles.textarea, errors.initialSetting && styles.inputError]}
                placeholder="Mô tả bối cảnh câu chuyện của bạn..."
                placeholderTextColor={theme.colors.textMuted}
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
                maxLength={5000}
              />
            )}
          />
          {errors.initialSetting && (
            <Text style={styles.errorText}>{errors.initialSetting.message}</Text>
          )}
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[
            styles.submitBtn,
            (!isValid || submitting) && styles.submitBtnDisabled,
          ]}
          onPress={handleSubmit(onSubmit)}
          disabled={!isValid || submitting}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.submitText}>
              {initial ? 'Lưu thay đổi' : 'Tạo Story'}
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
  field: {
    marginBottom: theme.spacing.lg,
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
    minHeight: 140,
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
  submitBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.md,
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
    color: '#fff',
    fontWeight: '700',
  },
});
