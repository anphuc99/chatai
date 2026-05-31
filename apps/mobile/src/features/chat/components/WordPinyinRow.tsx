import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Word } from '../types/message';
import { theme } from '../../../theme';

interface WordPinyinRowProps {
  words: Word[];
  onWordTap: (w: Word) => void;
}

export function WordPinyinRow({ words, onWordTap }: WordPinyinRowProps) {
  return (
    <View style={styles.row}>
      {words.map((w, idx) => (
        <Pressable key={idx} style={styles.wordBlock} onPress={() => onWordTap(w)}>
          <Text style={styles.pinyinText}>{w.py}</Text>
          <Text style={styles.hanziText}>{w.hz}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    rowGap: 8,
    columnGap: 4,
    marginTop: 6,
  },
  wordBlock: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    minWidth: 26,
    paddingHorizontal: 2,
  },
  pinyinText: {
    fontSize: 11,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginBottom: 2,
  },
  hanziText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
    textAlign: 'center',
  },
});
