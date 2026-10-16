import { logger } from '../../lib/logger.js';
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { MobileScreen } from '../../components/layout/MobileScreen';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { WalletBalanceCard } from '../../components/customer/WalletBalanceCard';
import { TransactionItem } from '../../components/customer/TransactionItem';
import { PremiumCard } from '../../components/ui/PremiumCard';
import { Colors } from '../../constants/theme';
import { useApi } from '../../lib/ApiContext';
import type { WalletTransaction } from '../../constants/schemas/api';

export default function WalletScreen() {
  const themeColors = Colors.dark;
  const api = useApi();
  const [balance, setBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [bal, history] = await Promise.all([
          api.wallet.balance(),
          api.wallet.history({ pageSize: 50 }),
        ]);
        setBalance(Number(bal.balance));
        setTransactions(history.items);
      } catch (e) {
        logger.error('Failed to load Wallet:', e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [api]);

  const handleTopUp = () => {
    Alert.alert('Top Up', 'Please visit the cashier to top up your Wallet balance.');
  };

  if (loading) {
    return (
      <MobileScreen>
        <ScreenHeader title="Wallet" showBack />
        <ActivityIndicator style={{ marginTop: 24 }} color={themeColors.primary} />
      </MobileScreen>
    );
  }

  return (
    <MobileScreen>
      <ScreenHeader title="Wallet" showBack />

      <View style={styles.container}>
        <WalletBalanceCard balance={balance} onTopUp={handleTopUp} />

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.mutedText }]}>TRANSACTION HISTORY</Text>
          <PremiumCard variant="default">
            {transactions.map((tx) => (
              <TransactionItem key={tx.id} transaction={tx} />
            ))}
          </PremiumCard>
        </View>
      </View>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 24,
  },
  infoBox: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(214, 168, 79, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(214, 168, 79, 0.1)',
  },
  infoText: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
