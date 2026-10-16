'use client';

import React, { useState, useEffect } from 'react';
import { getDeviceFingerprint, getDeviceInfo } from '../../lib/device';
import { getDeviceToken } from '../../lib/storage';
import { native } from '../../lib/native';
import { ScreenLayout } from '../../components/ui/ScreenLayout';
import { Button } from '@/ui-kit';


export function DiagnosticsScreen() {
  const [fingerprint, setFingerprint] = useState<string>('Loading...');
  const [deviceInfo, setDeviceInfo] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [stationName, setStationName] = useState<string | null>(null);
  const [lastHeartbeat, setLastHeartbeat] = useState<string>('Never');
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'error'>('disconnected');

  useEffect(() => {
    async function loadIdentity() {
      const f = await getDeviceFingerprint();
      const info = await getDeviceInfo();
      const t = await getDeviceToken();
      const state = await native.getLocalClientState();

      setFingerprint(f);
      setDeviceInfo(info);
      setToken(t);
      setStationName(state?.stationName || null);
    }
    loadIdentity();
  }, []);

  return (
    <ScreenLayout>
      <main className="flex flex-1 flex-col items-center justify-center space-y-6 ">
        <div className="max-w-1/2 w-full premium-card p-8 rounded-sm  text-left relative overflow-hidden group bg-background space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black uppercase tracking-tighter premium-text-gradient">
              System Diagnostics
            </h2>
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/5">
              <div className={`h-2 w-2 rounded-full animate-pulse ${
                connectionStatus === 'connected' ? 'bg-emerald-500' : 'bg-rose-500'
              }`} />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {connectionStatus === 'connected' ? 'Live' : 'Offline'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Device ID */}
            <div className="p-4 rounded-xl bg-white/5 border border-white/5 flex flex-col gap-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-gold/60">Device ID (Fingerprint)</p>
              <p className="text-sm font-mono text-white truncate" title={fingerprint}>
                {fingerprint && fingerprint.length > 6 ? fingerprint.slice(-6) : fingerprint}
              </p>
            </div>

            {/* Token Status */}
            <div className="p-4 rounded-xl bg-white/5 border border-white/5 flex flex-col gap-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-gold/60">Token Status</p>
              <p className={`text-sm font-bold ${token ? 'text-emerald-500' : 'text-rose-500'}`}>
                {token ? 'TRUSTED / AUTHENTICATED' : 'MISSING / UNAUTHORIZED'}
              </p>
            </div>

            {/* Station Label */}
            <div className="p-4 rounded-xl bg-white/5 border border-white/5 flex flex-col gap-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-gold/60">Station Label</p>
              <p className="text-sm font-bold text-white">
                {stationName || deviceInfo?.hostname || 'Loading...'}
              </p>
            </div>

            {/* Version */}
            <div className="p-4 rounded-xl bg-white/5 border border-white/5 flex flex-col gap-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-gold/60">Client Version</p>
              <p className="text-sm font-bold text-white">
                {deviceInfo?.clientVersion || '0.0.0'}
              </p>
            </div>

            {/* OS Info */}
            <div className="col-span-1 md:col-span-2 p-4 rounded-xl bg-white/5 border border-white/5 flex flex-col gap-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-gold/60">Operating System</p>
              <p className="text-sm text-slate-300">
                {deviceInfo?.osVersion || 'Loading...'}
              </p>
            </div>

            {/* Heartbeat */}
            <div className="col-span-1 md:col-span-2 p-4 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-gold/60">Last Heartbeat</p>
                <p className="text-sm font-bold text-white">{lastHeartbeat}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="bg-gold/10 border-gold/20 text-gold text-[10px] font-black uppercase tracking-widest hover:bg-gold/20"
                onClick={() => setLastHeartbeat(new Date().toLocaleTimeString())}
              >
                Force Ping
              </Button>
            </div>
          </div>

          <div className="pt-4 border-t border-white/5 flex justify-between items-center">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              CHRONO by IZUR Infrastructure V1
            </p>
            <div className="flex gap-2">
              {/* Future Actions like Log Export */}
            </div>
          </div></div>
      </main>
    </ScreenLayout>
  );
}
