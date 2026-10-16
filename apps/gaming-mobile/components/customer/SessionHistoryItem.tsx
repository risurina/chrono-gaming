import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { PortalSessionSummary } from '../../constants/schemas/api';
import { Colors } from '../../constants/theme';
import { formatCurrency, formatDate, formatDuration } from '../../lib/format';
import { StatusBadge } from '../ui/StatusBadge';
import { sessionBadgeStatus } from './ActiveSessionCard';

interface SessionHistoryItemProps {
  item: PortalSessionSummary;
}

export const SessionHistoryItem: React.FC<SessionHistoryItemProps> = ({ item }) => {
  const themeColors = Colors.dark;

  const durationLabel =
    item.actualBillableSeconds != null
      ? formatDuration(Math.round(item.actualBillableSeconds / 60))
      : '—';
  const costLabel = item.amountCharged != null ? formatCurrency(Number(item.amountCharged)) : '—';

  return (
    <View style={[styles.container, { borderBottomColor: themeColors.border }]}>
      <View style={styles.row}>
        <View>
          <Text style={[styles.branch, { color: themeColors.text }]}>{item.stationName}</Text>
          <Text style={[styles.details, { color: themeColors.mutedText }]}>
            {formatDate(item.startedAt)}
          </Text>
        </View>
        <StatusBadge status={sessionBadgeStatus(item.status)} label={item.status} />
      </View>

      <View style={styles.footer}>
        <Text style={[styles.duration, { color: themeColors.mutedText }]}>
          Duration: {durationLabel}
        </Text>
        <Text style={[styles.cost, { color: themeColors.text }]}>{costLabel}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  branch: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  details: {
    fontSize: 13,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  duration: {
    fontSize: 14,
  },
  cost: {
    fontSize: 16,
    fontWeight: '700',
  },
});
