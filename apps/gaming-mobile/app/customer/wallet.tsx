import { logger } from '../../lib/logger';
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { MobileScreen } from '../../components/layout/MobileScreen';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { WalletBalanceCard } from '../../components/customer/WalletBalanceCard';
import { TransactionItem } from '../../components/customer/TransactionItem';
import { PremiumCard } from '../../components/ui/PremiumCard';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Colors } from '../../constants/theme';
import { useApi } from '../../lib/ApiContext';
import { normalizeTransaction, RawWalletTransaction, TransactionItem as Transaction } from '../../constants/schemas/wallet';

export default function WalletScreen() {
  const themeColors = Colors.dark;
  const api = useApi();
  const [balance, setBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [Wallet, txs] = await Promise.all([
        api.wallet.getBalance(),
        api.wallet.getHistory(),
      ]);
      setBalance(Number(Wallet.balance) || 0);
      setTransactions((txs as RawWalletTransaction[]).map(normalizeTransaction));
    } catch (e: any) {
      logger.error('Failed to load Wallet:', e);
      setError(e?.message || 'Failed to load your wallet.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
        {error ? (
          <ErrorBanner message={error} onRetry={loadData} />
        ) : (
          <>
            <WalletBalanceCard balance={balance} onTopUp={handleTopUp} />

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: themeColors.mutedText }]}>TRANSACTION HISTORY</Text>
              <PremiumCard variant="default">
                {transactions.length > 0 ? (
                  transactions.map((tx) => <TransactionItem key={tx.id} transaction={tx} />)
                ) : (
                  <View style={{ padding: 16, alignItems: 'center' }}>
                    <Text style={{ color: themeColors.mutedText, fontSize: 13 }}>
                      No transactions yet
                    </Text>
                  </View>
                )}
              </PremiumCard>
            </View>
          </>
        )}
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
