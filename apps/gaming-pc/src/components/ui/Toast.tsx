import React, { useEffect } from 'react';

import { Button } from '@risurina/oikos/ui';

export interface ToastMessage {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'danger';
  duration?: number;
}

export const Toast: React.FC<{ messages: ToastMessage[]; onRemove: (id: string) => void }> = ({
  messages,
  onRemove,
}) => {
  return (
    <div className="fixed bottom-8 right-8 z-[100] flex flex-col gap-3">
      {messages.map((m) => (
        <ToastItem key={m.id} message={m} onRemove={() => onRemove(m.id)} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ message: ToastMessage; onRemove: () => void }> = ({
  message,
  onRemove,
}) => {
  useEffect(() => {
    const timer = setTimeout(onRemove, message.duration || 5000);
    return () => clearTimeout(timer);
  }, [message, onRemove]);

  const bgColor = {
    info: 'bg-surface-warm/90 border-gold/30',
    success: 'bg-success/90 border-success/30',
    warning: 'bg-gold/90 border-gold/30',
    danger: 'bg-danger/90 border-danger/30',
  }[message.type];

  const textColor = message.type === 'info' ? 'text-white' : 'text-primary-foreground';

  return (
    <div
      className={`min-w-[300px] p-5 rounded-xl border backdrop-blur-xl shadow-2xl flex items-center justify-between animate-in slide-in-from-right-full duration-300 ${bgColor}`}
    >
      <p className={`font-bold text-sm ${textColor}`}>{message.message}</p>
      <Button variant="icon" size="icon" aria-label="Close Toast" onClick={onRemove} className={`${textColor} h-6 w-6 opacity-50 hover:opacity-100 hover:bg-transparent ml-4 shrink-0`}>
        ✕
      </Button>
    </div>
  );
};
