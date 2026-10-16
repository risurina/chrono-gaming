import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { MobileScreen } from '../../components/layout/MobileScreen';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { PremiumCard } from '../../components/ui/PremiumCard';
import { Colors } from '../../constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCustomerData } from '../../hooks/useCustomerData';
import { useApi } from '../../lib/ApiContext';
import { sessionStorage } from '../../lib/session-storage';

export default function ProfileScreen() {
  const themeColors = Colors.dark;
  const router = useRouter();
  const api = useApi();
  const { customer, profile, loading } = useCustomerData();

  const handleLogout = async () => {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await api.customerAuth.signOut().catch(() => {});
          await sessionStorage.clearAll();
          router.replace('/');
        },
      },
    ]);
  };

  const menuItems = [
    { id: 'acc', label: 'Account Information', icon: 'person-outline' },
    { id: 'cafe', label: 'Your Cafes', icon: 'business' },
    { id: 'loyalty', label: 'Loyalty & Rewards', icon: 'stars' },
    { id: 'credits', label: 'Time Credits', icon: 'schedule' },
    { id: 'topup', label: 'Top Up Wallet', icon: 'account-balance-wallet' },
    { id: 'reservations', label: 'Reservations', icon: 'event-seat' },
    { id: 'promos', label: 'Promos', icon: 'local-offer' },
    { id: 'activity', label: 'Activity', icon: 'history' },
    { id: 'logout', label: 'Logout', icon: 'logout', color: themeColors.danger },
  ];

  const routes: Record<string, string> = {
    acc: '/customer/account',
    cafe: '/join',
    loyalty: '/customer/loyalty',
    credits: '/customer/credits',
    topup: '/customer/topup',
    reservations: '/customer/reservations',
    promos: '/customer/promos',
    activity: '/customer/activity',
  };

  const onMenuPress = (id: string) => {
    if (id === 'logout') handleLogout();
    else if (routes[id]) router.push(routes[id] as any);
  };

  const name = customer?.name || 'Guest';
  const email = customer?.email || 'No email provided';
  const memberId =
    profile?.memberCode || customer?.id?.substring(0, 8).toUpperCase() || '---';

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
                  index !== menuItems.length - 1 && { borderBottomWidth: 1, borderBottomColor: themeColors.border },
                ]}
                onPress={() => onMenuPress(item.id)}
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
