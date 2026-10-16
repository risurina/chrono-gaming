import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { MobileScreen } from '../../components/layout/MobileScreen';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { PremiumCard } from '../../components/ui/PremiumCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Colors } from '../../constants/theme';
import { useApi } from '../../lib/ApiContext';
import { tokenStorage } from '../../lib/token-storage';
import { logger } from '../../lib/logger';
import { formatCurrency } from '../../lib/format';
import { StationAvailabilityResponse } from '../../constants/schemas/station';

export default function BranchScreen() {
  const themeColors = Colors.dark;
  const api = useApi();
  const [data, setData] = useState<StationAvailabilityResponse | null>(null);
  const [branchName, setBranchName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasCafe, setHasCafe] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const slug = await tokenStorage.getTenantSlug();
      if (!slug) {
        setHasCafe(false);
        setLoading(false);
        return;
      }
      setHasCafe(true);
      const availability = await api.stations.availability(slug);
      setData(availability as StationAvailabilityResponse);
      setBranchName(
        (availability as StationAvailabilityResponse).stations[0]?.branchName || slug.toUpperCase(),
      );
    } catch (e: any) {
      logger.error('Failed to load branch info:', e);
      setError(e?.message || 'Failed to load branch information.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const total = data?.stations.length ?? 0;
  const available = data?.summary.available ?? 0;
  const indicativeRate = data?.stations.find((s) => typeof s.hourlyRate === 'number')?.hourlyRate ?? null;

  return (
    <MobileScreen>
      <ScreenHeader title="Branch Info" showBack />

      <View style={styles.container}>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={themeColors.primary} />
        ) : error ? (
          <ErrorBanner message={error} onRetry={load} />
        ) : !hasCafe || !data ? (
          <EmptyState
            icon="business"
            title="No cafe linked"
            description="Join a cafe to see its branch details and live station availability."
          />
        ) : (
          <>
            <PremiumCard variant="default" style={styles.summaryCard}>
              <Text style={[styles.name, { color: themeColors.primary }]}>{branchName}</Text>
              <View style={styles.statsContainer}>
                <View style={styles.stat}>
                  <Text style={[styles.statValue, { color: themeColors.text }]}>
                    {available}/{total}
                  </Text>
                  <Text style={[styles.statLabel, { color: themeColors.mutedText }]}>
                    Available Stations
                  </Text>
                </View>
                {indicativeRate !== null && (
                  <>
                    <View style={[styles.divider, { backgroundColor: themeColors.border }]} />
                    <View style={styles.stat}>
                      <Text style={[styles.statValue, { color: themeColors.text }]}>
                        {formatCurrency(indicativeRate)}/hr
                      </Text>
                      <Text style={[styles.statLabel, { color: themeColors.mutedText }]}>From</Text>
                    </View>
                  </>
                )}
              </View>
            </PremiumCard>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: themeColors.mutedText }]}>STATION STATUS</Text>
              <PremiumCard variant="secondary">
                <StatusRow label="Available" value={data.summary.available} color={themeColors.success} />
                <StatusRow label="In Use" value={data.summary.inUse} color={themeColors.primary} />
                <StatusRow label="Reserved" value={data.summary.reserved} color={themeColors.accent} />
                <StatusRow label="Offline" value={data.summary.offline ?? 0} color={themeColors.mutedText} />
              </PremiumCard>
            </View>
          </>
        )}
      </View>
    </MobileScreen>
  );
}

function StatusRow({ label, value, color }: { label: string; value: number; color: string }) {
  const themeColors = Colors.dark;
  return (
    <View style={styles.statusRow}>
      <View style={styles.statusLeft}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={[styles.statusLabel, { color: themeColors.text }]}>{label}</Text>
      </View>
      <Text style={[styles.statusValue, { color: themeColors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 32,
  },
  summaryCard: {
    gap: 16,
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(214, 168, 79, 0.1)',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
  },
  divider: {
    width: 1,
    height: '100%',
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  statusValue: {
    fontSize: 16,
    fontWeight: '700',
  },
});
