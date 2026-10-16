import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { MobileScreen } from '../../components/layout/MobileScreen';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { SessionHistoryItem } from '../../components/customer/SessionHistoryItem';
import { PremiumCard } from '../../components/ui/PremiumCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Colors } from '../../constants/theme';
import { useApi } from '../../lib/ApiContext';
import { logger } from '../../lib/logger';
import {
  normalizeMemberSession,
  SessionHistoryItem as HistoryItem,
} from '../../constants/schemas/history';
import { RawMemberSession } from '../../constants/schemas/session';

export default function HistoryScreen() {
  const themeColors = Colors.dark;
  const api = useApi();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sessions = await api.session.getHistory();
      setItems((sessions as RawMemberSession[]).map(normalizeMemberSession));
    } catch (e: any) {
      logger.error('Failed to load session history:', e);
      setError(e?.message || 'Failed to load your session history.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <MobileScreen>
      <ScreenHeader title="Session History" showBack />

      <View style={styles.container}>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={themeColors.primary} />
        ) : error ? (
          <ErrorBanner message={error} onRetry={load} />
        ) : items.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: themeColors.mutedText }]}>PREVIOUS SESSIONS</Text>
            <PremiumCard variant="default">
              {items.map((item) => (
                <SessionHistoryItem key={item.id} item={item} />
              ))}
            </PremiumCard>
          </View>
        ) : (
          <EmptyState
            icon="history"
            title="No sessions yet"
            description="Start playing at your selected cafe to see your history here."
          />
        )}
      </View>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
