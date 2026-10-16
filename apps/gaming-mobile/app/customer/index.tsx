import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { MobileScreen } from '../../components/layout/MobileScreen';
import { WalletBalanceCard } from '../../components/customer/WalletBalanceCard';
import { ActiveSessionCard } from '../../components/customer/ActiveSessionCard';
import { TransactionItem } from '../../components/customer/TransactionItem';
import { PremiumCard } from '../../components/ui/PremiumCard';
import { Colors } from '../../constants/theme';
import { MOCK_QUICK_ACTIONS } from '../../constants/mock-customer-data';
import { MaterialIcons } from '@expo/vector-icons';
import { useCustomerData } from '../../hooks/useCustomerData';

export default function CustomerHomeScreen() {
  const themeColors = Colors.dark;
  const router = useRouter();

  const {
    customer,
    wallet,
    recentTransactions,
    activeSession,
    recentBranch,
    noVenue,
    loading,
    refresh,
  } = useCustomerData();

  if (loading && !customer) {
    return (
      <MobileScreen withSafeArea={true}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={themeColors.primary} />
        </View>
      </MobileScreen>
    );
  }

  const name = customer?.name || 'Guest';
  const cafeName = recentBranch?.branchName || 'Select a cafe';
  const balance = wallet ? Number(wallet.balance) : 0;

  return (
    <MobileScreen withSafeArea={true} onRefresh={refresh} refreshing={loading}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.greeting, { color: themeColors.mutedText }]}>Elite Member</Text>
          <Text style={[styles.name, { color: themeColors.primary }]}>{name}</Text>
        </View>
        <TouchableOpacity
          style={[
            styles.cafeBadge,
            {
              backgroundColor: themeColors.surface,
              borderColor: themeColors.border,
              borderWidth: 1,
            },
          ]}
          onPress={() => router.push('/customer/branch')}
        >
          <MaterialIcons name="business" size={16} color={themeColors.primary} />
          <Text style={[styles.cafeName, { color: themeColors.text }]}>{cafeName}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {noVenue && (
          <TouchableOpacity 
            style={[styles.joinBanner, { backgroundColor: themeColors.primary + '15', borderColor: themeColors.primary }]}
            onPress={() => router.push('/join')}
          >
            <View style={styles.joinIcon}>
              <MaterialIcons name="add-location-alt" size={24} color={themeColors.primary} />
            </View>
            <View style={styles.joinTextContainer}>
              <Text style={[styles.joinTitle, { color: themeColors.text }]}>JOIN YOUR CAFE</Text>
              <Text style={[styles.joinSubtitle, { color: themeColors.mutedText }]}>
                Link your account to a gaming Branch to start sessions and use your Wallet.
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color={themeColors.primary} />
          </TouchableOpacity>
        )}

        <WalletBalanceCard balance={balance} onTopUp={() => router.push('/customer/wallet')} />

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: themeColors.primary }]}>
              ACTIVE SESSION
            </Text>
          </View>
          {activeSession ? (
            <ActiveSessionCard session={activeSession} branchName={recentBranch?.branchName} />
          ) : (
            <PremiumCard variant="default" style={{ padding: 24, alignItems: 'center', gap: 12 }}>
              <MaterialIcons
                name="desktop-access-disabled"
                size={32}
                color={themeColors.mutedText}
              />
              <Text style={{ color: themeColors.mutedText, fontWeight: '600' }}>
                No active Session
              </Text>
            </PremiumCard>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: themeColors.mutedText }]}>
              QUICK ACTIONS
            </Text>
          </View>
          <View style={styles.actionGrid}>
            {MOCK_QUICK_ACTIONS.map((action) => (
              <TouchableOpacity
                key={action.id}
                style={styles.actionItem}
                onPress={() => router.push(action.route as any)}
              >
                <View style={[styles.actionIcon, { backgroundColor: 'rgba(244, 201, 93, 0.08)' }]}>
                  <MaterialIcons name={action.icon as any} size={24} color={themeColors.primary} />
                </View>
                <Text style={[styles.actionLabel, { color: themeColors.text }]}>
                  {action.label.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: themeColors.mutedText }]}>
              LATEST ACTIVITY
            </Text>
            <TouchableOpacity onPress={() => router.push('/customer/wallet')}>
              <Text style={[styles.seeAll, { color: themeColors.primary }]}>Review All</Text>
            </TouchableOpacity>
          </View>
          <PremiumCard variant="glass">
            {recentTransactions.length > 0 ? (
              recentTransactions
                .slice(0, 3)
                .map((tx: any) => <TransactionItem key={tx.id} transaction={tx} />)
            ) : (
              <View style={{ padding: 16, alignItems: 'center' }}>
                <Text style={{ color: themeColors.mutedText, fontSize: 13 }}>
                  No recent transactions
                </Text>
              </View>
            )}
          </PremiumCard>
        </View>
      </View>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 20,
    marginBottom: 32,
  },
  greeting: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  name: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -1,
  },
  cafeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 30,
  },
  cafeName: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  content: {
    paddingHorizontal: 24,
    gap: 40,
  },
  section: {
    gap: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 3,
  },
  seeAll: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  actionGrid: {
    flexDirection: 'row',
    gap: 16,
  },
  actionItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 12,
  },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 8,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 1.2,
    opacity: 0.8,
  },
  joinBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 16,
  },
  joinIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinTextContainer: {
    flex: 1,
    gap: 4,
  },
  joinTitle: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },
  joinSubtitle: {
    fontSize: 11,
    lineHeight: 16,
  },
});
