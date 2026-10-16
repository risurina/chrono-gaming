import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { MobileScreen } from '../../components/layout/MobileScreen';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { FormInput } from '../../components/ui/FormInput';
import { GoldButton } from '../../components/ui/GoldButton';
import { PremiumCard } from '../../components/ui/PremiumCard';
import { Colors } from '../../constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useApi } from '../../lib/ApiContext';
import { sessionStorage } from '../../lib/session-storage';
import type { CustomerMembership } from '../../constants/schemas/api';

export default function JoinCafeScreen() {
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [venues, setVenues] = useState<CustomerMembership[]>([]);
  const [loadingVenues, setLoadingVenues] = useState(true);

  const themeColors = Colors.dark;
  const router = useRouter();
  const api = useApi();

  useEffect(() => {
    let mounted = true;
    const fetchVenues = async () => {
      try {
        const memberships = await api.venue.memberships();
        if (mounted) setVenues(memberships);
      } catch (err) {
        console.error('Failed to fetch memberships', err);
      } finally {
        if (mounted) setLoadingVenues(false);
      }
    };
    fetchVenues();
    return () => {
      mounted = false;
    };
  }, [api]);

  // Enter (and join) a NEW cafe by its venue slug ("cafe code"). We set the
  // tenant header first so the apply resolves to that venue, then join.
  const handleJoinByCode = async (cafeCode?: string) => {
    const slug = (cafeCode ?? code).trim().toLowerCase();
    if (!slug) {
      Alert.alert('Error', 'Please enter a cafe code');
      return;
    }

    setJoining(true);
    try {
      await sessionStorage.setTenantSlug(slug);
      await api.venue.apply();
      router.replace('/customer');
    } catch (error: any) {
      await sessionStorage.clearTenant();
      Alert.alert('Error', error.message || 'Could not find that cafe. Check the code and try again.');
    } finally {
      setJoining(false);
    }
  };

  // Select a venue the customer has already joined — no re-apply needed.
  const handleSelectVenue = async (slug: string) => {
    await sessionStorage.setTenantSlug(slug);
    router.replace('/customer');
  };

  const renderVenueItem = ({ item }: { item: CustomerMembership }) => (
    <PremiumCard variant="secondary" style={styles.cafeCard}>
      <TouchableOpacity style={styles.cafeInfo} onPress={() => handleSelectVenue(item.tenantSlug)}>
        <MaterialIcons name="business" size={24} color={themeColors.primary} />
        <View>
          <Text style={[styles.cafeName, { color: themeColors.text }]}>{item.tenantName}</Text>
          <Text style={[styles.cafeBranch, { color: themeColors.mutedText }]}>{item.tenantSlug}</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => handleSelectVenue(item.tenantSlug)}>
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
            Connect to a cafe by entering its code or scanning a QR code.
          </Text>
        </View>

        <View style={styles.form}>
          <FormInput
            label="Cafe Code"
            placeholder="e.g. izur-01"
            value={code}
            onChangeText={setCode}
            autoCapitalize="none"
          />

          <GoldButton
            title={joining ? 'Joining...' : 'Continue with Code'}
            onPress={() => handleJoinByCode()}
            disabled={joining}
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
          <Text style={[styles.sectionTitle, { color: themeColors.mutedText }]}>YOUR CAFES</Text>
          {loadingVenues ? (
            <ActivityIndicator color={themeColors.primary} />
          ) : venues.length > 0 ? (
            <FlatList
              data={venues}
              renderItem={renderVenueItem}
              keyExtractor={(item) => item.tenantSlug}
              contentContainerStyle={{ gap: 16 }}
            />
          ) : (
            <Text style={{ color: themeColors.mutedText, fontSize: 14 }}>
              You haven&apos;t joined any cafes yet.
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
