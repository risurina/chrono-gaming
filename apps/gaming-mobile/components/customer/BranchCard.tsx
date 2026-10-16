import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PremiumCard } from '../ui/PremiumCard';
import { Colors } from '../../constants/theme';
import { MaterialIcons } from '@expo/vector-icons';

interface BranchCardProps {
  name: string;
  address?: string | null;
  operatingHours?: string | null;
  availableStations?: number;
  totalStations?: number;
  rateLabel?: string;
}

export const BranchCard: React.FC<BranchCardProps> = ({
  name,
  address,
  operatingHours,
  availableStations,
  totalStations,
  rateLabel,
}) => {
  const themeColors = Colors.dark;

  return (
    <PremiumCard variant="default" style={styles.container}>
      <Text style={[styles.name, { color: themeColors.primary }]}>{name}</Text>

      {address ? (
        <View style={styles.infoRow}>
          <MaterialIcons name="location-on" size={16} color={themeColors.mutedText} />
          <Text style={[styles.infoText, { color: themeColors.mutedText }]}>{address}</Text>
        </View>
      ) : null}

      {operatingHours ? (
        <View style={styles.infoRow}>
          <MaterialIcons name="access-time" size={16} color={themeColors.mutedText} />
          <Text style={[styles.infoText, { color: themeColors.mutedText }]}>{operatingHours}</Text>
        </View>
      ) : null}

      <View style={styles.statsContainer}>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: themeColors.text }]}>
            {availableStations ?? '—'}
            {totalStations != null ? `/${totalStations}` : ''}
          </Text>
          <Text style={[styles.statLabel, { color: themeColors.mutedText }]}>Available</Text>
        </View>
        <View style={[styles.divider, { backgroundColor: themeColors.border }]} />
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: themeColors.text }]}>{rateLabel ?? '—'}</Text>
          <Text style={[styles.statLabel, { color: themeColors.mutedText }]}>Rate</Text>
        </View>
      </View>
    </PremiumCard>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    fontSize: 14,
    flex: 1,
  },
  statsContainer: {
    flexDirection: 'row',
    marginTop: 8,
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
});
