import { QuickActionItem, FeatureChip } from './schemas/ui';

/** Home quick-action shortcuts (all route to live screens). */
export const QUICK_ACTIONS: QuickActionItem[] = [
  { id: 'qa-1', label: 'Stations', icon: 'grid-view', route: '/customer/stations' },
  { id: 'qa-2', label: 'Wallet', icon: 'wallet', route: '/customer/wallet' },
  { id: 'qa-3', label: 'Scan QR', icon: 'qr-code', route: '/join/qr' },
  { id: 'qa-4', label: 'History', icon: 'history', route: '/customer/history' },
];

/** Feature chips shown on the welcome screen. */
export const FEATURE_CHIPS: FeatureChip[] = [
  { id: 'f-1', label: 'Wallet Balance', icon: 'account-balance-wallet' },
  { id: 'f-2', label: 'Active Session', icon: 'timer' },
  { id: 'f-3', label: 'QR Access', icon: 'qr-code-scanner' },
  { id: 'f-4', label: 'Session History', icon: 'history' },
];
