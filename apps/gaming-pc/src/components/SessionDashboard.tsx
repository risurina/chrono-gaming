import React from 'react';
import { SessionViewModel } from '../types/pc-client';
import { TimerDisplay } from './TimerDisplay';
import {
  User,
  Clock,
  Coins,
  LogOut,
  Plus,
  Wifi,
  ShieldCheck,
  Zap,
  Lock,
  ArrowRightLeft,
  Headset,
  AlertTriangle,
  Loader2,
  Infinity as InfinityIcon,
} from 'lucide-react';
import { Box, Flex, Text, Button, Badge, cn, ui } from '@risurina/oikos/ui';
import { PanelLayout } from './ui/PanelLayout';
import {
  formatTime,
  formatExpiry,
  getProgressPercent,
  getProgressColor,
  getTimerColorClass,
  getTimerUrgency,
  getPingTone,
} from '../lib/session-utils';
import { BrandMark } from './BrandMark';
import { formatStationLabel } from './login/login-defaults';
import { PcClientApi } from '../features/api/pc-client-api';

interface SessionDashboardProps {
  session: SessionViewModel;
  onEndSession: () => Promise<void>;
  isEnding: boolean;
  mode: 'active' | 'lowTime';
}

export const SessionDashboard: React.FC<SessionDashboardProps> = ({
  session,
  onEndSession,
  isEnding,
  mode,
}) => {
  const [isLocking, setIsLocking] = React.useState(false);

  const handleAwayLock = async () => {
    setIsLocking(true);
    try {
      if (!session.sessionId) throw new Error('No active session');
      const result = await PcClientApi.lockSession(session.sessionId);
      if (!result?.success) {
        window.dispatchEvent(new CustomEvent('chrono-toast', {
          detail: { message: result?.error || 'Failed to lock session', type: 'error' }
        }));
      }
    } catch (err: any) {
      window.dispatchEvent(new CustomEvent('chrono-toast', {
        detail: { message: err.message || 'An error occurred', type: 'error' }
      }));
    } finally {
      setIsLocking(false);
    }
  };

  // Open-time / pay-as-you-go session: no scheduled end means the countdown is
  // meaningless. Treat it as a calm "normal" state instead of a red 00:00 pulse.
  const isOpenTime = !session.endsAt;

  const progressPercent = getProgressPercent(session.startedAt, session.endsAt, session.timeRemainingSeconds);
  const progressColor = isOpenTime ? 'bg-primary' : getProgressColor(session.timeRemainingSeconds);
  const timerColorClass = getTimerColorClass(session.timeRemainingSeconds);
  const urgency = isOpenTime ? 'normal' : getTimerUrgency(session.timeRemainingSeconds);
  const latencyMs = session.latencyMs;
  const pingTone = latencyMs !== undefined ? getPingTone(latencyMs) : 'warning';
  const groupLabel = session.deviceGroup?.name?.trim() || formatStationLabel(session.stationId);
  const groupCode = session.deviceGroup?.code?.trim();
  const stationName = session.stationName?.trim() || (session.stationId && session.stationId !== session.deviceName
    ? session.stationId
    : session.deviceName);
  const pcNumber = stationName?.match(/\d+/)?.[0] || session.stationId.match(/\d+/)?.[0];
  const stationDisplayLabel = groupCode && pcNumber
    ? `${groupCode} #${pcNumber}`
    : stationName || groupCode || formatStationLabel(session.stationId);
  const sessionCost = session.sessionCost || '₱0.00';

  return (
    <PanelLayout>
      <Box className={cn("relative flex h-full w-full flex-col overflow-hidden bg-background", ui.premiumDots)}>
        {mode === 'lowTime' && (
          <Box className="flex shrink-0 animate-pulse items-center gap-3 border-b border-destructive/30 bg-destructive/20 px-5 py-1.5">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <Text className="text-[10px] font-black uppercase tracking-[0.2em] text-destructive">
              Low Time Warning
            </Text>
          </Box>
        )}

        <Box className="shrink-0 border-b border-border/30 bg-background/70 px-5 py-3 backdrop-blur-md">
          <Flex justify="between">
            <Flex direction="col" className='-space-y-1'>
              <Text className="text-base font-black uppercase tracking-tight text-foreground">{stationDisplayLabel}</Text>
              <Text className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{groupLabel}</Text>
              <Flex align="center" gap="1.5">
                <span
                  className={cn(
                    'h-1.5 w-1.5 animate-pulse rounded-full',
                    mode === 'lowTime' ? 'bg-destructive' : 'bg-primary',
                  )}
                />
                <Text
                  className={cn(
                    'text-[9px] font-bold uppercase tracking-widest',
                    mode === 'lowTime' ? 'text-destructive' : 'text-primary',
                  )}
                >
                  {mode === 'lowTime' ? 'Low Time Action Required' : 'Online & Active'}
                </Text>
              </Flex>
            </Flex>

            <Flex
              direction="col"
              align="end"
              className={cn(
                pingTone === 'good' && 'text-primary/15',
                pingTone === 'warning' && 'text-orange-500/20',
                pingTone === 'critical' && 'text-destructive/20',
              )}
            >
              <div className='flex item-start justify-start gap-1'>
                <Wifi
                  className={cn(
                    'h-3 w-3',
                    pingTone === 'good' && 'text-primary',
                    pingTone === 'warning' && 'text-orange-500',
                    pingTone === 'critical' && 'text-destructive',
                  )}
                />
                <Text
                  className={cn(
                    'text-[11px]  font-black justify-center items-center -mt-1',
                    pingTone === 'good' && 'text-primary',
                    pingTone === 'warning' && 'text-orange-500',
                    pingTone === 'critical' && 'text-destructive',
                  )}
                >
                  {latencyMs !== undefined ? `${latencyMs}ms` : '--'}
                </Text>
              </div>
              <Text className="text-[8px] -mt-3 font-medium uppercase text-muted-foreground/60">
                Connection
              </Text>
            </Flex>
          </Flex>
        </Box>

        <Box className="flex w-full justify-center items-center pt-1">
          <span className='text-[10px] font-chrono font-bold tracking-widest   h-[12px] text-gold'>CHRONO</span>
        </Box>

        <Box className="flex min-h-0 flex-1 flex-col gap-3 px-5 py-4">
          <Box
            className={cn(
              'relative flex min-h-0  flex-col items-center justify-center overflow-hidden transition-all duration-500 p-4 border border-border/50 rounded-lg',
              urgency === 'criticalPulse' &&
              'animate-pulse border-destructive/50 bg-destructive/5 shadow-[0_0_42px_rgba(239,68,68,0.2)]',
              urgency === 'critical' &&
              'border-destructive/40 bg-destructive/5 shadow-[0_0_34px_rgba(239,68,68,0.16)]',
              urgency === 'warning' &&
              'border-orange-500/40 bg-orange-500/5 shadow-[0_0_34px_rgba(249,115,22,0.16)]',
              urgency === 'normal' &&
              'border-primary/20 bg-card/50 shadow-[0_0_46px_rgba(var(--primary-rgb),0.16)]',
            )}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.12),transparent_55%)]" />
            <div
              className={cn(
                'absolute -right-16 -top-20 h-44 w-44 rounded-full blur-[90px] opacity-25 transition-colors duration-1000',
                urgency === 'normal' ? 'bg-primary' : urgency === 'warning' ? 'bg-orange-500' : 'bg-destructive',
              )}
            />

            <Flex direction="col" align="center" className="relative z-10 text-center">
              <Text
                className={cn(
                  'text-[10px] font-black uppercase tracking-[0.24em]',
                  isOpenTime ? 'text-primary' : mode === 'lowTime' ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {isOpenTime ? 'Session Active' : 'Time Left'}
              </Text>

              {isOpenTime ? (
                <Flex
                  align="center"
                  gap="3"
                  className="mb-2 text-primary drop-shadow-[0_0_12px_rgba(var(--primary-rgb),0.4)]"
                >
                  <InfinityIcon className="h-16 w-16" strokeWidth={2.5} />
                  <Text className="text-[3.25rem] font-black uppercase leading-none tracking-tight">
                    Open Time
                  </Text>
                </Flex>
              ) : (
                <TimerDisplay
                  seconds={session.timeRemainingSeconds}
                  className={cn('mb-2 text-[5rem] font-black leading-none transition-colors duration-1000', timerColorClass)}
                />
              )}

              <Box className="w-full max-w-sm space-y-2.5">
                <Box className="h-2 w-full overflow-hidden rounded-full bg-muted/25 border border-border/50 bg-primary/5">
                  <div
                    className={cn('h-full rounded-full transition-all duration-1000', progressColor)}
                    style={{ width: `${progressPercent}%` }}
                  />
                </Box>
                <Flex justify="center" align="center">
                  <Text
                    className={cn(
                      'whitespace-nowrap text-[10px] font-bold uppercase tracking-widest',
                      mode === 'lowTime' ? 'text-destructive/80' : 'text-muted-foreground/70',
                    )}
                  >
                    {formatExpiry(session.endsAt)}
                  </Text>
                </Flex>
              </Box>
            </Flex>
          </Box>

          <Flex gap="3" className="w-full shrink-0">
            <Box className="flex-1 rounded-md border border-border/50 bg-card/40 px-3 py-2 transition-all hover:border-primary/30">
              <Text className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                Wallet Balance
              </Text>
              <Text className="text-xl font-black tracking-tight text-foreground">
                {session.remainingBalance}
              </Text>
            </Box>
            <Box className="flex-1 rounded-md border border-border/50 bg-card/40 px-3 py-2 transition-all hover:border-primary/30">
              <Text className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                Playable Time
              </Text>
              <Text className="text-xl font-black tracking-tight text-primary">
                {session.totalMinutesRemaining !== undefined
                  ? `${Math.floor(session.totalMinutesRemaining / 60)}h ${session.totalMinutesRemaining % 60}m`
                  : '--:--'}
              </Text>
            </Box>
          </Flex>

          {mode === 'lowTime' && (
            <Box className="shrink-0 animate-pulse rounded-md border border-primary/30 bg-primary/10 p-3">
              <Flex align="center" gap="3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20">
                  <Plus className="h-5 w-5 text-primary" />
                </div>
                <Box>
                  <Text className="text-xs font-black uppercase text-primary">Top Up Recommended</Text>
                  <Text className="text-[10px] font-medium text-muted-foreground">
                    Add time now to avoid automatic logout.
                  </Text>
                </Box>
              </Flex>
            </Box>
          )}

          <Box className="shrink-0 rounded-md border border-border/30 bg-background/40 p-3">
            <Flex align="center" gap="3">
              <div className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-primary/20 bg-primary/10">
                <User className="h-5 w-5 text-primary" />
                {session.profileUrl && (
                  <img
                    src={session.profileUrl}
                    alt={session.customerName}
                    className="absolute inset-0 h-full w-full bg-background object-cover"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none';
                    }}
                  />
                )}
              </div>
              <Box>
                <Text className="text-sm font-black text-foreground">{session.customerName}</Text>
                <Badge
                  variant="outline"
                  className="mt-1 h-4 rounded-full border-primary/40 bg-gradient-to-br from-primary/25 via-primary/10 to-transparent px-2 text-[7px] font-black uppercase tracking-[0.15em] text-primary shadow-[0_0_8px_rgba(var(--primary-rgb),0.2)]"
                >
                  <ShieldCheck className="mr-1 h-2.5 w-2.5" />
                  Premium
                </Badge>
              </Box>
            </Flex>
          </Box>

          <Box className="shrink-0 rounded-md border border-border/20 bg-background/20">
            <Flex className="divide-x divide-border/10">
              <Box className="flex-1 p-3">
                <Flex align="center" gap="1.5" className='justify-center'>
                  <Clock className="h-3.5 w-3.5 text-muted-foreground/60" />
                  <Text className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Started</Text>
                </Flex>
                <Text className="text-[12px] font-black text-foreground text-center -mt-1">{formatTime(session.startedAt)}</Text>
              </Box>
              <Box className="flex-1 p-3">
                <Flex align="center" gap="1.5" className='justify-center'>
                  <Coins className="h-3.5 w-3.5 text-muted-foreground/60" />
                  <Text className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Rate</Text>
                </Flex>
                <Text className="text-[12px] font-black text-foreground text-center -mt-1">{session.hourlyRate || 'PHP 0.00'}/hr</Text>
              </Box>
              <Box className="flex-1 bg-primary/5 p-3 rounded-r-md">
                <Flex align="center" gap="1.5" className='justify-center'>
                  <Zap className="h-3.5 w-3.5 text-primary/80" />
                  <Text className="text-[9px] font-bold uppercase tracking-wider text-primary text-center">Cost</Text>
                </Flex>
                <Text className="text-[12px] font-black text-primary text-center -mt-1">{sessionCost}</Text>
              </Box>
            </Flex>
          </Box>
        </Box>

        <Flex gap="2" className="shrink-0 px-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleAwayLock}
            disabled={isLocking}
            className="h-[30px] flex-1 gap-1.5 border border-border/20 bg-background/20 text-[9px] uppercase tracking-widest text-primary/60 hover:bg-background/40"
          >
            {isLocking ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Lock className="h-3 w-3" />
            )}
            {isLocking ? 'Locking...' : 'Lock'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-[30px] flex-1 gap-1.5 border border-border/20 bg-background/20 text-[9px] uppercase tracking-widest text-primary/60 hover:bg-background/40"
          >
            <Headset className="h-3 w-3" /> Support
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-[30px] flex-1 gap-1 border border-border/20 bg-background/20 text-[8px] uppercase tracking-wider text-primary/60 hover:bg-background/40 whitespace-nowrap"
          >
            <ArrowRightLeft className="h-3 w-3" /> Switch PC
          </Button>
        </Flex>

        <Box className='flex item-center justify-center'>
          <span className="text-[10px]  text-center font-medium tracking-widest text-primary/30">
            www.izur.com.ph
          </span>
        </Box>
        <Box
          className="flex flex-row items-center justify-center gap-2 border-t border-border/30 bg-background/80 pt-3 backdrop-blur-xl p-4"
        >
          <Button
            variant="default"
            className={cn(
              'flex-1 h-12 gap-3 bg-primary text-sm font-black uppercase tracking-[0.2em] text-black shadow-[0_0_20px_rgba(var(--primary-rgb),0.3)] transition-all hover:scale-[1.01] active:scale-[0.99]',
              mode === 'lowTime' && 'shadow-[0_0_20px_rgba(var(--primary-rgb),0.5)]',
            )}
            radius="md"
          >
            <Plus className="h-5 w-5" />
            {mode === 'lowTime' ? 'Top Up Now' : 'Top Up'}
          </Button>

          <Button
            variant="outline"
            onClick={onEndSession}
            disabled={isEnding}
            className="h-12 gap-2 bg-transparent text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive border-0 w-[6.5rem]"
            radius="sm"
          >
            {isEnding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <LogOut className="h-3.5 w-3.5" />
                Logout
              </>
            )}
          </Button>
        </Box>
      </Box>
    </PanelLayout >
  );
};
