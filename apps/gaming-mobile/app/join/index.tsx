import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { MobileScreen } from '../../components/layout/MobileScreen';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { FormInput } from '../../components/ui/FormInput';
import { GoldButton } from '../../components/ui/GoldButton';
import { PremiumCard } from '../../components/ui/PremiumCard';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Colors } from '../../constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useApi } from '../../lib/ApiContext';
import { persistTenantContextFromJoin } from '../../lib/session-context';
import { logger } from '../../lib/logger';

interface VisitedCafe {
  tenantSlug: string;
  tenantName: string;
  branchName: string;
  branchCode: string;
}

export default function JoinCafeScreen() {
  const [code, setCode] = useState('');
  const [history, setHistory] = useState<VisitedCafe[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const themeColors = Colors.dark;
  const router = useRouter();
  const api = useApi();

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const cafes = await api.customers.getCafes();
      // Flatten joined tenants + their branches into one tappable list.
      const rows: VisitedCafe[] = (cafes as any[]).flatMap((cafe) =>
        (cafe.branches?.length ? cafe.branches : [{ branchName: '', branchCode: '' }]).map(
          (b: any) => ({
            tenantSlug: cafe.tenantSlug,
            tenantName: cafe.tenantName,
            branchName: b.branchName,
            branchCode: b.branchCode,
          }),
        ),
      );
      setHistory(rows);
    } catch (err: any) {
      logger.error('Failed to fetch cafes', err);
      setHistoryError(err?.message || 'Failed to load your joined cafes.');
    } finally {
      setLoadingHistory(false);
    }
  }, [api]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleJoinByCode = async (cafeCode?: string) => {
    const codeToJoin = cafeCode || code;
    if (!codeToJoin.trim()) {
      Alert.alert('Error', 'Please enter a cafe code');
      return;
    }

    try {
      const joined = await api.customers.join(codeToJoin);

      // Resolve + persist tenant/branch context from the customer's cafes
      // (the apply response carries no tenant detail).
      await persistTenantContextFromJoin(joined);

      Alert.alert('Success', 'Successfully joined the cafe!', [
        { text: 'OK', onPress: () => router.replace('/customer') }
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to join cafe');
    }
  };

  const renderHistoryItem = ({ item }: { item: VisitedCafe }) => (
    <PremiumCard variant="secondary" style={styles.cafeCard}>
      <TouchableOpacity style={styles.cafeInfo} onPress={() => handleJoinByCode(item.tenantSlug)}>
        <MaterialIcons name="business" size={24} color={themeColors.primary} />
        <View>
          <Text style={[styles.cafeName, { color: themeColors.text }]}>{item.tenantName}</Text>
          <Text style={[styles.cafeBranch, { color: themeColors.mutedText }]}>{item.branchName}</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => handleJoinByCode(item.tenantSlug)}>
        <MaterialIcons name="chevron-right" size={24} color={themeColors.mutedText} />
      </TouchableOpacity>
    </PremiumCard>
  );

  return (
    <MobileScreen scrollable={false}>
      <ScreenHeader title="" showBack />

      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: themeColors.text }]}>Join your gaming cafe</Text>
          <Text style={[styles.subtitle, { color: themeColors.mutedText }]}>
            Connect to a cafe Branch by entering a cafe code or scanning a QR code.
          </Text>
        </View>

        <View style={styles.form}>
          <FormInput
            label="Cafe Code"
            placeholder="e.g. IZUR-01"
            value={code}
            onChangeText={setCode}
          />

          <GoldButton
            title="Continue with Code"
            onPress={() => handleJoinByCode()}
          />

          <TouchableOpacity 
            style={styles.skipButton} 
            onPress={() => router.replace('/customer')}
          >
            <Text style={[styles.skipText, { color: themeColors.mutedText }]}>Skip for now</Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={[styles.line, { backgroundColor: themeColors.border }]} />
            <Text style={[styles.or, { color: themeColors.mutedText }]}>OR</Text>
            <View style={[styles.line, { backgroundColor: themeColors.border }]} />
          </View>

          <GoldButton
            title="Scan QR Code"
            variant="outline"
            onPress={() => router.push('/join/qr')}
            icon={<MaterialIcons name="qr-code-scanner" size={24} color={themeColors.primary} />}
          />
        </View>

        <View style={styles.savedSection}>
          <Text style={[styles.sectionTitle, { color: themeColors.mutedText }]}>RECENTLY VISITED</Text>
          {loadingHistory ? (
            <ActivityIndicator color={themeColors.primary} />
          ) : historyError ? (
            <ErrorBanner message={historyError} onRetry={fetchHistory} />
          ) : history.length > 0 ? (
            <FlatList
              data={history}
              renderItem={renderHistoryItem}
              keyExtractor={(item, index) => `${item.tenantSlug}-${item.branchCode}-${index}`}
              contentContainerStyle={{ gap: 16 }}
            />
          ) : (
            <Text style={{ color: themeColors.mutedText, fontSize: 14 }}>
              No recently visited cafes.
            </Text>
          )}
        </View>
      </View>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  header: {
    marginBottom: 40,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    textAlign: 'center',
    fontWeight: '800',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  form: {
    gap: 20,
  },
  skipButton: {
    alignSelf: 'center',
    padding: 8,
  },
  skipText: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
    gap: 16,
  },
  line: {
    flex: 1,
    height: 1,
  },
  or: {
    fontSize: 12,
    fontWeight: '700',
  },
  savedSection: {
    flex: 1,
    marginTop: 48,
    gap: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  cafeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  cafeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  cafeName: {
    fontSize: 16,
    fontWeight: '700',
  },
  cafeBranch: {
    fontSize: 13,
  },
});
