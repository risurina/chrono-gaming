import React from 'react';
import { SessionViewModel } from '../../types/pc-client';
import { ScreenLayout } from '../ui/ScreenLayout';
import { Sparkles } from 'lucide-react';
import { Button } from '@risurina/oikos/ui';
import { runtime } from '../../features/runtime/pc-client-runtime';
import { useUiConfig } from '../../contexts/UiConfigContext';

export const ExpiredState: React.FC<{ session: SessionViewModel }> = ({ session }) => {
  const config = useUiConfig();
  const venueName = config?.publicName?.trim() || 'us';

  const handleGoToLogin = () => {
    runtime.goToLogin();
  };

  return (
    <ScreenLayout>
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md w-full premium-card p-12 border-primary/30 text-center">
          <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center mb-8 mx-auto">
             <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-3xl font-black tracking-tight text-foreground mb-4 uppercase">
            Thanks for Playing!
          </h2>
          <p className="text-muted-text text-lg leading-relaxed mb-10 font-medium">
            You've been logged out. Thanks for gaming at {venueName} — we hope you had a blast and can't wait to see you again soon!
          </p>
          <div className="w-full py-4 px-6 bg-primary/5 rounded-sm mb-6">
             <p className="text-sm font-bold text-foreground">
               Come back anytime — your next session is just a tap away.
             </p>
          </div>

          <Button onClick={handleGoToLogin} className="w-full font-bold uppercase tracking-wider py-4">
            Back to Login
          </Button>

          <p className="mt-8 text-lg font-black uppercase tracking-widest text-muted-text/40">
            {session.stationId}
          </p>
        </div>
      </div>
    </ScreenLayout>
  );
};
