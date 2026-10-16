import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { MobileScreen } from '../../components/layout/MobileScreen';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { PremiumCard } from '../../components/ui/PremiumCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { Colors } from '../../constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useApi } from '../../lib/ApiContext';
import { formatCurrency, formatDate } from '../../lib/format';
import { logger } from '../../lib/logger';
import type { ActivityEvent, ActivityType } from '../../constants/schemas/api';

const ICONS: Record<ActivityType, string> = {
  wallet: 'account-balance-wallet',
  credit: 'schedule',
  session: 'timer',
  reservation: 'event-seat',
};

export default function ActivityScreen() {
  const themeColors = Colors.dark;
  const api = useApi();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const result = await api.activity.list({ pageSize: 50 });
        if (mounted) setEvents(result.items);
      } catch (e) {
        logger.error('Failed to load activity:', e);
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
        <ScreenHeader title="Activity" showBack />
        <ActivityIndicator style={{ marginTop: 24 }} color={themeColors.primary} />
      </MobileScreen>
    );
  }

  return (
    <MobileScreen>
      <ScreenHeader title="Activity" showBack />
      <View style={styles.container}>
        {events.length > 0 ? (
          <PremiumCard variant="default">
            {events.map((e) => (
              <View key={e.id} style={[styles.row, { borderBottomColor: themeColors.border }]}>
                <View style={[styles.iconContainer, { backgroundColor: themeColors.surface }]}>
                  <MaterialIcons
                    name={(ICONS[e.type] ?? 'history') as any}
                    size={22}
                    color={themeColors.primary}
                  />
                </View>
                <View style={styles.content}>
                  <Text style={[styles.title, { color: themeColors.text }]}>{e.title}</Text>
                  <Text style={[styles.description, { color: themeColors.mutedText }]}>
                    {e.description}
                  </Text>
                  <Text style={[styles.date, { color: themeColors.mutedText }]}>
                    {formatDate(e.occurredAt)}
                  </Text>
                </View>
                {e.amount != null ? (
                  <Text style={[styles.amount, { color: themeColors.text }]}>
                    {formatCurrency(Number(e.amount))}
                  </Text>
                ) : null}
              </View>
            ))}
          </PremiumCard>
        ) : (
          <EmptyState
            icon="history"
            title="No activity yet"
            description="Your wallet, sessions, and credits will show up here."
          />
        )}
      </View>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 24, paddingTop: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  content: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700' },
  description: { fontSize: 13, marginTop: 1 },
  date: { fontSize: 11, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: '700', marginLeft: 8 },
});
