import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';

interface ErrorBannerProps {
  /** Human-readable failure description. */
  message?: string;
  /** Re-invokes the failed loader. */
  onRetry?: () => void;
}

/**
 * Inline error banner with retry, shown instead of empty/zero data when a
 * fetch fails so users can distinguish "nothing here" from "couldn't load".
 */
export const ErrorBanner: React.FC<ErrorBannerProps> = ({ message, onRetry }) => {
  const themeColors = Colors.dark;

  return (
    <View
      style={[
        styles.container,
        { borderColor: themeColors.danger, backgroundColor: 'rgba(255, 92, 92, 0.08)' },
      ]}
    >
      <MaterialIcons name="error-outline" size={22} color={themeColors.danger} />
      <View style={styles.textContainer}>
        <Text style={[styles.title, { color: themeColors.text }]}>Something went wrong</Text>
        <Text style={[styles.message, { color: themeColors.mutedText }]}>
          {message || 'We could not load this data. Please check your connection and try again.'}
        </Text>
      </View>
      {onRetry && (
        <TouchableOpacity style={styles.retryButton} onPress={onRetry} accessibilityRole="button">
          <MaterialIcons name="refresh" size={16} color={themeColors.danger} />
          <Text style={[styles.retryText, { color: themeColors.danger }]}>RETRY</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  textContainer: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
  },
  message: {
    fontSize: 12,
    lineHeight: 17,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  retryText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
