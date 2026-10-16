import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PremiumCard } from '../ui/PremiumCard';
import { StatusBadge } from '../ui/StatusBadge';
import { GoldButton } from '../ui/GoldButton';
import { Colors } from '../../constants/theme';
import { formatDate } from '../../lib/format';
import {
  MemberReservation,
  isReservationActive,
  isReservationHold,
} from '../../constants/schemas/reservation';

interface ReservationCardProps {
  reservation: MemberReservation;
  onCancel: (reservation: MemberReservation) => void;
  cancelling?: boolean;
  /** Called when the member confirms a live hold (status `hold`). */
  onConfirm?: (reservation: MemberReservation) => void;
  confirming?: boolean;
}

function badgeStatus(status: MemberReservation['status']): 'active' | 'warning' | 'muted' {
  if (status === 'confirmed' || status === 'checked_in' || status === 'hold') return 'active';
  if (status === 'pending') return 'warning';
  return 'muted';
}

/** Human-readable label for the status enum (e.g. `cancelled_late` → "cancelled late"). */
function statusLabel(status: MemberReservation['status']): string {
  return status.replace(/_/g, ' ');
}

export const ReservationCard: React.FC<ReservationCardProps> = ({
  reservation,
  onCancel,
  cancelling,
  onConfirm,
  confirming,
}) => {
  const themeColors = Colors.dark;
  // The summary list carries no station name; the station id is the only
  // stable identifier available here.
  const stationLabel = `Station ${reservation.stationId.slice(0, 8)}`;
  const showConfirm = isReservationHold(reservation) && !!onConfirm;

  return (
    <PremiumCard variant="default" style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.station, { color: themeColors.text }]}>{stationLabel}</Text>
          <Text style={[styles.meta, { color: themeColors.mutedText }]}>
            {reservation.requestedDurationMinutes
              ? `${reservation.requestedDurationMinutes} min`
              : 'Flexible'}
            {reservation.fromQueue ? ' · Queued' : ''}
          </Text>
        </View>
        <StatusBadge status={badgeStatus(reservation.status)} label={statusLabel(reservation.status)} />
      </View>

      {reservation.startAt && (
        <Text style={[styles.meta, { color: themeColors.mutedText }]}>
          Starts {formatDate(reservation.startAt)}
        </Text>
      )}

      {showConfirm && (
        <>
          <Text style={[styles.holdNotice, { color: themeColors.primary }]}>
            Your station is being held — confirm to lock in your reservation.
          </Text>
          <GoldButton
            title={confirming ? 'Confirming…' : 'Confirm Reservation'}
            onPress={() => onConfirm!(reservation)}
            disabled={confirming}
          />
        </>
      )}

      {isReservationActive(reservation) && (
        <GoldButton
          title={cancelling ? 'Cancelling…' : 'Cancel Reservation'}
          onPress={() => onCancel(reservation)}
          variant="outline"
          style={{ borderColor: themeColors.danger }}
          textStyle={{ color: themeColors.danger }}
        />
      )}
    </PremiumCard>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 12,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  station: {
    fontSize: 18,
    fontWeight: '800',
  },
  meta: {
    fontSize: 13,
    marginTop: 2,
  },
  holdNotice: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
});
