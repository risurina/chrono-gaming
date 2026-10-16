import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { MobileScreen } from '../../components/layout/MobileScreen';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { TimerDisplay } from '../../components/customer/TimerDisplay';
import { PremiumCard } from '../../components/ui/PremiumCard';
import { GoldButton } from '../../components/ui/GoldButton';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Colors } from '../../constants/theme';
import { formatCurrency, formatDate } from '../../lib/format';
import { useApi } from '../../lib/ApiContext';
import { logger } from '../../lib/logger';
import { normalizeActiveSession, ActiveSession, RawActiveSession } from '../../constants/schemas/session';
import { MaterialIcons } from '@expo/vector-icons';

export default function SessionScreen() {
  const themeColors = Colors.dark;
  const api = useApi();
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [sessionRes, walletRes] = await Promise.allSettled([
      api.session.getActive(),
      api.wallet.getBalance(),
    ]);

    if (sessionRes.status === 'fulfilled') {
      // A fulfilled-but-null response is a genuine "no active session"; keep it
      // distinct from the error state below so the EmptyState still renders.
      setSession(
        sessionRes.value
          ? normalizeActiveSession(sessionRes.value as RawActiveSession)
          : null,
      );
    }

    if (walletRes.status === 'fulfilled') {
      setBalance(Number(walletRes.value.balance) || 0);
    } else {
      // A wallet failure alone degrades to a zero balance rather than blocking
      // the whole screen, but must not be silently ignored.
      logger.error('Failed to load wallet balance:', walletRes.reason);
    }

    // Only a failed session lookup is a real error state; a wallet-only failure
    // is tolerated above.
    if (sessionRes.status === 'rejected') {
      logger.error('Failed to load active session:', sessionRes.reason);
      setError(
        (sessionRes.reason as { message?: string })?.message ||
          'Failed to load your active session.',
      );
    }

    setLoading(false);
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const showCounterNotice = () => {
    Alert.alert(
      'Ask the Counter',
      'Managing your session from the app is not available yet. Please ask the counter for assistance.',
    );
  };

  if (loading) {
    return (
      <MobileScreen>
        <ScreenHeader title="Active Session" showBack />
        <ActivityIndicator style={{ marginTop: 24 }} color={themeColors.primary} />
      </MobileScreen>
    );
  }

  if (error) {
    return (
      <MobileScreen>
        <ScreenHeader title="Active Session" showBack />
        <View style={styles.container}>
          <ErrorBanner message={error} onRetry={load} />
        </View>
      </MobileScreen>
    );
  }

  if (!session) {
    return (
      <MobileScreen>
        <ScreenHeader title="Active Session" showBack />
        <View style={styles.container}>
          <EmptyState
            icon="desktop-access-disabled"
            title="No active session"
            description="Start a session at your cafe to see live details here."
          />
        </View>
      </MobileScreen>
    );
  }

  return (
    <MobileScreen>
      <ScreenHeader title="Active Session" showBack />

      <View style={styles.container}>
        <TimerDisplay seconds={session.timeRemainingSeconds} status={session.status} />

        <PremiumCard variant="secondary" style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: themeColors.mutedText }]}>Status</Text>
            <StatusBadge status={session.status} label={session.status.toUpperCase()} />
          </View>

          <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: themeColors.mutedText }]}>Station</Text>
            <Text style={[styles.detailValue, { color: themeColors.text }]}>{session.stationName}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: themeColors.mutedText }]}>Started</Text>
            <Text style={[styles.detailValue, { color: themeColors.text }]}>{formatDate(session.startTime)}</Text>
          </View>

          {!!session.estimatedEndTime && (
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: themeColors.mutedText }]}>Estimated End</Text>
              <Text style={[styles.detailValue, { color: themeColors.text }]}>{formatDate(session.estimatedEndTime)}</Text>
            </View>
          )}

          <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: themeColors.mutedText }]}>Wallet Balance</Text>
            <Text style={[styles.balanceValue, { color: themeColors.accent }]}>{formatCurrency(balance)}</Text>
          </View>
        </PremiumCard>

        <View style={styles.actions}>
          <GoldButton
            title="Extend Time"
            onPress={showCounterNotice}
            variant="primary"
            icon={<MaterialIcons name="more-time" size={24} color="#000" />}
          />
          <View style={styles.secondaryActions}>
            <GoldButton
              title="Notify Staff"
              onPress={showCounterNotice}
              variant="outline"
              style={{ flex: 1 }}
              icon={<MaterialIcons name="notifications" size={20} color={themeColors.primary} />}
            />
            <GoldButton
              title="End Session"
              onPress={showCounterNotice}
              variant="outline"
              style={{ flex: 1, borderColor: themeColors.danger }}
              textStyle={{ color: themeColors.danger }}
              icon={<MaterialIcons name="power-settings-new" size={20} color={themeColors.danger} />}
            />
          </View>
        </View>

        <Text style={[styles.disclaimer, { color: themeColors.mutedText }]}>
          Session actions are handled at the counter for now.
        </Text>
      </View>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    gap: 32,
  },
  detailsCard: {
    padding: 20,
    gap: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  balanceValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  divider: {
    height: 1,
    opacity: 0.5,
  },
  actions: {
    gap: 12,
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: 12,
  },
  disclaimer: {
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
