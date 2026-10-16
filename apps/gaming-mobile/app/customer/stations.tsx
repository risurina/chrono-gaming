import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { MobileScreen } from '../../components/layout/MobileScreen';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { useRouter } from 'expo-router';
import { StationTile } from '../../components/customer/StationTile';
import { ReserveSheet } from '../../components/customer/ReserveSheet';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Colors } from '../../constants/theme';
import { useApi } from '../../lib/ApiContext';
import { ApiError } from '../../lib/mobile-api-client';
import { tokenStorage } from '../../lib/token-storage';
import { logger } from '../../lib/logger';
import {
  PublicStation,
  StationAvailabilityResponse,
} from '../../constants/schemas/station';

const REFRESH_INTERVAL_MS = 20_000;

export default function StationsScreen() {
  const themeColors = Colors.dark;
  const api = useApi();
  const router = useRouter();
  const [data, setData] = useState<StationAvailabilityResponse | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reserveTarget, setReserveTarget] = useState<PublicStation | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (tenantSlug: string) => {
      try {
        const availability = await api.stations.availability(tenantSlug);
        setData(availability as StationAvailabilityResponse);
        setError(null);
      } catch (e: any) {
        logger.error('Failed to load station availability:', e);
        setError(e?.message || 'Failed to load live station availability.');
      }
    },
    [api],
  );

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setInterval> | undefined;

    (async () => {
      const tenantSlug = await tokenStorage.getTenantSlug();
      if (!mounted) return;
      setSlug(tenantSlug);
      if (tenantSlug) {
        await load(tenantSlug);
        timer = setInterval(() => load(tenantSlug), REFRESH_INTERVAL_MS);
      }
      setLoading(false);
    })();

    return () => {
      mounted = false;
      if (timer) clearInterval(timer);
    };
  }, [load]);

  const onRefresh = useCallback(async () => {
    if (!slug) return;
    setRefreshing(true);
    await load(slug);
    setRefreshing(false);
  }, [slug, load]);

  const handleConfirmReserve = async (durationMinutes: number) => {
    if (!reserveTarget) return;
    setSubmitting(true);
    try {
      await api.reservations.create({ stationId: reserveTarget.id, durationMinutes });
      setReserveTarget(null);
      Alert.alert('Reserved', 'Your station has been reserved.', [
        { text: 'View Reservations', onPress: () => router.push('/customer/reservations') },
        { text: 'OK', style: 'cancel' },
      ]);
      if (slug) await load(slug);
    } catch (e: any) {
      // Surface high-value envelope error codes with actionable guidance.
      if (e instanceof ApiError && e.code === 'INSUFFICIENT_BALANCE') {
        Alert.alert(
          'Top-up needed',
          'You need time credits or wallet balance to reserve a station. Please top up at the counter first.',
        );
      } else if (e instanceof ApiError && e.code === 'RESERVATIONS_PAUSED') {
        const reopensAt = e.details?.reopensAt;
        Alert.alert(
          'Reservations paused',
          reopensAt
            ? `Reservations are paused until ${new Date(reopensAt).toLocaleString()}. Please try again after that.`
            : 'Reservations are paused right now. Please try again later.',
        );
      } else {
        Alert.alert('Could not reserve', e.message || 'Failed to reserve this station.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <MobileScreen>
        <ScreenHeader title="Live Stations" showBack />
        <ActivityIndicator style={{ marginTop: 24 }} color={themeColors.primary} />
      </MobileScreen>
    );
  }

  if (slug && !data && error) {
    return (
      <MobileScreen>
        <ScreenHeader title="Live Stations" showBack />
        <View style={styles.container}>
          <ErrorBanner message={error} onRetry={() => load(slug)} />
        </View>
      </MobileScreen>
    );
  }

  if (!slug || !data) {
    return (
      <MobileScreen>
        <ScreenHeader title="Live Stations" showBack />
        <View style={styles.container}>
          <EmptyState
            icon="grid-view"
            title="No cafe linked"
            description="Join a cafe to see its live station availability."
          />
        </View>
      </MobileScreen>
    );
  }

  return (
    <MobileScreen onRefresh={onRefresh} refreshing={refreshing}>
      <ScreenHeader title="Live Stations" showBack />

      <View style={styles.container}>
        {error && <ErrorBanner message={error} onRetry={() => load(slug)} />}
        <View style={styles.summary}>
          <Text style={[styles.summaryText, { color: themeColors.mutedText }]}>
            {data.summary.available} available · {data.summary.inUse} in use · {data.summary.reserved} reserved
          </Text>
          <View style={styles.links}>
            <TouchableOpacity onPress={() => router.push('/customer/reservations')}>
              <Text style={[styles.link, { color: themeColors.primary }]}>My Reservations</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/customer/branch')}>
              <Text style={[styles.link, { color: themeColors.primary }]}>Branch Info</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.grid}>
          {data.stations.map((station) => (
            <StationTile key={station.id} station={station} onReserve={setReserveTarget} />
          ))}
        </View>
      </View>

      <ReserveSheet
        visible={!!reserveTarget}
        station={reserveTarget}
        submitting={submitting}
        onConfirm={handleConfirmReserve}
        onClose={() => setReserveTarget(null)}
      />
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 16,
  },
  summary: {
    alignItems: 'center',
    gap: 8,
  },
  summaryText: {
    fontSize: 13,
    fontWeight: '600',
  },
  links: {
    flexDirection: 'row',
    gap: 20,
  },
  link: {
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
});
