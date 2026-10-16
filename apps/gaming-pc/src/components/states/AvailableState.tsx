import React, { useState, useEffect } from 'react';
import { SessionViewModel } from '../../types/pc-client';
import { PcClientApi } from '../../features/api/pc-client-api';
import { getDeviceFingerprint } from '../../lib/device';
import { native } from '../../lib/native';
import { useUiConfig } from '../../contexts/UiConfigContext';
import { IdleScreenLayout } from '../ui/IdleScreenLayout';
import { Box, Flex, Heading, Text } from '@risurina/oikos/ui';
import { LoginForm } from '../login';

type LoginMode = 'qr' | 'login';

export const AvailableState: React.FC<{ session: SessionViewModel }> = ({ session }) => {
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [expiresIn, setExpiresIn] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<LoginMode>('qr');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  useUiConfig();

  const fetchQrToken = async () => {
    try {
      setLoading(true);
      const deviceToken = await native.getDeviceToken();

      if (!deviceToken) {
        setError('Missing device token');
        return;
      }

      const fingerprint = await getDeviceFingerprint();

      const result = await PcClientApi.generateQrToken(fingerprint);
      if (result.success && result.data) {
        setQrToken(result.data.qrToken);
        setQrUrl(result.data.qrUrl ?? null);
        setExpiresIn(result.data.expiresIn);
        setError(null);
      } else {
        setError(result.error || 'Failed to load QR code');
      }
    } catch (err) {
      setError('No internet connection');
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    try {
      setLoginLoading(true);
      setError(null);

      const loginResult = await PcClientApi.signIn({ email, password });

      if (!loginResult.success) {
        setError(loginResult.error || 'Authentication failed');
        return;
      }

      // The server derives the station from the device's JWT; no stationId is sent.
      const sessionResult = await PcClientApi.startSession({ mode: 'PREPAID' });

      if (!sessionResult.success) {
        setError(sessionResult.error || 'Failed to start session');
        return;
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoginLoading(false);
    }
  };

  useEffect(() => {
    fetchQrToken();
  }, []);

  useEffect(() => {
    if (expiresIn > 0) {
      const timer = setInterval(() => {
        setExpiresIn((prev) => {
          if (prev <= 1) {
            fetchQrToken();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [expiresIn]);

  return (
    <IdleScreenLayout session={session}>
      <Flex direction="col" justify="center" className="mx-auto min-h-0 w-full max-w-[404px] flex-1 py-5">
        <Box className="space-y-1 text-center">
          <Heading level={1} className="text-2xl font-black tracking-normal text-foreground">
            Welcome Back
          </Heading>
          <Text className="text-xs font-medium text-muted-foreground">
            {mode === 'qr'
              ? 'Scan with Chrono Mobile to start your gaming session.'
              : 'Sign in to start your gaming session.'}
          </Text>
        </Box>

        <LoginForm
          mode={mode}
          setMode={setMode}
          loading={loading}
          qrToken={qrToken}
          qrUrl={qrUrl}
          fetchQrToken={fetchQrToken}
          handleAuth={handleAuth}
          error={error}
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          loginLoading={loginLoading}
        />
      </Flex>
    </IdleScreenLayout>
  );
};
