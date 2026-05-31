import React, { useMemo } from 'react';
import { Text, StyleSheet, TextStyle } from 'react-native';
import { Word } from '../types/message';
import { splitTextByWords } from '../utils/split-words';
import { theme } from '../../../theme';

interface TappableChineseTextProps {
  text: string;
  words?: Word[] | null;
  onWordTap: (w: Word) => void;
  baseStyle?: TextStyle;
}

export function TappableChineseText({
  text,
  words,
  onWordTap,
  baseStyle,
}: TappableChineseTextProps) {
  const segments = useMemo(() => splitTextByWords(text, words), [text, words]);

  return (
    <Text style={[styles.baseText, baseStyle]}>
      {segments.map((s, idx) => {
        if (s.isWord && s.word) {
          const wordData = s.word;
          return (
            <Text
              key={idx}
              style={styles.tappable}
              onPress={() => onWordTap(wordData)}
            >
              {s.text}
            </Text>
          );
        }
        return <Text key={idx}>{s.text}</Text>;
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  baseText: {
    // Để các Text lồng nhau hiển thị inline chính xác
  },
  tappable: {
    color: theme.colors.primary,
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
    fontWeight: 'bold',
  },
});
