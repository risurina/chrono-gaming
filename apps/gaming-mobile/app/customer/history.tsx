import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { MobileScreen } from '../../components/layout/MobileScreen';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { SessionHistoryItem } from '../../components/customer/SessionHistoryItem';
import { PremiumCard } from '../../components/ui/PremiumCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { Colors } from '../../constants/theme';
import { useApi } from '../../lib/ApiContext';
import { logger } from '../../lib/logger';
import type { PortalSessionSummary } from '../../constants/schemas/api';

export default function HistoryScreen() {
  const themeColors = Colors.dark;
  const api = useApi();
  const [sessions, setSessions] = useState<PortalSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const result = await api.sessions.list({ pageSize: 50 });
        if (mounted) setSessions(result.items);
      } catch (e) {
        logger.error('Failed to load session history:', e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [api]);

  return (
    <MobileScreen>
      <ScreenHeader title="Session History" showBack />

      <View style={styles.container}>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={themeColors.primary} />
        ) : sessions.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: themeColors.mutedText }]}>
              PREVIOUS SESSIONS
            </Text>
            <PremiumCard variant="default">
              {sessions.map((item) => (
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
