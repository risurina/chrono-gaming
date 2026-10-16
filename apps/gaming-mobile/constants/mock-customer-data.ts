import { QuickActionItem, FeatureChip } from './schemas/ui';

// Static UI configuration for the home dashboard and welcome screen. (All API
// data now comes from the live gaming-api via lib/api-service.ts.)

export const MOCK_QUICK_ACTIONS: QuickActionItem[] = [
  { id: 'qa-1', label: 'View Session', icon: 'timer', route: '/customer/session' },
  { id: 'qa-2', label: 'Top Up', icon: 'wallet', route: '/customer/topup' },
  { id: 'qa-3', label: 'Scan QR', icon: 'qr-code', route: '/join/qr' },
  { id: 'qa-4', label: 'View History', icon: 'history', route: '/customer/history' },
];

export const MOCK_FEATURES: FeatureChip[] = [
  { id: 'f-1', label: 'Wallet Balance', icon: 'account-balance-wallet' },
  { id: 'f-2', label: 'Active Session', icon: 'timer' },
  { id: 'f-3', label: 'QR Access', icon: 'qr-code-scanner' },
  { id: 'f-4', label: 'Session History', icon: 'history' },
];
