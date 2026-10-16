import React, { useState } from 'react';
import { Lock, Unlock, User as UserIcon } from 'lucide-react';
import { SessionViewModel } from '../../types/pc-client';
import { Button, Input } from '@/ui-kit';
import { BrandMark } from '../BrandMark';
import { PcClientApi } from '../../features/api/pc-client-api';

interface AwayLockedStateProps {
  session: SessionViewModel;
}

export function AwayLockedState({ session }: AwayLockedStateProps) {
  const [isUnlocking, setIsAwayUnlocking] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleUnlock = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!password) {
      setError('Enter your account password to unlock');
      return;
    }
    setIsAwayUnlocking(true);
    setError(null);
    try {
      if (!session.sessionId) throw new Error('No active session');
      const result = await PcClientApi.unlockSession(session.sessionId, password);
      if (!result?.success) {
        setError(result?.error || 'Failed to unlock session');
      } else {
        setPassword('');
      }
      // Success will be handled by authoritative state update from server via socket/heartbeat
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsAwayUnlocking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-3xl flex flex-col items-center justify-center select-none animate-in fade-in duration-500">
      <div className="absolute top-12">
        <BrandMark className="w-16 h-16 text-gold" />
      </div>

      <div className="w-full max-w-md p-8 rounded-3xl bg-black/40 border border-white/5 flex flex-col items-center text-center gap-8 shadow-2xl">
        <div className="w-24 h-24 rounded-full bg-gold/10 flex items-center justify-center border border-gold/20 relative">
          <Lock className="w-10 h-10 text-gold" />
          <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-black border border-gold/20 flex items-center justify-center">
             <UserIcon className="w-4 h-4 text-gold" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-black text-white tracking-tight uppercase italic">
            Session Locked
          </h1>
          <p className="text-muted-foreground font-medium">
            Player <span className="text-gold">{session.customerName}</span> is currently away.
          </p>
        </div>

        <form onSubmit={handleUnlock} className="w-full space-y-4">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Account password"
            autoFocus
            disabled={isUnlocking}
            className="h-12 rounded-2xl text-center"
          />

          <Button
            type="submit"
            disabled={isUnlocking || !password}
            size="lg"
            className="w-full h-16 text-lg font-black uppercase tracking-widest bg-gold text-black hover:bg-gold/90 transition-all rounded-2xl group"
          >
            {isUnlocking ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                Unlocking...
              </span>
            ) : (
              <span className="flex items-center gap-2 group-hover:scale-105 transition-transform">
                <Unlock className="w-5 h-5" />
                Unlock Session
              </span>
            )}
          </Button>

          {error && (
            <p className="text-destructive text-sm font-bold animate-in slide-in-from-top-2 duration-300">
              {error}
            </p>
          )}

          <p className="text-[10px] text-muted-foreground/50 uppercase tracking-[0.2em] font-bold">
            Billing continues while locked
          </p>
        </form>
      </div>

      <div className="absolute bottom-12 flex flex-col items-center gap-2">
        <p className="text-[10px] text-muted-foreground/30 uppercase tracking-[0.3em] font-black">
          Station {session.stationName || session.stationId}
        </p>
      </div>
    </div>
  );
}
