import { logger } from '../lib/logger';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { MobileScreen } from '../components/layout/MobileScreen';
import { GoldButton } from '../components/ui/GoldButton';
import { Colors } from '../constants/theme';
import { FEATURE_CHIPS } from '../constants/customer-nav';
import { MaterialIcons } from '@expo/vector-icons';
import { tokenStorage } from '../lib/token-storage';
import { apiService } from '../lib/api-service';

export default function WelcomeScreen() {
  const themeColors = Colors.dark;
  const router = useRouter();
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const token = await tokenStorage.getToken();
        if (token) {
          try {
            // Verify the token is still valid
            await apiService.auth.me();
            // If we have a valid token, skip the welcome screen and go to the dashboard
            router.replace('/customer');
          } catch (error) {
            // Token is likely invalid or expired, it will be cleared by the 401 interceptor
            logger.info('Session invalid, staying on welcome screen');
          }
        }
      } catch (error) {
        logger.error('Error checking Session:', error);
      } finally {
        setIsInitializing(false);
      }
    };

    checkSession();
  }, [router]);

  if (isInitializing) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color={themeColors.primary} />
      </View>
    );
  }

  return (
    <MobileScreen withSafeArea={true} scrollable={false}>
      <View style={styles.container}>
        <View style={styles.hero}>
          {/* Logo Placeholder */}
          <View style={[styles.logoContainer, { borderColor: themeColors.border }]}>
            <MaterialIcons name="timer" size={60} color={themeColors.primary} />
          </View>
          <Text style={[styles.brandName, { color: themeColors.primary }]}>Chrono</Text>
          <Text style={[styles.brandTagline, { color: themeColors.mutedText }]}>by IZUR</Text>
        </View>

        <View style={styles.content}>
          <Text style={[styles.headline, { color: themeColors.text }]}>
            Your gaming Session starts here.
          </Text>
          <Text style={[styles.subheadline, { color: themeColors.mutedText }]}>
            Check your balance, track your time, and stay connected with your gaming cafe.
          </Text>

          <View style={styles.featureGrid}>
            {FEATURE_CHIPS.map((feature) => (
              <View key={feature.id} style={styles.featureItem}>
                <View style={[styles.featureIcon, { backgroundColor: 'rgba(214, 168, 79, 0.1)' }]}>
                  <MaterialIcons name={feature.icon as any} size={20} color={themeColors.primary} />
                </View>
                <Text style={[styles.featureLabel, { color: themeColors.text }]}>{feature.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.actions}>
          <GoldButton
            title="GET STARTED"
            onPress={() => router.push('/auth/register')}
            variant="primary"
          />
          <GoldButton
            title="I ALREADY HAVE AN ACCOUNT"
            onPress={() => router.push('/auth/login')}
            variant="ghost"
          />
        </View>
      </View>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 40,
    justifyContent: 'center',
    gap: 48,
  },
  hero: {
    alignItems: 'center',
    gap: 8,
  },
  logoContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  brandName: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  brandTagline: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  content: {
    gap: 16,
  },
  headline: {
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 40,
  },
  subheadline: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 24,
    gap: 12,
    justifyContent: 'center',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  featureIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  actions: {
    gap: 12,
    marginTop: 40,
  },
});
