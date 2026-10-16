import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { MobileScreen } from '../../components/layout/MobileScreen';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { PremiumCard } from '../../components/ui/PremiumCard';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Colors } from '../../constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCustomerData } from '../../hooks/useCustomerData';
import { tokenStorage } from '../../lib/token-storage';

export default function ProfileScreen() {
  const themeColors = Colors.dark;
  const router = useRouter();
  const { profile, loading, error, refresh } = useCustomerData();

  const handleLogout = async () => {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          // clearAll now throws on failure; do not navigate away reporting
          // success while the token still survives on the device.
          try {
            await tokenStorage.clearAll();
          } catch {
            Alert.alert(
              'Logout failed',
              'We could not clear your session from this device. Please try again.',
            );
            return;
          }
          router.replace('/');
        }
      }
    ]);
  };

  const menuItems = [
    { id: 'acc', label: 'Account Information', icon: 'person-outline' },
    { id: 'cafe', label: 'Linked Cafes', icon: 'business' },
    { id: 'notif', label: 'Notifications', icon: 'notifications-none' },
    { id: 'help', label: 'Help & Support', icon: 'help-outline' },
    { id: 'logout', label: 'Logout', icon: 'logout', color: themeColors.danger },
  ];

  const name = profile?.name || profile?.username || 'Guest';
  const email = profile?.email || 'No email provided';
  const memberId = profile?.id?.substring(0, 8).toUpperCase() || '---';

  // An `api.auth.me()` failure must not masquerade as a real "Guest" profile
  // with a blank email and "ID ---". Surface the error with a retry instead.
  if (error && !loading) {
    return (
      <MobileScreen>
        <ScreenHeader title="Profile" />
        <View style={styles.container}>
          <ErrorBanner
            message={error.message || 'We could not load your profile.'}
            onRetry={refresh}
          />
        </View>
      </MobileScreen>
    );
  }

  return (
    <MobileScreen refreshing={loading}>
      <ScreenHeader title="Profile" />

      <View style={styles.container}>
        <View style={styles.profileSection}>
          <View style={[styles.avatarContainer, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <MaterialIcons name="person" size={60} color={themeColors.primary} />
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.name, { color: themeColors.text }]}>{name}</Text>
            <Text style={[styles.email, { color: themeColors.mutedText }]}>{email}</Text>
            <View style={[styles.idBadge, { backgroundColor: 'rgba(214, 168, 79, 0.1)' }]}>
              <Text style={[styles.idText, { color: themeColors.primary }]}>ID: {memberId}</Text>
            </View>
          </View>
        </View>

        <View style={styles.menuSection}>
          <PremiumCard variant="default" style={styles.menuCard}>
            {menuItems.map((item, index) => (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.menuItem,
                  index !== menuItems.length - 1 && { borderBottomWidth: 1, borderBottomColor: themeColors.border }
                ]}
                onPress={() => item.id === 'logout' ? handleLogout() : null}
              >
                <View style={styles.menuLeft}>
                  <MaterialIcons name={item.icon as any} size={22} color={item.color || themeColors.text} />
                  <Text style={[styles.menuLabel, { color: item.color || themeColors.text }]}>{item.label}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={themeColors.mutedText} />
              </TouchableOpacity>
            ))}
          </PremiumCard>
        </View>

        <View style={styles.footer}>
          <Text style={[styles.version, { color: themeColors.mutedText }]}>Chrono Mobile v1.0.0</Text>
          <Text style={[styles.copyright, { color: themeColors.mutedText }]}>© 2026 IZUR IT Solutions</Text>
        </View>
      </View>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 32,
  },
  profileSection: {
    alignItems: 'center',
    gap: 16,
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: {
    alignItems: 'center',
    gap: 4,
  },
  name: {
    fontSize: 24,
    fontWeight: '800',
  },
  email: {
    fontSize: 14,
  },
  idBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 4,
  },
  idText: {
    fontSize: 12,
    fontWeight: '700',
  },
  menuSection: {
    gap: 12,
  },
  menuCard: {
    padding: 0,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  footer: {
    alignItems: 'center',
    gap: 4,
    marginTop: 20,
    paddingBottom: 40,
  },
  version: {
    fontSize: 12,
    fontWeight: '700',
  },
  copyright: {
    fontSize: 10,
  },
});
