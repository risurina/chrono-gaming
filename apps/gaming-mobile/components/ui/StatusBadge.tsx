import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors } from '../../constants/theme';
import { cn } from '../../lib/cn';

interface StatusBadgeProps {
  label: string;
  status: 'active' | 'warning' | 'expired' | 'success' | 'danger' | 'muted' | 'none';
  style?: ViewStyle;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ label, status, style }) => {
  const themeColors = Colors.dark;

  let backgroundColor = themeColors.surface;
  let textColor = themeColors.text;

  switch (status) {
    case 'active':
    case 'success':
      backgroundColor = 'rgba(115, 209, 138, 0.15)';
      textColor = themeColors.success;
      break;
    case 'warning':
      backgroundColor = 'rgba(214, 168, 79, 0.15)';
      textColor = themeColors.primary;
      break;
    case 'expired':
    case 'danger':
      backgroundColor = 'rgba(217, 83, 79, 0.15)';
      textColor = themeColors.danger;
      break;
    case 'muted':
    case 'none':
      backgroundColor = 'rgba(184, 170, 144, 0.1)';
      textColor = themeColors.mutedText;
      break;
  }

  return (
    <View style={cn(styles.badge, { backgroundColor }, style)}>
      <Text style={[styles.label, { color: textColor }]}>{label.toUpperCase()}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
