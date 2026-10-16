import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { MobileScreen } from '../../components/layout/MobileScreen';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { GoldButton } from '../../components/ui/GoldButton';
import { Colors } from '../../constants/theme';
import { useApi } from '../../lib/ApiContext';
import { sessionStorage } from '../../lib/session-storage';

export default function QRJoinScreen() {
  const themeColors = Colors.dark;
  const router = useRouter();
  const api = useApi();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (!permission) {
      requestPermission();
    }
  }, [permission]);

  const retry = () => setScanned(false);

  const onActionError = (e: any) => {
    Alert.alert('Error', e?.message || 'Something went wrong.', [
      { text: 'Try Again', onPress: retry },
    ]);
  };

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);

    const token = data.trim();
    try {
      // Resolve the station QR → tells us which venue/station it belongs to.
      const resolved = await api.qr.resolve(token);

      // Select that venue so every subsequent /portal call targets it.
      await sessionStorage.setTenantSlug(resolved.tenantSlug);
      if (resolved.tenantHost) await sessionStorage.setTenantHost(resolved.tenantHost);

      Alert.alert(
        resolved.branchName,
        `Station ${resolved.stationName}\n\nStart your session here?`,
        [
          { text: 'Cancel', style: 'cancel', onPress: retry },
          {
            text: 'Just Join',
            onPress: async () => {
              try {
                await api.venue.apply();
                router.replace('/customer');
              } catch (e) {
                onActionError(e);
              }
            },
          },
          {
            text: 'Start Session',
            onPress: async () => {
              try {
                // Ensure membership (idempotent), then consume the QR to start.
                await api.venue.apply();
                const result = await api.qr.consume(token);
                if (result.resolved) {
                  router.replace('/customer');
                } else {
                  Alert.alert('Could not start', 'Please try again or see staff.', [
                    { text: 'OK', onPress: retry },
                  ]);
                }
              } catch (e) {
                onActionError(e);
              }
            },
          },
        ],
      );
    } catch (error: any) {
      Alert.alert('Invalid QR', error?.message || 'That code could not be read.', [
        { text: 'Try Again', onPress: retry },
      ]);
    }
  };

  if (!permission) {
    return (
      <MobileScreen scrollable={false}>
        <ScreenHeader title="Scan QR" showBack />
        <View style={styles.centered}>
          <Text style={{ color: themeColors.text }}>Requesting camera permission...</Text>
        </View>
      </MobileScreen>
    );
  }

  if (!permission.granted) {
    return (
      <MobileScreen scrollable={false}>
        <ScreenHeader title="Scan QR" showBack />
        <View style={styles.centered}>
          <Text style={[styles.subtitle, { color: themeColors.text, marginBottom: 20 }]}>
            We need your permission to show the camera
          </Text>
          <GoldButton title="Grant Permission" onPress={requestPermission} />
        </View>
      </MobileScreen>
    );
  }

  return (
    <MobileScreen scrollable={false}>
      <ScreenHeader title="Scan QR" showBack />

      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: themeColors.text }]}>Scan QR Code</Text>
          <Text style={[styles.subtitle, { color: themeColors.mutedText }]}>
            Point your camera at the Chrono QR code on the PC station or cafe counter.
          </Text>
        </View>

        <View style={styles.cameraContainer}>
          <CameraView
            style={styles.camera}
            onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
            barcodeScannerSettings={{
              barcodeTypes: ['qr'],
            }}
          />
          <View style={[styles.overlay, { borderColor: themeColors.primary }]}>
             <View style={[styles.scanLine, { backgroundColor: themeColors.primary }]} />
          </View>
        </View>

        <View style={styles.actions}>
          <GoldButton
            title="Cancel"
            variant="outline"
            onPress={() => router.back()}
          />
        </View>
      </View>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    justifyContent: 'space-between',
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  cameraContainer: {
    flex: 1,
    maxHeight: 400,
    width: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(214, 168, 79, 0.2)',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: '15%',
    left: '15%',
    width: '70%',
    height: '70%',
    borderWidth: 2,
    borderRadius: 20,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanLine: {
    width: '100%',
    height: 2,
    opacity: 0.5,
  },
  actions: {
    marginTop: 20,
  },
});
