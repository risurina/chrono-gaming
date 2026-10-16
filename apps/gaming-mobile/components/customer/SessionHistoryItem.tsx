import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SessionHistoryItem as HistoryType } from '../../constants/schemas/history';
import { Colors } from '../../constants/theme';
import { formatCurrency, formatDate, formatDuration } from '../../lib/format';
import { StatusBadge } from '../ui/StatusBadge';

interface SessionHistoryItemProps {
  item: HistoryType;
}

export const SessionHistoryItem: React.FC<SessionHistoryItemProps> = ({ item }) => {
  const themeColors = Colors.dark;

  return (
    <View style={[styles.container, { borderBottomColor: themeColors.border }]}>
      <View style={styles.row}>
        <View>
          <Text style={[styles.Branch, { color: themeColors.text }]}>{item.branchName}</Text>
          <Text style={[styles.details, { color: themeColors.mutedText }]}>
            {formatDate(item.date)} • {item.stationName}
          </Text>
        </View>
        <StatusBadge status="muted" label={item.status} />
      </View>

      <View style={styles.footer}>
        <Text style={[styles.duration, { color: themeColors.mutedText }]}>
          Duration: {formatDuration(item.durationMinutes)}
        </Text>
        <Text style={[styles.cost, { color: themeColors.text }]}>{formatCurrency(item.cost)}</Text>
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
  Branch: {
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
