import React, { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { native } from './lib/native';
import { StationStatus, SessionViewModel } from './types/pc-client';
import { AvailableState } from './components/states/AvailableState';
import { ActiveSessionState } from './components/states/ActiveSessionState';
import { LowTimeState } from './components/states/LowTimeState';
import { ExpiredState } from './components/states/ExpiredState';
import { LockedState } from './components/states/LockedState';
import { AwayLockedState } from './components/states/AwayLockedState';
import { SafeLockedState } from './components/states/SafeLockedState';
import { MaintenanceState } from './components/states/MaintenanceState';
import { OfflineState } from './components/states/OfflineState';
import { DiagnosticsScreen } from './features/diagnostics/DiagnosticsScreen';
import { UnpairedState } from './components/states/UnpairedState';
import { PendingApprovalState } from './components/states/PendingApprovalState';
import { LoadingState } from './components/states/LoadingState';
import { SystemUpdateState } from './components/states/SystemUpdateState';
import { ReservedState } from './components/states/ReservedState';
import { ThemeProvider } from '@/ui-kit';
import { runtime, RuntimeStatus } from './features/runtime/pc-client-runtime';
import { LocalClientState } from './features/local-state/local-client-state';
import { CLIENT_CONFIG } from './config/client-config';
import { Toast, ToastMessage } from './components/ui/Toast';
import { UiConfigProvider } from './contexts/UiConfigContext';
import { RecoveryScreen } from './components/RecoveryScreen';
import { ActiveSessionShell } from './components/ActiveSessionShell';
import { GameMenuPanel } from './components/GameLauncher/GameMenuPanel';

export type ExtendedRuntimeStatus = RuntimeStatus | 'DIAGNOSTICS' | 'LOADING' | 'SYSTEM_UPDATE';

export default function App() {
  const [runtimeStatus, setRuntimeStatus] = useState<ExtendedRuntimeStatus>('LOADING');
  const [localState, setLocalState] = useState<LocalClientState | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [hostname, setHostname] = useState<string>('');

  useEffect(() => {
    // Initialize runtime
    runtime.initialize();

    // Fetch device info for hostname
    native.getDeviceInfo().then((info: any) => {
      if (info?.hostname) {
        setHostname(info.hostname);
      }
    });

    // Subscribe to runtime changes
    const unsubscribe = runtime.subscribe((status, state) => {
      // Only update if we aren't viewing diagnostics
      setRuntimeStatus(current => current === 'DIAGNOSTICS' ? current : status);
      setLocalState(state);

      if (state.scheduledEndAt) {
        const endAt = new Date(state.scheduledEndAt).getTime();
        const now = Date.now();
        setTimeRemaining(Math.max(0, Math.floor((endAt - now) / 1000)));
      } else {
        setTimeRemaining(0);
      }
    });

    // Listen for global toasts
    const handleToast = (e: any) => {
      const { message, type } = e.detail;
      const id = Math.random().toString(36).substring(2, 9);
      setToasts(prev => [...prev, { id, message, type }]);
    };

    window.addEventListener('chrono-toast' as any, handleToast);

    // Tray "End Session" — the Rust core emits this; end the current session
    // using the renderer's device context (parity with the native tray menu).
    const unlistenTrayEnd = listen('tray:end-session', async () => {
      const state: any = await native.getLocalClientState();
      if (state?.activeSessionId) {
        try {
          const result = await native.pcClient.endSession({ sessionId: state.activeSessionId });
          if (!result?.success) {
            window.dispatchEvent(new CustomEvent('chrono-toast', {
              detail: { message: result?.error || 'Failed to end session', type: 'error' },
            }));
          }
        } catch (err: any) {
          window.dispatchEvent(new CustomEvent('chrono-toast', {
            detail: { message: err?.message || 'Failed to end session', type: 'error' },
          }));
        }
      }
    });

    // Rust updater daemon: hold the SYSTEM_UPDATE screen while an update
    // downloads/installs; the app relaunches itself when done.
    const unlistenSystemUpdate = listen('system-update:started', () => {
      setRuntimeStatus('SYSTEM_UPDATE');
    });

    return () => {
      unsubscribe();
      window.removeEventListener('chrono-toast' as any, handleToast);
      unlistenTrayEnd.then((un) => un()).catch(() => undefined);
      unlistenSystemUpdate.then((un) => un()).catch(() => undefined);
    };
  }, []);

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Local UI countdown (synced with runtime but for UI smoothness)
  useEffect(() => {
    if (timeRemaining > 0 && (runtimeStatus === 'ACTIVE' || runtimeStatus === 'LOW_TIME')) {
      const timer = setInterval(() => {
        setTimeRemaining(prev => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [timeRemaining, runtimeStatus]);

  const mapRuntimeToStationStatus = (status: RuntimeStatus): StationStatus => {
    switch (status) {
      case 'AVAILABLE': return 'available';
      case 'ACTIVE': return 'active';
      case 'LOW_TIME': return 'lowTime';
      case 'EXPIRED': return 'expired';
      case 'LOCKED': return 'locked';
      case 'AWAY_LOCKED': return 'locked';
      case 'MAINTENANCE': return 'maintenance';
      case 'RESERVED': return 'reserved';
      case 'OFFLINE': return 'offline';
      default: return 'locked';
    }
  };

  const formatPhp = (value?: number | string | null) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return undefined;
    return `₱${numericValue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const hourlyRate =
    formatPhp(localState?.activeSessionData?.hourlyRate) ||
    formatPhp(localState?.pricingRules?.find((rule) => rule?.type === 'HOURLY')?.price) ||
    formatPhp(localState?.pricingRules?.[0]?.price);

  const session: SessionViewModel = {
    sessionId: localState?.activeSessionId || '',
    stationId: localState?.pcId || hostname || (runtimeStatus === 'PENDING_APPROVAL' ? 'PENDING' : runtimeStatus === 'UNPAIRED' ? 'UNPAIRED' : 'IDLE'),
    stationName: localState?.stationName,
    deviceName: hostname || undefined,
    branchName: localState?.branchName || (localState?.uiConfig?.publicName as string | undefined) || 'Chrono Cafe',
    customerName: localState?.activeSessionData?.customerName || localState?.activeReservation?.customerName || (runtimeStatus === 'ACTIVE' || runtimeStatus === 'LOW_TIME' ? 'Customer' : 'None'),
    profileUrl: localState?.activeSessionData?.profileUrl,
    status: mapRuntimeToStationStatus(runtimeStatus === 'DIAGNOSTICS' || runtimeStatus === 'LOADING' ? 'AVAILABLE' : runtimeStatus),
    timeRemainingSeconds: timeRemaining,
    startedAt: localState?.activeSessionData?.startedAt,
    endsAt: localState?.scheduledEndAt,
    remainingBalance: localState?.activeSessionData?.remainingBalance || '₱0.00',
    hourlyRate,
    totalMinutesRemaining: localState?.activeSessionData?.totalMinutesRemaining,
    sessionCost: localState?.activeSessionData?.sessionCost,
    latencyMs: localState?.lastHeartbeatLatencyMs,
    message: runtimeStatus === 'AVAILABLE' ? 'Welcome! Scan to start session.' : undefined,
    tenantHeroSlide: localState?.tenantHeroSlide || null,
    specs: localState?.specs || (localState?.uiConfig as any)?.specs || null,
    deviceGroup: localState?.deviceGroup || null,
    pricingRules: localState?.pricingRules || [],
  };

  const [windowMode, setWindowMode] = useState<'lockscreen' | 'widget' | 'recovery'>('lockscreen');

  useEffect(() => {
    // Detect windowMode query parameter from current location URL
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('windowMode');
    if (mode === 'widget') {
      setWindowMode('widget');
    } else if (mode === 'recovery') {
      setWindowMode('recovery');
    } else {
      setWindowMode('lockscreen');
    }
  }, []);

  if (windowMode === 'recovery') {
    return <RecoveryScreen />;
  }

  const renderState = () => {
    if (runtimeStatus === 'DIAGNOSTICS') {
      return <DiagnosticsScreen />;
    }
    if (runtimeStatus === 'LOADING') {
      return <LoadingState stationId={session.stationId} status={session.status} />;
    }

    switch (runtimeStatus) {
      case 'SYSTEM_UPDATE':
        return <SystemUpdateState />;
      case 'UNPAIRED':
        return <UnpairedState />;
      case 'PENDING_APPROVAL':
        return <PendingApprovalState />;
      case 'AVAILABLE':
        return <AvailableState session={session} />;
      case 'RESERVED':
        return <ReservedState session={session} />;
      case 'ACTIVE':
        return <ActiveSessionState session={session} />;
      case 'LOW_TIME':
        return <LowTimeState session={session} />;
      case 'EXPIRED':
        return <ExpiredState session={session} />;
      case 'LOCKED':
        return <LockedState session={session} />;
      case 'AWAY_LOCKED':
        return <AwayLockedState session={session} />;
      case 'ERROR_SAFE_LOCKED':
        return <SafeLockedState session={session} />;
      case 'OFFLINE':
        return <OfflineState session={session} />;
      case 'MAINTENANCE':
        return <MaintenanceState session={session} />;
      default:
        return <LockedState session={session} />;
    }
  };

  if (windowMode === 'widget') {
    // The widget window only renders ACTIVE or LOW_TIME states.
    // In other states, it returns null (the Tauri core will hide it anyway).
    const isWidgetActive = runtimeStatus === 'ACTIVE' || runtimeStatus === 'LOW_TIME';
    if (!isWidgetActive) return null;

    return (
      <UiConfigProvider config={localState?.uiConfig}>
        <ActiveSessionShell
          menu={<GameMenuPanel />}
          rail={
            runtimeStatus === 'ACTIVE' ? (
              <ActiveSessionState session={session} />
            ) : (
              <LowTimeState session={session} />
            )
          }
        />
        <Toast messages={toasts} onRemove={removeToast} />
      </UiConfigProvider>
    );
  }

  // Otherwise, lockscreen window rendering:
  // It handles AVAILABLE, LOCKED, EXPIRED, SAFE_LOCKED, MAINTENANCE, PENDING_APPROVAL, SYSTEM_UPDATE, UNPAIRED, LOADING
  // If the status is ACTIVE or LOW_TIME, return null (Tauri core will hide it).
  const isLockscreenActive = runtimeStatus !== 'ACTIVE' && runtimeStatus !== 'LOW_TIME';
  if (!isLockscreenActive) return null;

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <UiConfigProvider config={localState?.uiConfig}>
        {renderState()}
        <Toast messages={toasts} onRemove={removeToast} />
        {/* Dev State Switcher - only in development */}
        {CLIENT_CONFIG.IS_DEV && (
          <div className="fixed top-4 right-4 z-50 p-1 bg-black/80   rounded-md backdrop-blur-xl scale-75 hover:scale-100 transition-transform">
            <select
              value={runtimeStatus}
              onChange={(e) => {
                const s = e.target.value;
                if (s === 'DIAGNOSTICS') {
                  setRuntimeStatus('DIAGNOSTICS');
                } else if (s === 'LOADING') {
                  setRuntimeStatus('LOADING');
                } else if (s === 'SYSTEM_UPDATE') {
                  setRuntimeStatus('SYSTEM_UPDATE');
                } else {
                  setRuntimeStatus(s as RuntimeStatus);
                  runtime.forceStatus(s as RuntimeStatus);
                }
              }}
              className="bg-transparent text-gold text-[10px] font-black uppercase tracking-widest px-3 py-1 outline-none cursor-pointer border-none"
            >
              {['LOADING', 'UNPAIRED', 'PENDING_APPROVAL', 'AVAILABLE', 'RESERVED', 'ACTIVE', 'LOW_TIME', 'EXPIRED', 'LOCKED', 'ERROR_SAFE_LOCKED', 'OFFLINE', 'MAINTENANCE', 'SYSTEM_UPDATE', 'DIAGNOSTICS'].map(s => (
                <option key={s} value={s} className="bg-black text-gold">
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}
    </UiConfigProvider>
  </ThemeProvider>
);
}
