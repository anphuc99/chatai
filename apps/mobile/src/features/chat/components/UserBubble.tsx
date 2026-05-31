import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ChatMessage } from '../types/message';
import { theme } from '../../../theme';

interface UserBubbleProps {
  msg: ChatMessage;
}

export function UserBubble({ msg }: UserBubbleProps) {
  return (
    <Animated.View 
      entering={FadeInDown.duration(250)} 
      style={styles.container}
    >
      <View style={styles.bubble}>
        <Text style={styles.text}>{msg.text}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  bubble: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderBottomRightRadius: theme.radius.sm,
    maxWidth: '80%',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  text: {
    ...theme.typography.body,
    color: '#FFFFFF',
    lineHeight: 22,
  },
});
