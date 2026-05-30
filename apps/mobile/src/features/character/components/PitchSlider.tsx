import React, { useRef } from 'react';
import { View, Text, StyleSheet, PanResponder, LayoutChangeEvent } from 'react-native';
import { theme } from '../../../theme';

interface PitchSliderProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

export function PitchSlider({
  value,
  onChange,
  min = 0.8,
  max = 1.5,
  step = 0.05,
}: PitchSliderProps) {
  const trackWidth = useRef(0);
  const startValue = useRef(value);
  const startX = useRef(0);

  const calculateSteppedValue = (val: number) => {
    const steppedVal = Math.round(val / step) * step;
    return Math.max(min, Math.min(max, Number(steppedVal.toFixed(2))));
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt, gestureState) => {
        startValue.current = value;
        startX.current = gestureState.x0;
      },
      onPanResponderMove: (evt, gestureState) => {
        if (trackWidth.current === 0) return;
        const dx = gestureState.moveX - startX.current;
        const deltaValue = (dx / trackWidth.current) * (max - min);
        const nextVal = startValue.current + deltaValue;
        onChange(calculateSteppedValue(nextVal));
      },
    })
  ).current;

  const onLayout = (event: LayoutChangeEvent) => {
    trackWidth.current = event.nativeEvent.layout.width;
  };

  const percentage = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>Cao độ giọng nói (Pitch) *</Text>
        <Text style={styles.valueText}>{value.toFixed(2)}x</Text>
      </View>

      {/* Custom Slider Track and Thumb */}
      <View style={styles.sliderContainer} {...panResponder.panHandlers}>
        <View style={styles.sliderTrackWrapper} onLayout={onLayout}>
          <View style={styles.track}>
            <View style={[styles.filledTrack, { width: `${percentage}%` }]} />
          </View>
          <View style={[styles.thumb, { left: `${percentage}%`, transform: [{ translateX: -10 }] }]} />
        </View>
      </View>

      {/* Quick Selection Labels */}
      <View style={styles.labelsContainer}>
        <Text
          style={[styles.quickLabel, Math.abs(value - 0.8) < 0.01 && styles.activeQuickLabel]}
          onPress={() => onChange(0.8)}
        >
          Thấp (0.8)
        </Text>
        <Text
          style={[styles.quickLabel, Math.abs(value - 1.0) < 0.01 && styles.activeQuickLabel]}
          onPress={() => onChange(1.0)}
        >
          Bình thường (1.0)
        </Text>
        <Text
          style={[styles.quickLabel, Math.abs(value - 1.5) < 0.01 && styles.activeQuickLabel]}
          onPress={() => onChange(1.5)}
        >
          Cao (1.5)
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: theme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  label: {
    ...theme.typography.caption,
    color: theme.colors.text,
    fontWeight: '600',
  },
  valueText: {
    ...theme.typography.body,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  sliderContainer: {
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  sliderTrackWrapper: {
    position: 'relative',
    height: 20,
    justifyContent: 'center',
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.border,
    overflow: 'hidden',
  },
  filledTrack: {
    height: '100%',
    backgroundColor: theme.colors.primary,
  },
  thumb: {
    position: 'absolute',
    top: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: theme.colors.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  labelsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: theme.spacing.xs,
  },
  quickLabel: {
    ...theme.typography.small,
    color: theme.colors.textMuted,
    fontWeight: '500',
  },
  activeQuickLabel: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
});
