import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { PremiumCard } from '../ui/PremiumCard';
import { StatusBadge } from '../ui/StatusBadge';
import { Colors } from '../../constants/theme';
import { formatTimeRemaining } from '../../lib/format';
import { ActiveSession } from '../../constants/schemas/session';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

interface ActiveSessionCardProps {
  Session: ActiveSession;
}

export const ActiveSessionCard: React.FC<ActiveSessionCardProps> = ({ Session }) => {
  const themeColors = Colors.dark;
  const router = useRouter();

  return (
    <TouchableOpacity onPress={() => router.push('/customer/Session')} activeOpacity={0.9}>
      <PremiumCard variant="gold-border" style={styles.container} withGlow>
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: themeColors.text }]}>{Session.stationName.toUpperCase()}</Text>
            <Text style={[styles.subtitle, { color: themeColors.mutedText }]}>{Session.branchName}</Text>
          </View>
          <StatusBadge status={Session.status} label={Session.status.toUpperCase()} />
        </View>

        <View style={styles.timerContainer}>
          <View style={styles.iconContainer}>
            <MaterialIcons name="timer" size={24} color={themeColors.primary} />
          </View>
          <View>
            <Text style={[styles.timerLabel, { color: themeColors.mutedText }]}>TIME REMAINING</Text>
            <Text style={[styles.timer, { color: themeColors.primary, fontFamily: 'monospace' }]}>
              {formatTimeRemaining(Session.timeRemainingSeconds)}
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
