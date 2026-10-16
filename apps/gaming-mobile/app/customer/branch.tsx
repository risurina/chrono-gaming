import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { MobileScreen } from '../../components/layout/MobileScreen';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { BranchCard } from '../../components/customer/BranchCard';
import { PremiumCard } from '../../components/ui/PremiumCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { Colors } from '../../constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useApi } from '../../lib/ApiContext';
import { formatCurrency } from '../../lib/format';
import { logger } from '../../lib/logger';
import type { PublicStations, PublicVenueInfo } from '../../constants/schemas/api';

export default function BranchScreen() {
  const themeColors = Colors.dark;
  const api = useApi();
  const [venue, setVenue] = useState<PublicVenueInfo | null>(null);
  const [stations, setStations] = useState<PublicStations | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [v, s] = await Promise.all([
          api.public.venueInfo(),
          api.public.stations().catch(() => null),
        ]);
        if (!mounted) return;
        setVenue(v);
        setStations(s);
      } catch (e) {
        logger.error('Failed to load venue info:', e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [api]);

  if (loading) {
    return (
      <MobileScreen>
        <ScreenHeader title="Venue Info" showBack />
        <ActivityIndicator style={{ marginTop: 24 }} color={themeColors.primary} />
      </MobileScreen>
    );
  }

  const branch = venue?.branch;
  if (!branch) {
    return (
      <MobileScreen>
        <ScreenHeader title="Venue Info" showBack />
        <View style={{ paddingTop: 48 }}>
          <EmptyState
            icon="store"
            title="Venue info unavailable"
            description="Select a cafe to see its details, rates, and availability."
          />
        </View>
      </MobileScreen>
    );
  }

  const agg = stations?.aggregate;
  const firstRate = venue?.rateGroups?.[0];
  const rateLabel = firstRate
    ? `${formatCurrency(Number(firstRate.memberRate ?? firstRate.hourlyRate))}/hr`
    : undefined;

  return (
    <MobileScreen>
      <ScreenHeader title="Venue Info" showBack />

      <View style={styles.container}>
        <BranchCard
          name={branch.name}
          address={branch.address}
          operatingHours={branch.operatingHours}
          availableStations={agg?.available}
          totalStations={agg?.total}
          rateLabel={rateLabel}
        />

        {venue && venue.rateGroups.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: themeColors.mutedText }]}>RATES</Text>
            <PremiumCard variant="secondary">
              {venue.rateGroups.map((rg) => (
                <View key={rg.id} style={[styles.rateRow, { borderBottomColor: themeColors.border }]}>
                  <Text style={[styles.rateName, { color: themeColors.text }]}>{rg.name}</Text>
                  <View style={styles.rateValues}>
                    <Text style={[styles.rateValue, { color: themeColors.text }]}>
                      {formatCurrency(Number(rg.hourlyRate))}/hr
                    </Text>
                    {rg.memberRate != null ? (
                      <Text style={[styles.memberRate, { color: themeColors.primary }]}>
                        Member {formatCurrency(Number(rg.memberRate))}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </PremiumCard>
          </View>
        ) : null}

        {branch.contactNumber || branch.email ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: themeColors.mutedText }]}>CONTACT</Text>
            <PremiumCard variant="secondary">
              {branch.contactNumber ? (
                <View style={styles.contactRow}>
                  <MaterialIcons name="phone" size={18} color={themeColors.primary} />
                  <Text style={[styles.contactText, { color: themeColors.text }]}>
                    {branch.contactNumber}
                  </Text>
                </View>
              ) : null}
              {branch.email ? (
                <View style={styles.contactRow}>
                  <MaterialIcons name="email" size={18} color={themeColors.primary} />
                  <Text style={[styles.contactText, { color: themeColors.text }]}>{branch.email}</Text>
                </View>
              ) : null}
            </PremiumCard>
          </View>
        ) : null}
      </View>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 32,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  rateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  rateName: {
    fontSize: 15,
    fontWeight: '600',
  },
  rateValues: {
    alignItems: 'flex-end',
  },
  rateValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  memberRate: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  contactText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
