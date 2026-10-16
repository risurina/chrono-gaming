import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { MobileScreen } from '../../components/layout/MobileScreen';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { ReservationCard } from '../../components/customer/ReservationCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Colors } from '../../constants/theme';
import { useApi } from '../../lib/ApiContext';
import { logger } from '../../lib/logger';
import { MemberReservation } from '../../constants/schemas/reservation';

export default function ReservationsScreen() {
  const themeColors = Colors.dark;
  const api = useApi();
  const [reservations, setReservations] = useState<MemberReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await api.reservations.list();
      setReservations(rows as MemberReservation[]);
      setError(null);
    } catch (e: any) {
      logger.error('Failed to load reservations:', e);
      setError(e?.message || 'Failed to load your reservations.');
    }
  }, [api]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await load();
      if (mounted) setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Confirm an active hold (server promoted a queued reservation to CONFIRMED
  // with a grace window). Refresh the list on success AND failure so an
  // already-expired hold disappears instead of lingering.
  const handleConfirm = async (reservation: MemberReservation) => {
    setConfirmingId(reservation.id);
    try {
      await api.reservations.confirm(reservation.id);
      Alert.alert('Confirmed', 'Your reservation is confirmed. Head to your station!');
    } catch (e: any) {
      Alert.alert('Could not confirm', e.message || 'Failed to confirm this reservation.');
    } finally {
      setConfirmingId(null);
      await load();
    }
  };

  const handleCancel = (reservation: MemberReservation) => {
    Alert.alert('Cancel Reservation', 'Are you sure you want to cancel this reservation?', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel Reservation',
        style: 'destructive',
        onPress: async () => {
          setCancellingId(reservation.id);
          try {
            const result = await api.reservations.cancel(reservation.id);
            let message = 'Your reservation has been cancelled.';
            if (result?.isLate && result?.feeAmount) {
              message += ` A late-cancellation fee of ${result.feeAmount} was charged.`;
            }
            Alert.alert('Reservation Cancelled', message);
            await load();
          } catch (e: any) {
            Alert.alert('Error', e.message || 'Failed to cancel reservation');
          } finally {
            setCancellingId(null);
          }
        },
      },
    ]);
  };

  return (
    <MobileScreen onRefresh={onRefresh} refreshing={refreshing}>
      <ScreenHeader title="My Reservations" showBack />

      <View style={styles.container}>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={themeColors.primary} />
        ) : error ? (
          <ErrorBanner message={error} onRetry={onRefresh} />
        ) : reservations.length > 0 ? (
          <View style={styles.list}>
            <Text style={[styles.sectionTitle, { color: themeColors.mutedText }]}>ACTIVE RESERVATIONS</Text>
            {reservations.map((r) => (
              <ReservationCard
                key={r.id}
                reservation={r}
                onCancel={handleCancel}
                cancelling={cancellingId === r.id}
                onConfirm={handleConfirm}
                confirming={confirmingId === r.id}
              />
            ))}
          </View>
        ) : (
          <EmptyState
            icon="event-available"
            title="No reservations"
            description="Reserve an available station from the Live Stations screen."
          />
        )}
      </View>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  list: {
    gap: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
