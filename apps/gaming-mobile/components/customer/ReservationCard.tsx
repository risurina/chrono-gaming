import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PremiumCard } from '../ui/PremiumCard';
import { StatusBadge } from '../ui/StatusBadge';
import { GoldButton } from '../ui/GoldButton';
import { Colors } from '../../constants/theme';
import { formatDate } from '../../lib/format';
import { MemberReservation, isReservationActive } from '../../constants/schemas/reservation';

interface ReservationCardProps {
  reservation: MemberReservation;
  onCancel: (reservation: MemberReservation) => void;
  cancelling?: boolean;
  /** Called when the member confirms an active hold (status CONFIRMED). */
  onConfirm?: (reservation: MemberReservation) => void;
  confirming?: boolean;
}

function badgeStatus(status: MemberReservation['status']): 'active' | 'warning' | 'muted' {
  if (status === 'CONFIRMED' || status === 'CHECKED_IN') return 'active';
  if (status === 'PENDING') return 'warning';
  return 'muted';
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Seconds remaining until `iso`, or null when absent/past. */
function secondsUntil(iso: string | null): number | null {
  if (!iso) return null;
  const remaining = Math.floor((new Date(iso).getTime() - Date.now()) / 1000);
  return remaining > 0 ? remaining : null;
}

export const ReservationCard: React.FC<ReservationCardProps> = ({
  reservation,
  onCancel,
  cancelling,
  onConfirm,
  confirming,
}) => {
  const themeColors = Colors.dark;
  const stationLabel = reservation.stationName || `#${reservation.stationNumber ?? '—'}`;

  // Live countdown to the grace deadline while the hold awaits confirmation.
  const hasHold = reservation.status === 'CONFIRMED' && !!secondsUntil(reservation.graceExpiresAt);
  const [graceSecondsLeft, setGraceSecondsLeft] = useState<number | null>(() =>
    secondsUntil(reservation.graceExpiresAt),
  );

  useEffect(() => {
    if (reservation.status !== 'CONFIRMED' || !reservation.graceExpiresAt) {
      setGraceSecondsLeft(null);
      return;
    }
    setGraceSecondsLeft(secondsUntil(reservation.graceExpiresAt));
    const timer = setInterval(() => {
      setGraceSecondsLeft(secondsUntil(reservation.graceExpiresAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [reservation.status, reservation.graceExpiresAt]);

  const showConfirm = hasHold && graceSecondsLeft !== null && !!onConfirm;

  return (
    <PremiumCard variant="default" style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.station, { color: themeColors.text }]}>{stationLabel}</Text>
          <Text style={[styles.meta, { color: themeColors.mutedText }]}>
            {reservation.durationMinutes} min
            {reservation.fromQueue && reservation.queuePosition
              ? ` · Queue #${reservation.queuePosition}`
              : ''}
          </Text>
        </View>
        <StatusBadge status={badgeStatus(reservation.status)} label={reservation.status} />
      </View>

      {reservation.startTime && (
        <Text style={[styles.meta, { color: themeColors.mutedText }]}>
          Starts {formatDate(reservation.startTime)}
        </Text>
      )}

      {showConfirm && (
        <>
          <Text style={[styles.holdNotice, { color: themeColors.primary }]}>
            Your station is being held — confirm within {formatCountdown(graceSecondsLeft!)} or the
            hold expires.
          </Text>
          <GoldButton
            title={
              confirming
                ? 'Confirming…'
                : `Confirm Reservation (${formatCountdown(graceSecondsLeft!)})`
            }
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
