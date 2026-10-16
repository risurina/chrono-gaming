import React, { useState } from 'react';
import { SessionViewModel } from '../../types/pc-client';
import { PcClientApi } from '../../features/api/pc-client-api';
import { SessionDashboard } from '../SessionDashboard';

export const LowTimeState: React.FC<{ session: SessionViewModel }> = ({ session }) => {
  const [isEnding, setIsEnding] = useState(false);

  const handleEndSession = async () => {
    if (!session.sessionId) {
      console.error('No session ID available to end');
      return;
    }
    setIsEnding(true);
    try {
      const result = await PcClientApi.endSession(session.sessionId);
      if (!result.success) {
        throw new Error(result.error || 'Failed to end session');
      }
    } catch (error) {
      console.error('Failed to end session:', error);
      alert('Failed to end session');
    } finally {
      setIsEnding(false);
    }
  };

  return (
    <SessionDashboard
      session={session}
      onEndSession={handleEndSession}
      isEnding={isEnding}
      mode="lowTime"
    />
  );
};
