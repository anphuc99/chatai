import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { emojiFor } from '../utils/emotion-emoji';

interface EmotionIconProps {
  emotion?: string | null;
  size?: number;
}

export function EmotionIcon({ emotion, size }: EmotionIconProps) {
  return (
    <Text style={[styles.text, { fontSize: size ?? 16 }]}>
      {emojiFor(emotion)}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    marginLeft: 4,
  },
});
