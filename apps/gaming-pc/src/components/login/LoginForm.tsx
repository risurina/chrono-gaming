import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, LockKeyhole, Mail, QrCode, Smartphone, User, WifiOff } from 'lucide-react';
import { Box, Button, Flex, Input, Label, Text, cn } from '@/ui-kit';
import { isConnectionError } from './login-defaults';

type LoginMode = 'qr' | 'login';

type LoginFormProps = {
  mode: LoginMode;
  setMode: (mode: LoginMode) => void;
  loading: boolean;
  qrToken: string | null;
  qrUrl: string | null;
  fetchQrToken: () => void;
  handleAuth: (e: React.FormEvent) => void;
  error: string | null;
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (password: string) => void;
  loginLoading: boolean;
};

export function LoginForm({
  mode,
  setMode,
  loading,
  qrToken,
  qrUrl,
  fetchQrToken,
  handleAuth,
  error,
  email,
  setEmail,
  password,
  setPassword,
  loginLoading,
}: LoginFormProps) {
  const offline = isConnectionError(error);

  const OfflinePanel = (
    <Flex direction="col" align="center" justify="center" gap="2" className="text-center">
      <WifiOff className="h-8 w-8 text-destructive" />
      <Text className="text-sm font-black uppercase tracking-[0.18em] text-destructive">
        No Internet Connection
      </Text>
      <Text className="max-w-[220px] text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        Check your network connection and try again.
      </Text>
      <Button onClick={fetchQrToken} type="button" variant="outline" disabled={loading} className="mt-1">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Retry Connection'}
      </Button>
    </Flex>
  );

  return (
    <div key={mode} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      {mode === 'qr' ? (
        <Flex direction="col" align="center" className="mt-5 space-y-3">
          <Box className={cn(
            'h-[300px] w-[300px] rounded-md border p-3 shadow-[0_0_32px_rgba(var(--primary-rgb),0.12)] flex items-center justify-center mx-auto',
            offline ? 'border-destructive/40' : 'border-primary/25',
          )}>
            {offline ? (
              OfflinePanel
            ) : loading && !qrToken ? (
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            ) : qrToken ? (
              <QRCodeSVG value={qrUrl || qrToken} size={260} level="L" minVersion={10} className="rounded-sm bg-white p-4" />
            ) : (
              <Flex direction="col" align="center" gap="2" className="text-center">
                {error && (
                  <Text className="max-w-[220px] text-xs font-semibold text-destructive">{error}</Text>
                )}
                <Button onClick={fetchQrToken} type="button" variant="outline">Retry QR</Button>
              </Flex>
            )}
          </Box>
          <Box className="text-center">
            <Text className="text-sm font-black uppercase tracking-[0.2em] text-primary">Quick Login</Text>
            <Text className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Scan with Chrono Mobile or your phone camera
            </Text>
            <Flex align="center" justify="center" gap="1.5" className="pt-1">
              <LockKeyhole className="h-3.5 w-3.5 text-primary/80" />
              <Text className="text-[10px] font-black uppercase tracking-[0.18em] text-primary/80">
                Secure Session
              </Text>
            </Flex>
          </Box>

          <div className="relative flex w-full items-center">
            <div className="flex-grow border-t border-primary/15" />
            <span className="mx-4 flex-shrink text-[10px] font-black uppercase tracking-widest text-primary/50">OR</span>
            <div className="flex-grow border-t border-primary/15" />
          </div>

          <Button
            variant="outline"
            type="button"
            onClick={() => setMode('login')}
            className={cn('h-14 w-full gap-3 border-primary/30 bg-primary/10 text-primary hover:bg-primary/15')}
            radius="sm"
          >
            <User className="h-5 w-5" />
            <span className="flex flex-col items-start leading-tight">
              <span className="text-sm font-black uppercase tracking-widest">EMAIL LOGIN</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70">Sign in using your registered email.</span>
            </span>
            <Mail className="ml-auto h-5 w-5" />
          </Button>
        </Flex>
      ) : (
        <div className="mt-6 w-full space-y-4">
          <form className="space-y-4" onSubmit={handleAuth}>
            {error && (
              <Flex align="center" gap="2" className="text-left text-sm font-semibold text-destructive">
                {offline && <WifiOff className="h-4 w-4 shrink-0" />}
                <span>{offline ? 'No internet connection. Check your network and try again.' : error}</span>
              </Flex>
            )}
            <Box className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-primary">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="player@izur.com.ph"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-12 w-full border-primary/20 pl-10 text-sm tracking-wide text-foreground focus:border-primary"
                  radius="sm"
                />
              </div>
            </Box>
            <Box className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-primary">Password</Label>
              <Input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-12 w-full border-primary/20 text-sm tracking-wide text-foreground focus:border-primary"
                radius="sm"
              />
            </Box>

            <Button
              variant="secondary"
              type="submit"
              disabled={loginLoading}
              className="h-12 w-full bg-primary text-sm font-black uppercase tracking-[0.2em] text-black"
              radius="sm"
            >
              {loginLoading ? 'Signing In...' : 'Sign In'}
            </Button>
          </form>

          <div className="relative flex w-full items-center">
            <div className="flex-grow border-t border-primary/15" />
            <span className="mx-4 flex-shrink text-[10px] font-black uppercase tracking-widest text-primary/50">OR</span>
            <div className="flex-grow border-t border-primary/15" />
          </div>

          <Button
            variant="outline"
            type="button"
            onClick={() => setMode('qr')}
            className={cn('h-14 w-full gap-3 border-primary/30 bg-primary/10 text-primary hover:bg-primary/15')}
            radius="sm"
          >
            <Smartphone className="h-5 w-5" />
            <span className="flex flex-col items-start leading-tight">
              <span className="text-sm font-black uppercase tracking-widest">Quick Login</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70">Scan using Chrono Mobile</span>
            </span>
            <QrCode className="ml-auto h-5 w-5" />
          </Button>
        </div>
      )}
    </div>
  );
}
