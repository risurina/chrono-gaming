import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { MobileScreen } from '../../components/layout/MobileScreen';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { PremiumCard } from '../../components/ui/PremiumCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { Colors } from '../../constants/theme';
import { useApi } from '../../lib/ApiContext';
import { formatDate } from '../../lib/format';
import { logger } from '../../lib/logger';
import type { LoyaltyMe, LoyaltyTransaction } from '../../constants/schemas/api';

export default function LoyaltyScreen() {
  const themeColors = Colors.dark;
  const api = useApi();
  const [data, setData] = useState<LoyaltyMe | null>(null);
  const [history, setHistory] = useState<LoyaltyTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [me, hist] = await Promise.all([
          api.loyalty.me(),
          api.loyalty.history({ pageSize: 50 }).catch(() => ({ items: [], meta: null as any })),
        ]);
        if (!mounted) return;
        setData(me);
        setHistory(hist.items);
      } catch (e) {
        logger.error('Failed to load loyalty:', e);
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
        <ScreenHeader title="Loyalty" showBack />
        <ActivityIndicator style={{ marginTop: 24 }} color={themeColors.primary} />
      </MobileScreen>
    );
  }

  const points = data?.account?.pointsBalance ?? 0;
  const lifetime = data?.account?.lifetimePoints ?? 0;
  const tier = data?.level.tier ?? 'bronze';
  const progress = Math.max(0, Math.min(100, data?.level.progressPercent ?? 0));

  return (
    <MobileScreen>
      <ScreenHeader title="Loyalty" showBack />
      <View style={styles.container}>
        <PremiumCard variant="gold-border" withGlow style={styles.heroCard}>
          <View style={[styles.tierBadge, { backgroundColor: 'rgba(214, 168, 79, 0.12)' }]}>
            <Text style={[styles.tierText, { color: themeColors.primary }]}>{tier.toUpperCase()}</Text>
          </View>
          <Text style={[styles.pointsLabel, { color: themeColors.mutedText }]}>POINTS BALANCE</Text>
          <Text style={[styles.points, { color: themeColors.accent }]}>{points.toLocaleString()}</Text>
          <Text style={[styles.lifetime, { color: themeColors.mutedText }]}>
            {lifetime.toLocaleString()} lifetime points
          </Text>

          {data?.level.nextTier ? (
            <View style={styles.progressWrap}>
              <View style={[styles.progressTrack, { backgroundColor: themeColors.surface }]}>
                <View
                  style={[styles.progressFill, { width: `${progress}%`, backgroundColor: themeColors.primary }]}
                />
              </View>
              <Text style={[styles.progressLabel, { color: themeColors.mutedText }]}>
                {data.level.pointsToNext ?? 0} points to {data.level.nextTier}
              </Text>
            </View>
          ) : (
            <Text style={[styles.progressLabel, { color: themeColors.mutedText }]}>
              You&apos;ve reached the top tier!
            </Text>
          )}
        </PremiumCard>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.mutedText }]}>HISTORY</Text>
          {history.length > 0 ? (
            <PremiumCard variant="default">
              {history.map((tx) => {
                const positive = tx.type === 'earn';
                return (
                  <View key={tx.id} style={[styles.row, { borderBottomColor: themeColors.border }]}>
                    <View style={styles.rowLeft}>
                      <Text style={[styles.reason, { color: themeColors.text }]}>{tx.reason}</Text>
                      <Text style={[styles.date, { color: themeColors.mutedText }]}>
                        {formatDate(tx.createdAt)}
                      </Text>
                    </View>
                    <Text
                      style={[styles.points2, { color: positive ? themeColors.success : themeColors.text }]}
                    >
                      {positive ? '+' : ''}
                      {tx.points}
                    </Text>
                  </View>
                );
              })}
            </PremiumCard>
          ) : (
            <EmptyState icon="stars" title="No points yet" description="Earn points as you play." />
          )}
        </View>
      </View>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 24, paddingTop: 12, gap: 32 },
  heroCard: { alignItems: 'center', gap: 6, paddingVertical: 28 },
  tierBadge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, marginBottom: 8 },
  tierText: { fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  pointsLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  points: { fontSize: 44, fontWeight: '900' },
  lifetime: { fontSize: 13 },
  progressWrap: { width: '100%', marginTop: 16, gap: 8 },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
  progressLabel: { fontSize: 12, textAlign: 'center' },
  section: { gap: 12 },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  rowLeft: { flex: 1 },
  reason: { fontSize: 15, fontWeight: '600' },
  date: { fontSize: 12, marginTop: 2 },
  points2: { fontSize: 16, fontWeight: '800' },
});
