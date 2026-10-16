import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { PremiumCard } from '../ui/PremiumCard';
import { Colors } from '../../constants/theme';
import { formatCurrency } from '../../lib/format';
import {
  PublicStation,
  STATION_STATUS_LABELS,
  StationStatus,
  isStationReservable,
} from '../../constants/schemas/station';

interface StationTileProps {
  station: PublicStation;
  onReserve?: (station: PublicStation) => void;
}

const STATUS_COLOR: Record<StationStatus, keyof typeof Colors.dark> = {
  available: 'success',
  inUse: 'primary',
  reserved: 'accent',
  maintenance: 'mutedText',
  locked: 'danger',
  offline: 'mutedText',
};

export const StationTile: React.FC<StationTileProps> = ({ station, onReserve }) => {
  const themeColors = Colors.dark;
  const color = themeColors[STATUS_COLOR[station.status]];
  const reservable = isStationReservable(station);

  return (
    <PremiumCard variant="default" style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.code, { color: themeColors.text }]}>#{station.stationCode}</Text>
        <View style={[styles.statusDot, { backgroundColor: color }]} />
      </View>

      <Text style={[styles.status, { color }]}>
        {STATION_STATUS_LABELS[station.status]}
        {station.queueLength ? ` · ${station.queueLength} in queue` : ''}
      </Text>

      {typeof station.hourlyRate === 'number' && (
        <Text style={[styles.rate, { color: themeColors.mutedText }]}>
          {formatCurrency(station.hourlyRate)}/hr
        </Text>
      )}

      {reservable && onReserve && (
        <TouchableOpacity
          style={[styles.reserveBtn, { borderColor: themeColors.primary }]}
          onPress={() => onReserve(station)}
        >
          <MaterialIcons name="event-available" size={16} color={themeColors.primary} />
          <Text style={[styles.reserveText, { color: themeColors.primary }]}>Reserve</Text>
        </TouchableOpacity>
      )}
    </PremiumCard>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minWidth: '45%',
    gap: 8,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  code: {
    fontSize: 18,
    fontWeight: '800',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  status: {
    fontSize: 12,
    fontWeight: '700',
  },
  rate: {
    fontSize: 12,
  },
  reserveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  reserveText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
