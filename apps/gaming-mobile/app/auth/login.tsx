import { logger } from '../../lib/logger.js';
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { MobileScreen } from '../../components/layout/MobileScreen';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { FormInput } from '../../components/ui/FormInput';
import { GoldButton } from '../../components/ui/GoldButton';
import { Colors } from '../../constants/theme';
import { useApi } from '../../lib/ApiContext';
import { resolveLandingRoute } from '../../lib/post-auth';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const themeColors = Colors.dark;
  const router = useRouter();
  const api = useApi();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter both email and password');
      return;
    }

    setLoading(true);
    try {
      // Global-customer sign-in: the session cookie is captured by the API
      // client and persisted in SecureStore. Tenant/venue is selected next.
      await api.customerAuth.signIn({ email: email.trim(), password });
      router.replace(await resolveLandingRoute());
    } catch (error: any) {
      logger.warn('Login failed:', error.message);
      Alert.alert('Login Failed', error.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <MobileScreen scrollable={false}>
      <ScreenHeader title="" showBack />

      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: themeColors.text }]}>Welcome back</Text>
          <Text style={[styles.subtitle, { color: themeColors.mutedText }]}>
            Sign in to your Chrono account to manage your sessions and Wallet.
          </Text>
        </View>

        <View style={styles.form}>
          <FormInput
            label="Email"
            placeholder="your@email.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <FormInput
            label="Password"
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity style={styles.forgotPassword}>
            <Text style={[styles.forgotText, { color: themeColors.primary }]}>Forgot password?</Text>
          </TouchableOpacity>

          <GoldButton
            title={loading ? "Signing in..." : "Continue"}
            onPress={handleLogin}
            disabled={loading}
            style={styles.submitButton}
          />
        </View>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: themeColors.mutedText }]}>
            Don&apos;t have an account?{' '}
          </Text>
          <TouchableOpacity onPress={() => router.push('/auth/register')}>
            <Text style={[styles.link, { color: themeColors.primary }]}>Create one</Text>
          </TouchableOpacity>
        </View>
      </View>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  header: {
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
  },
  form: {
    gap: 8,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 24,
  },
  forgotText: {
    fontSize: 14,
    fontWeight: '600',
  },
  submitButton: {
    marginTop: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 40,
  },
  footerText: {
    fontSize: 15,
  },
  link: {
    fontSize: 15,
    fontWeight: '700',
  },
});
