import React, { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { theme } from '../../../theme';

interface TranslationSlideProps {
  translation?: string | null;
  visible: boolean;
}

export function TranslationSlide({ translation, visible }: TranslationSlideProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, { duration: 250 });
  }, [visible]);

  const animStyle = useAnimatedStyle(() => {
    return {
      opacity: progress.value,
      maxHeight: interpolate(progress.value, [0, 1], [0, 200]), // Chiều cao tối đa ước lượng cho bản dịch
      overflow: 'hidden',
      marginTop: interpolate(progress.value, [0, 1], [0, 8]),
      paddingTop: interpolate(progress.value, [0, 1], [0, 8]),
      borderTopWidth: interpolate(progress.value, [0, 1], [0, 1]),
    };
  });

  if (!translation) return null;

  return (
    <Animated.View style={[styles.container, animStyle]}>
      <Text style={styles.translationText}>{translation}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopColor: theme.colors.border,
  },
  translationText: {
    ...theme.typography.caption,
    color: theme.colors.text,
    fontStyle: 'italic',
    lineHeight: 20,
  },
});
