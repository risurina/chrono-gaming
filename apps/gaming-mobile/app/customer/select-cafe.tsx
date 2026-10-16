import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { MobileScreen } from '../../components/layout/MobileScreen';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { PremiumCard } from '../../components/ui/PremiumCard';
import { GoldButton } from '../../components/ui/GoldButton';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Colors } from '../../constants/theme';
import { useApi } from '../../lib/ApiContext';
import { tokenStorage } from '../../lib/token-storage';
import { persistTenantContext } from '../../lib/session-context';
import { logger } from '../../lib/logger';

interface CafeBranch {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  branchId: string;
  branchCode: string;
  branchName: string;
}

interface TenantGroup {
  tenantId: string;
  tenantName: string;
  branches: CafeBranch[];
}

export default function SelectCafeScreen() {
  const themeColors = Colors.dark;
  const router = useRouter();
  const api = useApi();
  const [groups, setGroups] = useState<TenantGroup[]>([]);
  const [activeBranchCode, setActiveBranchCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [switchingCode, setSwitchingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [cafes, branchCode] = await Promise.all([
        api.customers.getCafes(),
        tokenStorage.getBranchCode(),
      ]);
      setActiveBranchCode(branchCode);

      // One group per joined tenant; each row is one of that tenant's branches.
      const nextGroups: TenantGroup[] = (cafes as any[])
        .filter((cafe) => cafe.tenantSlug)
        .map((cafe) => ({
          tenantId: cafe.tenantId,
          tenantName: cafe.tenantName,
          branches: (cafe.branches ?? []).map((b: any) => ({
            tenantId: cafe.tenantId,
            tenantSlug: cafe.tenantSlug,
            tenantName: cafe.tenantName,
            branchId: b.branchId,
            branchCode: b.branchCode,
            branchName: b.branchName,
          })),
        }));
      setGroups(nextGroups);
    } catch (e: any) {
      logger.error('Failed to load cafes:', e);
      setError(e?.message || 'Failed to load your cafes.');
    }
  }, [api]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await load();
      if (mounted) setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [load]);

  const handleSelect = async (branch: CafeBranch) => {
    setSwitchingCode(branch.branchCode);
    try {
      await persistTenantContext({
        tenantId: branch.tenantId,
        tenantSlug: branch.tenantSlug,
        branchId: branch.branchId,
        branchCode: branch.branchCode,
      });
      router.replace('/customer');
    } catch (e) {
      logger.error('Failed to switch cafe:', e);
      setSwitchingCode(null);
    }
  };

  return (
    <MobileScreen>
      <ScreenHeader title="Select Cafe" showBack />

      <View style={styles.container}>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={themeColors.primary} />
        ) : error ? (
          <ErrorBanner message={error} onRetry={load} />
        ) : groups.length === 0 ? (
          <EmptyState
            icon="business"
            title="No cafes yet"
            description="Join a cafe to start using your wallet, sessions, and reservations."
          />
        ) : (
          <View style={styles.groups}>
            {groups.map((group) => (
              <View key={group.tenantId} style={styles.group}>
                <Text style={[styles.tenantName, { color: themeColors.mutedText }]}>
                  {group.tenantName?.toUpperCase()}
                </Text>
                <PremiumCard variant="default" style={styles.branchCard}>
                  {group.branches.map((branch, index) => {
                    const active = branch.branchCode === activeBranchCode;
                    return (
                      <TouchableOpacity
                        key={branch.branchCode}
                        style={[
                          styles.branchRow,
                          index !== group.branches.length - 1 && {
                            borderBottomWidth: 1,
                            borderBottomColor: themeColors.border,
                          },
                        ]}
                        onPress={() => handleSelect(branch)}
                        disabled={!!switchingCode}
                      >
                        <View style={styles.branchLeft}>
                          <MaterialIcons
                            name={active ? 'check-circle' : 'store'}
                            size={22}
                            color={active ? themeColors.success : themeColors.primary}
                          />
                          <View>
                            <Text style={[styles.branchName, { color: themeColors.text }]}>
                              {branch.branchName}
                            </Text>
                            <Text style={[styles.branchCode, { color: themeColors.mutedText }]}>
                              {branch.branchCode}
                              {active ? ' · Active' : ''}
                            </Text>
                          </View>
                        </View>
                        {switchingCode === branch.branchCode ? (
                          <ActivityIndicator color={themeColors.primary} />
                        ) : (
                          <MaterialIcons name="chevron-right" size={22} color={themeColors.mutedText} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </PremiumCard>
              </View>
            ))}
          </View>
        )}

        <GoldButton
          title="Join Another Cafe"
          variant="outline"
          onPress={() => router.push('/join')}
          icon={<MaterialIcons name="add-location-alt" size={20} color={themeColors.primary} />}
          style={styles.joinButton}
        />
      </View>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 24,
  },
  groups: {
    gap: 24,
  },
  group: {
    gap: 12,
  },
  tenantName: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  branchCard: {
    padding: 0,
  },
  branchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  branchLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  branchName: {
    fontSize: 16,
    fontWeight: '700',
  },
  branchCode: {
    fontSize: 12,
    marginTop: 2,
  },
  joinButton: {
    marginTop: 8,
  },
});
