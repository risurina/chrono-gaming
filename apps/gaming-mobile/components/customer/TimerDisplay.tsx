import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/theme';
import { formatTimeRemaining } from '../../lib/format';

interface TimerDisplayProps {
  seconds: number;
  status?: 'active' | 'warning' | 'expired' | 'none';
}

export const TimerDisplay: React.FC<TimerDisplayProps> = ({ seconds, status = 'active' }) => {
  const themeColors = Colors.dark;

  let timerColor = themeColors.accent;
  if (status === 'warning') timerColor = themeColors.primary;
  if (status === 'expired') timerColor = themeColors.danger;
  if (status === 'none') timerColor = themeColors.mutedText;

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: themeColors.mutedText }]}>TIME REMAINING</Text>
      <Text style={[styles.timer, { color: timerColor, fontFamily: 'monospace' }]}>
        {formatTimeRemaining(seconds)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 8,
  },
  timer: {
    fontSize: 72,
    fontWeight: '800',
  },
});
