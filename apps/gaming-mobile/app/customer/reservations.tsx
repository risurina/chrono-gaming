import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { MobileScreen } from '../../components/layout/MobileScreen';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { PremiumCard } from '../../components/ui/PremiumCard';
import { GoldButton } from '../../components/ui/GoldButton';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Colors } from '../../constants/theme';
import { useApi } from '../../lib/ApiContext';
import { formatCurrency, formatDate, formatTime } from '../../lib/format';
import { logger } from '../../lib/logger';
import type { MyReservation, PublicStations } from '../../constants/schemas/api';

const QUEUE_DURATION_MINUTES = 60;

export default function ReservationsScreen() {
  const themeColors = Colors.dark;
  const api = useApi();
  const [mine, setMine] = useState<MyReservation | null>(null);
  const [stations, setStations] = useState<PublicStations | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, s] = await Promise.all([
        api.reservations.mine(),
        api.public.stations().catch(() => null),
      ]);
      setMine(m);
      setStations(s);
    } catch (e) {
      logger.error('Failed to load reservations:', e);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const stationName = (stationId: string) => {
    for (const b of stations?.branches ?? []) {
      const found = b.stations.find((st) => st.id === stationId);
      if (found) return found.name;
    }
    return stationId;
  };

  const cancel = (id: string) => {
    Alert.alert('Cancel reservation', 'Are you sure you want to cancel?', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel it',
        style: 'destructive',
        onPress: async () => {
          setBusyId(id);
          try {
            const result = await api.reservations.cancel(id);
            await load();
            if (result.isLate && result.feeAmount) {
              Alert.alert('Cancelled', `A late-cancellation fee of ${formatCurrency(Number(result.feeAmount))} was applied.`);
            }
          } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not cancel the reservation.');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const joinQueue = async (stationId: string) => {
    setBusyId(stationId);
    try {
      await api.reservations.joinQueue({ stationId, durationMinutes: QUEUE_DURATION_MINUTES });
      await load();
      Alert.alert('Joined queue', 'You have joined the queue for this station.');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not join the queue.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <MobileScreen>
        <ScreenHeader title="Reservations" showBack />
        <ActivityIndicator style={{ marginTop: 24 }} color={themeColors.primary} />
      </MobileScreen>
    );
  }

  const current = mine?.reservation ?? null;
  const allStations = (stations?.branches ?? []).flatMap((b) => b.stations);

  return (
    <MobileScreen>
      <ScreenHeader title="Reservations" showBack />
      <View style={styles.container}>
        {current ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: themeColors.mutedText }]}>
              YOUR RESERVATION
            </Text>
            <PremiumCard variant="gold-border" style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={[styles.stationName, { color: themeColors.text }]}>
                  {stationName(current.stationId)}
                </Text>
                <StatusBadge status="active" label={current.status.replace('_', ' ')} />
              </View>
              {mine?.queuePosition != null ? (
                <Text style={[styles.detail, { color: themeColors.primary }]}>
                  Queue position: {mine.queuePosition}
                </Text>
              ) : null}
              {current.startAt ? (
                <Text style={[styles.detail, { color: themeColors.mutedText }]}>
                  {formatDate(current.startAt)} at {formatTime(current.startAt)}
                </Text>
              ) : null}
              <GoldButton
                title={busyId === current.id ? 'Cancelling…' : 'Cancel'}
                onPress={() => cancel(current.id)}
                variant="outline"
                disabled={busyId !== null}
                style={{ marginTop: 8, borderColor: themeColors.danger }}
                textStyle={{ color: themeColors.danger }}
              />
            </PremiumCard>
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: themeColors.mutedText }]}>JOIN A QUEUE</Text>
            {allStations.length > 0 ? (
              allStations.map((st) => (
                <PremiumCard key={st.id} variant="secondary" style={styles.stationCard}>
                  <View style={styles.rowLeft}>
                    <Text style={[styles.stationName, { color: themeColors.text }]}>{st.name}</Text>
                    <Text style={[styles.detail, { color: themeColors.mutedText }]}>
                      {st.stationType} • {st.status}
                    </Text>
                  </View>
                  <GoldButton
                    title={busyId === st.id ? '…' : 'Queue'}
                    onPress={() => joinQueue(st.id)}
                    disabled={busyId !== null}
                    style={styles.queueButton}
                  />
                </PremiumCard>
              ))
            ) : (
              <EmptyState
                icon="event-seat"
                title="No stations available"
                description="Reservations and queues aren't available right now."
              />
            )}
          </View>
        )}
      </View>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 24, paddingTop: 12, gap: 24 },
  section: { gap: 12 },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  card: { gap: 8, padding: 20 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stationName: { fontSize: 16, fontWeight: '800' },
  detail: { fontSize: 13 },
  stationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  rowLeft: { flex: 1, paddingRight: 12 },
  queueButton: { height: 40, paddingHorizontal: 16 },
});
