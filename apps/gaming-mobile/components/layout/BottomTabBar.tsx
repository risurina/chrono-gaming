import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';
import { useRouter, usePathname } from 'expo-router';

export const BottomTabBar = () => {
  const themeColors = Colors.dark;
  const router = useRouter();
  const pathname = usePathname();

  const tabs = [
    { name: 'Home', icon: 'home', route: '/customer' },
    { name: 'SessionRow', icon: 'timer', route: '/customer/Session' },
    { name: 'Wallet', icon: 'account-balance-Wallet', route: '/customer/Wallet' },
    { name: 'Profile', icon: 'person', route: '/customer/profile' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: themeColors.surface, borderTopColor: themeColors.border }]}>
      {tabs.map((tab) => {
        const isActive = pathname === tab.route || (tab.route === '/customer' && pathname === '/customer/');
        return (
          <TouchableOpacity
            key={tab.name}
            style={styles.tab}
            onPress={() => router.push(tab.route as any)}
          >
            <MaterialIcons
              name={tab.icon as any}
              size={24}
              color={isActive ? themeColors.primary : themeColors.mutedText}
            />
            <Text
              style={[
                styles.label,
                { color: isActive ? themeColors.primary : themeColors.mutedText }
              ]}
            >
              {tab.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: 80,
    borderTopWidth: 1,
    paddingBottom: 24, // Account for home indicator
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
  },
});
