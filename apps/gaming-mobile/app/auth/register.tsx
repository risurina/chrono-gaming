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

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const themeColors = Colors.dark;
  const router = useRouter();
  const api = useApi();

  const handleRegister = async () => {
    if (!name || !email || !password) {
      Alert.alert('Error', 'Please enter your name, email, and a password.');
      return;
    }

    setLoading(true);
    try {
      // Global-customer sign-up establishes the session immediately (cookie
      // captured by the API client). The mobile number is set later from the
      // profile screen, once a venue is joined. Route straight to venue select.
      await api.customerAuth.signUp({
        email: email.trim(),
        name: name.trim(),
        password,
      });
      router.replace(await resolveLandingRoute());
    } catch (error: any) {
      Alert.alert('Registration Failed', error.message || 'An error occurred during registration');
    } finally {
      setLoading(false);
    }
  };

  return (
    <MobileScreen>
      <ScreenHeader title="" showBack />

      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: themeColors.text }]}>Create Account</Text>
          <Text style={[styles.subtitle, { color: themeColors.mutedText }]}>
            Set up your future Chrono customer profile for Wallet, sessions, and Branch access.
          </Text>
        </View>

        <View style={styles.form}>
          <FormInput
            label="Full Name"
            placeholder="John Doe"
            value={name}
            onChangeText={setName}
          />
          <FormInput
            label="Email"
            placeholder="john@example.com"
            value={email}
            onChangeText={setEmail}
          />
          <FormInput
            label="Mobile Number"
            placeholder="+63 917 123 4567"
            value={mobile}
            onChangeText={setMobile}
          />
          <FormInput
            label="Password"
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <GoldButton
            title={loading ? "Creating Account..." : "Create Account"}
            onPress={handleRegister}
            disabled={loading}
            style={styles.submitButton}
          />
        </View>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: themeColors.mutedText }]}>
            Already have an account?{' '}
          </Text>
          <TouchableOpacity onPress={() => router.push('/auth/login')}>
            <Text style={[styles.link, { color: themeColors.primary }]}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </View>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  container: {
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
  submitButton: {
    marginTop: 24,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 40,
    marginBottom: 40,
  },
  footerText: {
    fontSize: 15,
  },
  link: {
    fontSize: 15,
    fontWeight: '700',
  },
});
