import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { MobileScreen } from '../../components/layout/MobileScreen';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { FormInput } from '../../components/ui/FormInput';
import { GoldButton } from '../../components/ui/GoldButton';
import { PremiumCard } from '../../components/ui/PremiumCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { Colors } from '../../constants/theme';
import { useApi } from '../../lib/ApiContext';
import { formatCurrency } from '../../lib/format';
import { logger } from '../../lib/logger';
import type { Payment, PaymentGatewayStatus } from '../../constants/schemas/api';

const QUICK_AMOUNTS = [100, 200, 500, 1000];
const MIN_AMOUNT = 20;
const MAX_AMOUNT = 10000;

export default function TopUpScreen() {
  const themeColors = Colors.dark;
  const api = useApi();
  const [gateway, setGateway] = useState<PaymentGatewayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState<{ paymentId: string } | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const g = await api.payments.gateway();
        if (mounted) setGateway(g);
      } catch (e) {
        logger.error('Failed to load payment gateway:', e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [api]);

  const checkStatus = async (paymentId: string): Promise<Payment | null> => {
    try {
      return await api.payments.get(paymentId);
    } catch (e) {
      logger.error('Failed to check payment:', e);
      return null;
    }
  };

  const handleTopUp = async () => {
    const value = Number(amount);
    if (!value || value < MIN_AMOUNT || value > MAX_AMOUNT) {
      Alert.alert('Invalid amount', `Enter an amount between ${formatCurrency(MIN_AMOUNT)} and ${formatCurrency(MAX_AMOUNT)}.`);
      return;
    }
    setSubmitting(true);
    try {
      const checkout = await api.payments.checkout(
        { purpose: 'wallet_topup', amount: value.toFixed(2) },
        `topup-${Date.now()}`,
      );
      setPending({ paymentId: checkout.paymentId });
      await WebBrowser.openBrowserAsync(checkout.checkoutUrl);
      // User returned from the payment page — check the result.
      const payment = await checkStatus(checkout.paymentId);
      if (payment?.status === 'paid') {
        setPending(null);
        setAmount('');
        Alert.alert('Success', 'Your wallet has been topped up.');
      } else {
        Alert.alert(
          'Payment pending',
          'We have not confirmed your payment yet. Use "Check status" in a moment.',
        );
      }
    } catch (e: any) {
      Alert.alert('Top-up failed', e?.message || 'Could not start the payment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckStatus = async () => {
    if (!pending) return;
    const payment = await checkStatus(pending.paymentId);
    if (payment?.status === 'paid') {
      setPending(null);
      Alert.alert('Success', 'Your wallet has been topped up.');
    } else {
      Alert.alert('Still pending', `Current status: ${payment?.status ?? 'unknown'}.`);
    }
  };

  if (loading) {
    return (
      <MobileScreen>
        <ScreenHeader title="Top Up" showBack />
        <ActivityIndicator style={{ marginTop: 24 }} color={themeColors.primary} />
      </MobileScreen>
    );
  }

  if (!gateway?.available) {
    return (
      <MobileScreen>
        <ScreenHeader title="Top Up" showBack />
        <View style={{ paddingTop: 48 }}>
          <EmptyState
            icon="account-balance-wallet"
            title="Online top-up unavailable"
            description="This cafe hasn't enabled online payments. Please top up at the counter."
          />
        </View>
      </MobileScreen>
    );
  }

  return (
    <MobileScreen>
      <ScreenHeader title="Top Up" showBack />
      <View style={styles.container}>
        <View style={styles.quickRow}>
          {QUICK_AMOUNTS.map((a) => {
            const selected = Number(amount) === a;
            return (
              <TouchableOpacity
                key={a}
                onPress={() => setAmount(String(a))}
                style={[
                  styles.quickChip,
                  {
                    borderColor: selected ? themeColors.primary : themeColors.border,
                    backgroundColor: selected ? 'rgba(214,168,79,0.12)' : 'transparent',
                  },
                ]}
              >
                <Text style={[styles.quickText, { color: selected ? themeColors.primary : themeColors.text }]}>
                  {formatCurrency(a)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <FormInput
          label="Amount"
          placeholder="Enter amount"
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
        />

        <GoldButton
          title={submitting ? 'Starting…' : 'Proceed to Payment'}
          onPress={handleTopUp}
          disabled={submitting}
        />

        {pending ? (
          <PremiumCard variant="secondary" style={styles.pendingCard}>
            <Text style={[styles.pendingText, { color: themeColors.mutedText }]}>
              Waiting for payment confirmation.
            </Text>
            <GoldButton title="Check status" variant="outline" onPress={handleCheckStatus} />
          </PremiumCard>
        ) : null}

        <Text style={[styles.note, { color: themeColors.mutedText }]}>
          Payments are processed securely in your browser. Your balance updates once payment is
          confirmed.
        </Text>
      </View>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 24, paddingTop: 12, gap: 20 },
  quickRow: { flexDirection: 'row', gap: 10 },
  quickChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  quickText: { fontSize: 14, fontWeight: '700' },
  pendingCard: { gap: 12, padding: 16 },
  pendingText: { fontSize: 13, textAlign: 'center' },
  note: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
});
