import React from 'react';
import { View, Text, TextInput, StyleSheet, ViewStyle } from 'react-native';
import { Colors } from '../../constants/theme';

import { TextInputProps } from 'react-native';

interface FormInputProps extends TextInputProps {
  label?: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  style?: ViewStyle;
  error?: string;
}

export const FormInput: React.FC<FormInputProps> = ({
  label,
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  autoCapitalize,
  keyboardType,
  style,
  error,
  ...props
}) => {
  const themeColors = Colors.dark;

  return (
    <View style={[styles.container, style]}>
      {label && <Text style={[styles.label, { color: themeColors.mutedText }]}>{label}</Text>}
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: themeColors.surface,
            color: themeColors.text,
            borderColor: error ? themeColors.danger : themeColors.border,
            borderWidth: 1,
          }
        ]}
        placeholder={placeholder}
        placeholderTextColor={themeColors.mutedText}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        {...props}
      />
      {error && <Text style={[styles.error, { color: themeColors.danger }]}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    width: '100%',
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    height: 52,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  error: {
    fontSize: 12,
    marginTop: 4,
  },
});
