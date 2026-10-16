import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors } from '../../constants/theme';
import { cn } from '../../lib/cn';

interface PremiumCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  variant?: 'default' | 'secondary' | 'gold-border' | 'glass';
  withGlow?: boolean;
}

export const PremiumCard: React.FC<PremiumCardProps> = ({
  children,
  style,
  variant = 'default',
  withGlow = false
}) => {
  const themeColors = Colors.dark;

  const cardStyles: any[] = [styles.card];

  if (variant === 'default') {
    cardStyles.push({ backgroundColor: themeColors.surface });
  } else if (variant === 'secondary') {
    cardStyles.push({ backgroundColor: themeColors.secondarySurface });
  } else if (variant === 'gold-border') {
    cardStyles.push({
      backgroundColor: themeColors.surface,
      borderWidth: 2,
      borderColor: themeColors.border
    });
  } else if (variant === 'glass') {
    cardStyles.push({
      backgroundColor: 'rgba(20, 17, 11, 0.6)',
      borderWidth: 1,
      borderColor: 'rgba(244, 201, 93, 0.15)',
    });
  }

  if (withGlow) {
    cardStyles.push({
      shadowColor: themeColors.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 8,
    });
  }

  return <View style={cn(cardStyles, style)}>{children}</View>;
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 20,
    overflow: 'hidden',
  },
});
