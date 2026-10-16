import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { MobileScreen } from '../../components/layout/MobileScreen';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { GoldButton } from '../../components/ui/GoldButton';
import { Colors } from '../../constants/theme';
import { useApi } from '../../lib/ApiContext';
import { persistTenantContextFromJoin } from '../../lib/session-context';
import { extractQrToken } from '../../lib/qr';

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

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);

    try {
      const qrToken = extractQrToken(data);

      if (qrToken.startsWith('qr-')) {
        // Station-session QR. Starting a session from the app requires a
        // member-facing session-write endpoint that is not wired yet — direct
        // the customer to the counter for now.
        Alert.alert(
          'Station QR',
          'Starting a session from your phone is not available yet. Please ask the counter to start your session.',
          [{ text: 'OK', onPress: () => setScanned(false) }],
        );
      } else if (!data.startsWith('http')) {
        // Cafe/branch code QR — join the cafe.
        const joined = await api.customers.join(data);
        // Persist tenant/branch context directly from the join response.
        await persistTenantContextFromJoin(joined);

        Alert.alert('Success', 'Successfully joined the cafe!', [
          { text: 'OK', onPress: () => router.replace('/customer') }
        ]);
      } else {
         Alert.alert('Invalid QR Code', 'Invalid Chrono QR code. Please scan the QR shown on the PC screen.', [
          { text: 'Try Again', onPress: () => setScanned(false) }
        ]);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to process QR code', [
        { text: 'Try Again', onPress: () => setScanned(false) }
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
            Point your camera at the Chrono QR code on the station or cafe counter.
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
