import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { MobileScreen } from '../../components/layout/MobileScreen';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { PremiumCard } from '../../components/ui/PremiumCard';
import { GoldButton } from '../../components/ui/GoldButton';
import { EmptyState } from '../../components/ui/EmptyState';
import { Colors } from '../../constants/theme';
import { useApi } from '../../lib/ApiContext';
import { formatCurrency, formatDate, formatDuration } from '../../lib/format';
import { logger } from '../../lib/logger';
import type { CreditBalance, CreditProduct } from '../../constants/schemas/api';

export default function CreditsScreen() {
  const themeColors = Colors.dark;
  const api = useApi();
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [products, setProducts] = useState<CreditProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [bal, prods] = await Promise.all([
        api.credits.balance(),
        api.credits.products().catch(() => []),
      ]);
      setBalance(bal);
      setProducts(prods);
    } catch (e) {
      logger.error('Failed to load credits:', e);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const buy = (product: CreditProduct) => {
    Alert.alert(
      'Buy time credit',
      `${product.name} — ${formatDuration(product.quantityMinutes)} for ${formatCurrency(Number(product.priceAmount))}?\n\nThis is paid from your wallet balance.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Buy',
          onPress: async () => {
            setPurchasingId(product.id);
            try {
              await api.credits.purchase({ productId: product.id }, `${product.id}-${Date.now()}`);
              await load();
              Alert.alert('Success', 'Time credit added to your account.');
            } catch (e: any) {
              Alert.alert('Purchase failed', e?.message || 'Could not complete the purchase.');
            } finally {
              setPurchasingId(null);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <MobileScreen>
        <ScreenHeader title="Time Credits" showBack />
        <ActivityIndicator style={{ marginTop: 24 }} color={themeColors.primary} />
      </MobileScreen>
    );
  }

  const activeGrants = (balance?.grants ?? []).filter((g) => g.status === 'granted');

  return (
    <MobileScreen>
      <ScreenHeader title="Time Credits" showBack />
      <View style={styles.container}>
        <PremiumCard variant="gold-border" withGlow style={styles.heroCard}>
          <Text style={[styles.heroLabel, { color: themeColors.mutedText }]}>REMAINING TIME</Text>
          <Text style={[styles.heroValue, { color: themeColors.accent }]}>
            {formatDuration(balance?.totalRemainingMinutes ?? 0)}
          </Text>
        </PremiumCard>

        {activeGrants.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: themeColors.mutedText }]}>ACTIVE CREDITS</Text>
            <PremiumCard variant="default">
              {activeGrants.map((g) => (
                <View key={g.id} style={[styles.row, { borderBottomColor: themeColors.border }]}>
                  <View style={styles.rowLeft}>
                    <Text style={[styles.rowTitle, { color: themeColors.text }]}>
                      {g.stationGroupName ?? 'Any station'}
                    </Text>
                    <Text style={[styles.rowSub, { color: themeColors.mutedText }]}>
                      {g.expiresAt ? `Expires ${formatDate(g.expiresAt)}` : 'No expiry'}
                    </Text>
                  </View>
                  <Text style={[styles.rowValue, { color: themeColors.text }]}>
                    {formatDuration(g.remainingQuantity)}
                  </Text>
                </View>
              ))}
            </PremiumCard>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.mutedText }]}>BUY MORE TIME</Text>
          {products.length > 0 ? (
            <View style={styles.productList}>
              {products.map((p) => (
                <PremiumCard key={p.id} variant="secondary" style={styles.productCard}>
                  <View style={styles.rowLeft}>
                    <Text style={[styles.rowTitle, { color: themeColors.text }]}>{p.name}</Text>
                    <Text style={[styles.rowSub, { color: themeColors.mutedText }]}>
                      {formatDuration(p.quantityMinutes)}
                      {p.validityDays != null ? ` • valid ${p.validityDays}d` : ''}
                    </Text>
                  </View>
                  <GoldButton
                    title={purchasingId === p.id ? '...' : formatCurrency(Number(p.priceAmount))}
                    onPress={() => buy(p)}
                    disabled={purchasingId !== null}
                    style={styles.buyButton}
                  />
                </PremiumCard>
              ))}
            </View>
          ) : (
            <EmptyState
              icon="schedule"
              title="No credit packs"
              description="This cafe has no time-credit products available."
            />
          )}
        </View>
      </View>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 24, paddingTop: 12, gap: 32 },
  heroCard: { alignItems: 'center', gap: 6, paddingVertical: 28 },
  heroLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  heroValue: { fontSize: 40, fontWeight: '900' },
  section: { gap: 12 },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  rowLeft: { flex: 1, paddingRight: 12 },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowSub: { fontSize: 12, marginTop: 2 },
  rowValue: { fontSize: 15, fontWeight: '800' },
  productList: { gap: 12 },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  buyButton: { height: 40, paddingHorizontal: 16 },
});
