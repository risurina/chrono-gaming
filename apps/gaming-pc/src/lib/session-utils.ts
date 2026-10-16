import { StationStatus } from '../types/pc-client';

export const formatTime = (timeStr?: string) => {
  if (!timeStr) return '--:--';
  try {
    const date = new Date(timeStr);
    if (isNaN(date.getTime())) return timeStr;
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return timeStr;
  }
};

export const formatExpiry = (endsAt?: string) => {
  if (!endsAt) return 'No time limit • Pay as you go';
  try {
    const date = new Date(endsAt);
    if (isNaN(date.getTime())) return endsAt;

    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const isTomorrow = new Date(now.getTime() + 86400000).toDateString() === date.toDateString();

    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dayStr = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : date.toLocaleDateString([], { month: 'short', day: 'numeric' });

    return `Expires ${dayStr} • ${timeStr}`;
  } catch (e) {
    return endsAt;
  }
};

export const getProgressPercent = (startedAt?: string, endsAt?: string, remainingSeconds = 0) => {
  if (!startedAt || !endsAt) return 100;
  const total = (new Date(endsAt).getTime() - new Date(startedAt).getTime()) / 1000;
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (remainingSeconds / total) * 100));
};

export const getProgressColor = (remainingSeconds: number) => {
  if (remainingSeconds < 300) return 'bg-destructive'; // Under 5 mins
  if (remainingSeconds < 600) return 'bg-destructive'; // Under 10 mins
  if (remainingSeconds < 1800) return 'bg-orange-500'; // Under 30 mins
  return 'bg-primary'; // Normal
};

export const getTimerColorClass = (remainingSeconds: number) => {
  if (remainingSeconds < 600) return 'text-destructive';
  if (remainingSeconds < 1800) return 'text-orange-500';
  return 'text-primary';
};

export const shouldShowSeconds = (remainingSeconds: number) => {
  return remainingSeconds < 3600; // Under 1 hour
};

export const getTimerUrgency = (remainingSeconds: number) => {
  if (remainingSeconds <= 300) return 'criticalPulse';
  if (remainingSeconds <= 600) return 'critical';
  if (remainingSeconds <= 1800) return 'warning';
  return 'normal';
};

export const getPingTone = (latencyMs: number) => {
  if (latencyMs <= 30) return 'good';
  if (latencyMs <= 60) return 'warning';
  return 'critical';
};

export const formatTimer = (totalSeconds: number, _showSeconds: boolean = true) => {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  return {
    hours: hrs.toString().padStart(2, '0'),
    mins: mins.toString().padStart(2, '0'),
    secs: secs.toString().padStart(2, '0')
  };
};
