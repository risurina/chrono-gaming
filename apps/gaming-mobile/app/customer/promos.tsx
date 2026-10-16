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
import type { Promo } from '../../constants/schemas/api';

export default function PromosScreen() {
  const themeColors = Colors.dark;
  const api = useApi();
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const items = await api.promos.list();
        if (mounted) setPromos(items);
      } catch (e) {
        logger.error('Failed to load promos:', e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [api]);

  const discountLabel = (p: Promo) =>
    p.discountType === 'percentage'
      ? `${Number(p.discountValue)}% OFF`
      : `${formatCurrency(Number(p.discountValue))} OFF`;

  if (loading) {
    return (
      <MobileScreen>
        <ScreenHeader title="Promos" showBack />
        <ActivityIndicator style={{ marginTop: 24 }} color={themeColors.primary} />
      </MobileScreen>
    );
  }

  return (
    <MobileScreen>
      <ScreenHeader title="Promos" showBack />
      <View style={styles.container}>
        {promos.length > 0 ? (
          promos.map((p) => (
            <PremiumCard key={p.id} variant="gold-border" style={styles.card}>
              <View style={styles.cardHeader}>
                <MaterialIcons name="local-offer" size={22} color={themeColors.accent} />
                <Text style={[styles.discount, { color: themeColors.accent }]}>{discountLabel(p)}</Text>
              </View>
              <Text style={[styles.name, { color: themeColors.text }]}>{p.name}</Text>
              {p.description ? (
                <Text style={[styles.description, { color: themeColors.mutedText }]}>
                  {p.description}
                </Text>
              ) : null}
              <View style={styles.metaRow}>
                {p.code ? (
                  <View style={[styles.codePill, { borderColor: themeColors.primary }]}>
                    <Text style={[styles.codeText, { color: themeColors.primary }]}>{p.code}</Text>
                  </View>
                ) : (
                  <Text style={[styles.meta, { color: themeColors.mutedText }]}>Auto-applied</Text>
                )}
                <Text style={[styles.meta, { color: themeColors.mutedText }]}>
                  Until {formatDate(p.endsAt)}
                </Text>
              </View>
              {(p.minSpend != null || p.branchName) ? (
                <Text style={[styles.fineprint, { color: themeColors.mutedText }]}>
                  {p.minSpend != null ? `Min spend ${formatCurrency(Number(p.minSpend))}` : ''}
                  {p.minSpend != null && p.branchName ? ' • ' : ''}
                  {p.branchName ?? ''}
                </Text>
              ) : null}
            </PremiumCard>
          ))
        ) : (
          <EmptyState
            icon="local-offer"
            title="No active promos"
            description="Check back later for deals at your cafe."
          />
        )}
      </View>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 24, paddingTop: 12, gap: 16 },
  card: { gap: 8, padding: 20 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  discount: { fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
  name: { fontSize: 18, fontWeight: '800' },
  description: { fontSize: 14, lineHeight: 20 },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  codePill: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  codeText: { fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  meta: { fontSize: 12 },
  fineprint: { fontSize: 11, marginTop: 2 },
});
