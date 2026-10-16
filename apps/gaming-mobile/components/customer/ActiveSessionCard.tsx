import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { PremiumCard } from '../ui/PremiumCard';
import { StatusBadge } from '../ui/StatusBadge';
import { Colors } from '../../constants/theme';
import { formatTimeRemaining } from '../../lib/format';
import type { ActiveSession } from '../../constants/schemas/api';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

interface ActiveSessionCardProps {
  session: ActiveSession;
  branchName?: string;
}

/** Map the API session status onto the StatusBadge palette. */
export function sessionBadgeStatus(
  status: 'active' | 'paused' | 'ended',
): 'active' | 'warning' | 'muted' {
  if (status === 'active') return 'active';
  if (status === 'paused') return 'warning';
  return 'muted';
}

/** Seconds remaining until scheduled end, or elapsed for an open-ended session. */
export function sessionClock(session: Pick<ActiveSession, 'startedAt' | 'scheduledEndAt'>): {
  seconds: number;
  label: string;
} {
  const now = Date.now();
  if (session.scheduledEndAt) {
    const end = new Date(session.scheduledEndAt).getTime();
    return { seconds: Math.max(0, Math.floor((end - now) / 1000)), label: 'TIME REMAINING' };
  }
  const start = new Date(session.startedAt).getTime();
  return { seconds: Math.max(0, Math.floor((now - start) / 1000)), label: 'ELAPSED' };
}

export const ActiveSessionCard: React.FC<ActiveSessionCardProps> = ({ session, branchName }) => {
  const themeColors = Colors.dark;
  const router = useRouter();
  const clock = sessionClock(session);

  return (
    <TouchableOpacity onPress={() => router.push('/customer/session')} activeOpacity={0.9}>
      <PremiumCard variant="gold-border" style={styles.container} withGlow>
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: themeColors.text }]}>
              {session.stationName.toUpperCase()}
            </Text>
            {branchName ? (
              <Text style={[styles.subtitle, { color: themeColors.mutedText }]}>{branchName}</Text>
            ) : null}
          </View>
          <StatusBadge status={sessionBadgeStatus(session.status)} label={session.status} />
        </View>

        <View style={styles.timerContainer}>
          <View style={styles.iconContainer}>
            <MaterialIcons name="timer" size={24} color={themeColors.primary} />
          </View>
          <View>
            <Text style={[styles.timerLabel, { color: themeColors.mutedText }]}>{clock.label}</Text>
            <Text style={[styles.timer, { color: themeColors.primary, fontFamily: 'monospace' }]}>
              {formatTimeRemaining(clock.seconds)}
            </Text>
          </View>
        </View>
      </PremiumCard>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 24,
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(244, 201, 93, 0.1)',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(244, 201, 93, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 2,
  },
  timer: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -1,
  },
});
