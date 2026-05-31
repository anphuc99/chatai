import React, { useMemo } from 'react';
import { Text, StyleSheet } from 'react-native';
import { toPinyin } from '../utils/pinyin';
import { theme } from '../../../theme';

interface PinyinRowProps {
  text: string;
}

export function PinyinRow({ text }: PinyinRowProps) {
  const py = useMemo(() => toPinyin(text), [text]);

  return <Text style={styles.pinyin}>{py}</Text>;
}

const styles = StyleSheet.create({
  pinyin: {
    fontSize: 13,
    color: theme.colors.textMuted,
    fontStyle: 'italic',
    marginTop: 4,
    lineHeight: 18,
  },
});
