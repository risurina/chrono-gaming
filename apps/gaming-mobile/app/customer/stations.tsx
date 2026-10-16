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
import { tokenStorage } from '../../lib/token-storage';
import { logger } from '../../lib/logger';
import {
  PublicStation,
  StationAvailabilityResponse,
  getAllStations,
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

  const load = useCallback(async () => {
    try {
      // Tenant is resolved server-side from the stored slug (x-tenant-slug).
      const availability = await api.stations.availability();
      setData(availability as StationAvailabilityResponse);
      setError(null);
    } catch (e: any) {
      logger.error('Failed to load station availability:', e);
      setError(e?.message || 'Failed to load live station availability.');
    }
  }, [api]);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setInterval> | undefined;

    (async () => {
      const tenantSlug = await tokenStorage.getTenantSlug();
      if (!mounted) return;
      setSlug(tenantSlug);
      if (tenantSlug) {
        await load();
        timer = setInterval(() => load(), REFRESH_INTERVAL_MS);
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
    await load();
    setRefreshing(false);
  }, [slug, load]);

  const handleConfirmReserve = async (durationMinutes: number) => {
    if (!reserveTarget) return;
    setSubmitting(true);
    try {
      // gaming-api requires a start time. The UI has no slot picker, so reserve
      // for immediate ("now") start; the server rejects a slot it cannot honor.
      await api.reservations.create({
        stationId: reserveTarget.id,
        startAt: new Date().toISOString(),
        durationMinutes,
      });
      setReserveTarget(null);
      Alert.alert('Reserved', 'Your station has been reserved.', [
        { text: 'View Reservations', onPress: () => router.push('/customer/reservations') },
        { text: 'OK', style: 'cancel' },
      ]);
      if (slug) await load();
    } catch (e: any) {
      // gaming-api returns a plain `{ error: "message" }` string — surface it.
      Alert.alert('Could not reserve', e?.message || 'Failed to reserve this station.');
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
          <ErrorBanner message={error} onRetry={() => load()} />
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
        {error && <ErrorBanner message={error} onRetry={() => load()} />}
        <View style={styles.summary}>
          <Text style={[styles.summaryText, { color: themeColors.mutedText }]}>
            {data.aggregate.available} available · {data.aggregate.occupied} in use ·{' '}
            {data.aggregate.unavailable} unavailable
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
          {getAllStations(data).map((station) => (
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
