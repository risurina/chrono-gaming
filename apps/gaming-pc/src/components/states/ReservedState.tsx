import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Calendar, QrCode, Lock, User, Clock, Key, ArrowRight, ArrowLeft } from 'lucide-react';
import { SessionViewModel } from '../../types/pc-client';
import { PcClientApi } from '../../features/api/pc-client-api';
import { getDeviceFingerprint } from '../../lib/device';
import { native } from '../../lib/native';
import { useUiConfig } from '../../contexts/UiConfigContext';
import {
  Button,
  Input,
  Label,
  cn,
  Box,
  Flex,
  Heading,
  Text,
} from '@/ui-kit';
import { FullPageLayout } from '../ui/FullPageLayout';
import { runtime } from '../../features/runtime/pc-client-runtime';
import { IdleScreenLayout } from '../ui/IdleScreenLayout';
import { LoginForm } from '../login';

interface ReservedStateProps {
  session: SessionViewModel;
}

export const ReservedState: React.FC<ReservedStateProps> = ({ session }) => {
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrExpiresIn, setQrExpiresIn] = useState<number>(0);
  const [loadingQr, setLoadingQr] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'info' | 'qr' | 'login'>('info');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  // 'claim' = log in and start/resume playing; 'end' = log in and stop the billed,
  // screen-locked (awaiting-login) session so the member is no longer charged.
  const [intent, setIntent] = useState<'claim' | 'end'>('claim');

  const localState = runtime.getState();
  const reservation = localState?.activeReservation;
  // Phase 3b: an awaiting-login "reservation" is actually a session that is already
  // billing while the screen stays locked. Offer an explicit "stop billing" action.
  const isAwaitingLogin = reservation?.awaitingLogin === true;
  // Phase 7: a free, unbilled hold after the member ran out of balance while a queue
  // waits — offer top-up (log in), extend, or leave.
  const isTopUpGrace = reservation?.topUpGrace === true;
  const [graceActionLoading, setGraceActionLoading] = useState<null | 'extend' | 'leave'>(null);
  const uiConfig = useUiConfig();

  const handleExtendGrace = async () => {
    if (!reservation?.id) return;
    try {
      setGraceActionLoading('extend');
      setError(null);
      const result = await PcClientApi.extendGrace(reservation.id);
      if (!result.success) setError(result.error || 'Could not extend your time.');
    } finally {
      setGraceActionLoading(null);
    }
  };

  const handleLeaveGrace = async () => {
    if (!reservation?.id) return;
    try {
      setGraceActionLoading('leave');
      setError(null);
      const result = await PcClientApi.leaveGrace(reservation.id);
      if (!result.success) setError(result.error || 'Could not release the PC.');
    } finally {
      setGraceActionLoading(null);
    }
  };

  // Reservation countdown logic
  const [countdownText, setCountdownText] = useState('00:00');
  const [isGracePeriod, setIsGracePeriod] = useState(false);

  useEffect(() => {
    if (!reservation) return;

    const updateCountdown = () => {
      const now = Date.now();
      const start = new Date(reservation.startTime).getTime();
      const end = reservation.graceExpiresAt
        ? new Date(reservation.graceExpiresAt).getTime()
        : new Date(reservation.endTime).getTime();

      if (now < start) {
        // Countdown to start time
        const diff = Math.max(0, Math.floor((start - now) / 1000));
        const m = Math.floor(diff / 60);
        const s = diff % 60;
        setCountdownText(`Starts in ${m}:${String(s).padStart(2, '0')}`);
        setIsGracePeriod(false);
      } else if (now <= end) {
        // Countdown to expiration
        const diff = Math.max(0, Math.floor((end - now) / 1000));
        const m = Math.floor(diff / 60);
        const s = diff % 60;
        setCountdownText(`Claim within ${m}:${String(s).padStart(2, '0')}`);
        setIsGracePeriod(true);
      } else {
        setCountdownText('Reservation Expired');
        setIsGracePeriod(false);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [reservation]);

  const fetchQrToken = async () => {
    try {
      setLoadingQr(true);
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
        setQrExpiresIn(result.data.expiresIn);
        setError(null);
      } else {
        setError(result.error || 'Failed to load QR code');
      }
    } catch (err) {
      setError('No internet connection');
    } finally {
      setLoadingQr(false);
    }
  };

  const handleLoginAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    try {
      setLoginLoading(true);
      setError(null);

      // Sign in member
      const loginResult = await PcClientApi.signIn({ email, password });
      if (!loginResult.success) {
        setError(loginResult.error || 'Authentication failed');
        return;
      }

      if (intent === 'end' && reservation?.id) {
        // Stop the billed, awaiting-login session. The API verifies the signed-in
        // member owns it before ending; the station is then released.
        const endResult = await PcClientApi.endSession(reservation.id);
        if (!endResult.success) {
          setError(endResult.error || 'Failed to end session');
        }
        return;
      }

      // Check-in / start session on reserved station. The server derives the
      // station from the device's JWT; no stationId is sent.
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
    if (qrExpiresIn > 0) {
      const timer = setInterval(() => {
        setQrExpiresIn(prev => {
          if (prev <= 1) {
            fetchQrToken();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [qrExpiresIn]);

  return (
    <IdleScreenLayout session={session}>
      <Flex direction="col" justify="center" className="mx-auto min-h-0 w-full max-w-[404px] flex-1 py-5">
        {/* Reservation Header Card */}
        <Box className="  text-center relative overflow-hidden rounded-xl">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mb-4 mx-auto border border-amber-500/20">
            <Calendar className="h-5 w-5 text-amber-500 animate-pulse" />
          </div>

          <Heading level={2} className="text-xl font-black text-amber-400 uppercase tracking-widest">
            {isTopUpGrace ? 'Out of Balance' : 'Station Reserved'}
          </Heading>

          <Text className="text-sm text-zinc-300/60 font-medium mt-1">
            {isTopUpGrace ? (
              <>Top up or start a promo to keep playing — this PC is needed by the next player.</>
            ) : (
              <>Reserved for: <span className="text-white font-bold uppercase">{reservation?.customerName || 'Chrono Member'}</span></>
            )}
          </Text>

          {/* Countdown / Expiration Timer */}
          {mode === 'info' &&
            <div className="mt-4 mb-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-950/80 border border-primary/20">
              <Clock className={cn("h-4 w-4", isGracePeriod ? "text-amber-500 animate-pulse" : "text-primary")} />
              <span className="text-xs font-bold tracking-wider text-primary">
                {countdownText}
              </span>
            </div>
          }
        </Box>

        {/* Claim / Check-in UI */}
        {mode === 'info' ? (
          <Box className="space-y-3">
            <Button
              variant="outline"
              type="button"
              onClick={() => { setIntent('claim'); setMode('login'); }}
              className={cn('h-14 w-full gap-3 border-primary/30 bg-primary/10 text-primary hover:bg-primary/15')}
              radius="sm"
            >
              <Key className="h-5 w-5" />
              <span className="flex flex-col items-start leading-tight">
                <span className="text-sm font-black uppercase tracking-widest">
                  {isAwaitingLogin ? 'Log In & Continue' : isTopUpGrace ? 'Log In & Top Up' : 'Claim Station'}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70">Scan using Chrono Mobile</span>
              </span>
              <ArrowRight className="ml-auto h-5 w-5" />
            </Button>

            {/* Phase 3b: the session is already billing while locked — let the owner
                stop it (log in to verify, then end) instead of being charged. */}
            {isAwaitingLogin && (
              <Button
                variant="outline"
                type="button"
                onClick={() => { setIntent('end'); setMode('login'); }}
                className="h-11 w-full gap-2 border-0 text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-destructive"
                radius="sm"
              >
                <Lock className="h-4 w-4" />
                <span>Not playing? Log in &amp; end session</span>
              </Button>
            )}

            {/* Phase 7: free top-up-grace hold — extend the wait or give up the PC. */}
            {isTopUpGrace && (
              <>
                <Button
                  variant="outline"
                  type="button"
                  onClick={handleExtendGrace}
                  disabled={graceActionLoading !== null}
                  className="h-11 w-full gap-2 border-primary/30 bg-primary/5 text-xs font-black uppercase tracking-widest text-primary hover:bg-primary/10"
                  radius="sm"
                >
                  <Clock className="h-4 w-4" />
                  <span>{graceActionLoading === 'extend' ? 'Extending…' : 'Extend +5 min'}</span>
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  onClick={handleLeaveGrace}
                  disabled={graceActionLoading !== null}
                  className="h-11 w-full gap-2 border-0 text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-destructive"
                  radius="sm"
                >
                  <ArrowRight className="h-4 w-4" />
                  <span>{graceActionLoading === 'leave' ? 'Releasing…' : 'Leave (give up PC)'}</span>
                </Button>
              </>
            )}
          </Box>
        ) : (
          <Box className="space-y-4">
            <LoginForm
              mode={mode}
              setMode={setMode}
              loading={loadingQr}
              qrToken={qrToken}
              qrUrl={qrUrl}
              fetchQrToken={fetchQrToken}
              handleAuth={handleLoginAuth}
              error={error}
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              loginLoading={loginLoading}
            />
            <Button
              onClick={() => setMode('info')}
              variant="outline"
              className="w-full text-xs font-black uppercase tracking-widest text-muted-foreground  gap-2 border-0"
              radius="sm"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Reservation</span>
            </Button>
          </Box>
        )}
      </Flex>
    </IdleScreenLayout>
  );
};
