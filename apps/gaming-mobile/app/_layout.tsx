import { Stack } from 'expo-router';
import { Colors } from '../constants/theme';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiProvider } from '../lib/ApiContext';

export default function RootLayout() {
  const themeColors = Colors.dark;

  return (
    <ApiProvider>
      <SafeAreaProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: themeColors.background },
            animation: 'fade',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="auth/login" />
          <Stack.Screen name="auth/register" />
          <Stack.Screen name="join/index" />
          <Stack.Screen name="join/qr" />
          <Stack.Screen name="customer" options={{ gestureEnabled: false }} />
        </Stack>
      </SafeAreaProvider>
    </ApiProvider>
  );
}
