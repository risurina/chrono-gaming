import React from 'react';
import { ScreenLayout } from '../ui/ScreenLayout';
import { StationStatus } from '../../types/pc-client';

import { ChronoSpinner } from '../ui/ChronoSpinner';

interface LoadingStateProps {
  stationId?: string;
  status?: StationStatus;
}

export const LoadingState: React.FC<LoadingStateProps> = ({ stationId, status }) => {
  return (
    <ScreenLayout stationId={stationId} status={status}>
      <main className="flex flex-1 flex-col items-center justify-center space-y-6">
        {/* Logo and Spinner Cluster */}
        <ChronoSpinner size={160} />

        {/* Typography Section */}
        <div className="text-center space-y-3 flex flex-col items-center">
          <h1 className="text-lg md:text-xl font-medium text-primary tracking-wide animate-pulse">
            Connecting to Chrono Network...
          </h1>
          <div className="flex items-center space-x-2 text-muted-foreground bg-muted/80 px-4 py-1.5 rounded-full border border-border/30">
           <p className="text-sm tracking-wide text-gray-00">
            Syncing your gaming session
          </p></div>
        </div>
      </main>
    </ScreenLayout>
  );
};
