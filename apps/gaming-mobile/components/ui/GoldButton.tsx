import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle, View } from 'react-native';
import { Colors } from '../../constants/theme';
import { cn } from '../../lib/cn';

interface GoldButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  isLoading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
}

export const GoldButton: React.FC<GoldButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  isLoading = false,
  disabled = false,
  style,
  textStyle,
  icon,
}) => {
  const themeColors = Colors.dark;

  const buttonStyles: any[] = [styles.button];
  const labelStyles: any[] = [styles.label];

  if (variant === 'primary') {
    buttonStyles.push({
      backgroundColor: themeColors.primary,
      shadowColor: themeColors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    });
    labelStyles.push({ color: '#000', fontWeight: '900' });
  } else if (variant === 'outline') {
    buttonStyles.push({
      backgroundColor: 'rgba(244, 201, 93, 0.05)',
      borderWidth: 1.5,
      borderColor: themeColors.border
    });
    labelStyles.push({ color: themeColors.primary, fontWeight: '800' });
  } else if (variant === 'secondary') {    buttonStyles.push({ backgroundColor: themeColors.surface });    labelStyles.push({ color: themeColors.text, fontWeight: '700' });  } else if (variant === 'ghost') {
    buttonStyles.push({ backgroundColor: 'transparent' });
    labelStyles.push({ color: themeColors.primary, fontWeight: '800' });
  }

  if (disabled || isLoading) {
    buttonStyles.push({ opacity: 0.5 });
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || isLoading}
      style={cn(buttonStyles, style)}
      activeOpacity={0.7}
    >
      {isLoading ? (
        <ActivityIndicator color={variant === 'primary' ? '#000' : themeColors.primary} />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text style={cn(labelStyles, textStyle)}>{title.toUpperCase()}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  label: {
    fontSize: 13,
    letterSpacing: 2,
  },
});
