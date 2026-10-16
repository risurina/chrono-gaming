import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { MobileScreen } from '../../components/layout/MobileScreen';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { TimerDisplay } from '../../components/customer/TimerDisplay';
import { PremiumCard } from '../../components/ui/PremiumCard';
import { GoldButton } from '../../components/ui/GoldButton';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Colors } from '../../constants/theme';
import { formatCurrency, formatTime } from '../../lib/format';
import { MaterialIcons } from '@expo/vector-icons';
import { useApi } from '../../lib/ApiContext';
import { logger } from '../../lib/logger';
import { sessionBadgeStatus, sessionClock } from '../../components/customer/ActiveSessionCard';
import type { ActiveSession, SessionSummary, WalletBalance } from '../../constants/schemas/api';

export default function SessionScreen() {
  const themeColors = Colors.dark;
  const router = useRouter();
  const api = useApi();

  const [session, setSession] = useState<ActiveSession | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [wallet, setWallet] = useState<WalletBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0); // drives the live timer re-render

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [s, sum, w] = await Promise.all([
          api.sessions.active(),
          api.sessions.summary().catch(() => null),
          api.wallet.balance().catch(() => null),
        ]);
        if (!mounted) return;
        setSession(s);
        setSummary(sum);
        setWallet(w);
      } catch (e) {
        logger.error('Failed to load session:', e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [api]);

  // Live timer tick every second while a session is shown.
  useEffect(() => {
    if (!session) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [session]);

  const staffInfo = () =>
    Alert.alert('Ask staff', 'Please see the counter to extend or end your session.');

  if (loading) {
    return (
      <MobileScreen>
        <ScreenHeader title="Active Session" showBack />
        <ActivityIndicator style={{ marginTop: 24 }} color={themeColors.primary} />
      </MobileScreen>
    );
  }

  if (!session) {
    return (
      <MobileScreen>
        <ScreenHeader title="Active Session" showBack />
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="desktop-access-disabled"
            title="No active session"
            description="Scan the QR code at your station to start a session."
          />
          <GoldButton
            title="Scan to Start"
            onPress={() => router.push('/join/qr')}
            variant="primary"
            icon={<MaterialIcons name="qr-code-scanner" size={20} color="#000" />}
          />
        </View>
      </MobileScreen>
    );
  }

  const clock = sessionClock(session);
  const timerStatus = session.status === 'paused' ? 'warning' : 'active';
  const todayCost = summary ? Number(summary.today.amountCharged) : 0;
  const balance = wallet ? Number(wallet.balance) : 0;

  return (
    <MobileScreen>
      <ScreenHeader title="Active Session" showBack />

      <View style={styles.container}>
        <TimerDisplay seconds={clock.seconds} status={timerStatus} label={clock.label} />

        <PremiumCard variant="secondary" style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: themeColors.mutedText }]}>Status</Text>
            <StatusBadge status={sessionBadgeStatus(session.status)} label={session.status} />
          </View>

          <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: themeColors.mutedText }]}>Station</Text>
            <Text style={[styles.detailValue, { color: themeColors.text }]}>
              {session.stationName}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: themeColors.mutedText }]}>Started</Text>
            <Text style={[styles.detailValue, { color: themeColors.text }]}>
              {formatTime(session.startedAt)}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: themeColors.mutedText }]}>Estimated End</Text>
            <Text style={[styles.detailValue, { color: themeColors.text }]}>
              {session.scheduledEndAt ? formatTime(session.scheduledEndAt) : 'Open'}
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: themeColors.mutedText }]}>Spent Today</Text>
            <Text style={[styles.balanceValue, { color: themeColors.accent }]}>
              {formatCurrency(todayCost)}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: themeColors.mutedText }]}>Wallet Balance</Text>
            <Text style={[styles.balanceValue, { color: themeColors.accent }]}>
              {formatCurrency(balance)}
            </Text>
          </View>
        </PremiumCard>

        <View style={styles.actions}>
          <GoldButton
            title="Extend Time"
            onPress={staffInfo}
            variant="outline"
            icon={<MaterialIcons name="more-time" size={24} color={themeColors.primary} />}
          />
          <View style={styles.secondaryActions}>
            <GoldButton
              title="Notify Staff"
              onPress={staffInfo}
              variant="outline"
              style={{ flex: 1 }}
              icon={<MaterialIcons name="notifications" size={20} color={themeColors.primary} />}
            />
            <GoldButton
              title="End Session"
              onPress={staffInfo}
              variant="outline"
              style={{ flex: 1, borderColor: themeColors.danger }}
              textStyle={{ color: themeColors.danger }}
              icon={<MaterialIcons name="power-settings-new" size={20} color={themeColors.danger} />}
            />
          </View>
        </View>

        <Text style={[styles.disclaimer, { color: themeColors.mutedText }]}>
          Extend or end your session at the counter.
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
  emptyWrap: {
    paddingHorizontal: 24,
    paddingTop: 48,
    gap: 24,
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
