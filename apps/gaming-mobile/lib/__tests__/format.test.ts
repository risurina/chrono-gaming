import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatTimeRemaining,
  formatDate,
  formatDuration,
  formatStatus
} from '../format';

describe('format utilities', () => {
  describe('formatCurrency', () => {
    it('should format numbers as PHP currency', () => {
      const result = formatCurrency(1234.56);
      expect(result).toMatch(/[₱P]/);
      expect(result).toMatch(/1,234\.56/);
    });

    it('should handle zero', () => {
      const result = formatCurrency(0);
      expect(result).toMatch(/0\.00/);
    });

    it('should handle negative numbers', () => {
      const result = formatCurrency(-50);
      expect(result).toMatch(/50\.00/);
      expect(result.includes('-') || result.includes('(')).toBe(true);
    });
  });

  describe('formatTimeRemaining', () => {
    it('should format seconds into HH:MM:SS', () => {
      expect(formatTimeRemaining(3661)).toBe('01:01:01');
      expect(formatTimeRemaining(60)).toBe('00:01:00');
      expect(formatTimeRemaining(3599)).toBe('00:59:59');
    });

    it('should handle large amounts of seconds', () => {
      expect(formatTimeRemaining(360000)).toBe('100:00:00');
    });
  });

  describe('formatDate', () => {
    it('should format Date objects to en-PH long format', () => {
      const date = new Date(2023, 11, 25);
      const result = formatDate(date);
      expect(result).toMatch(/Dec 25, 2023/);
    });

    it('should handle ISO string dates', () => {
      const result = formatDate('2023-01-01');
      expect(result).toMatch(/(Jan 1, 2023|Dec 31, 2022)/);
    });
  });

  describe('formatDuration', () => {
    it('should format minutes only when less than an hour', () => {
      expect(formatDuration(45)).toBe('45m');
    });

    it('should format hours only when exactly multiple of 60', () => {
      expect(formatDuration(120)).toBe('2h');
    });

    it('should format both hours and minutes', () => {
      expect(formatDuration(75)).toBe('1h 15m');
    });
  });

  describe('formatStatus', () => {
    it('should capitalize the first letter and lowercase the rest', () => {
      expect(formatStatus('ACTIVE')).toBe('Active');
      expect(formatStatus('pending')).toBe('Pending');
      expect(formatStatus('iN_pRoGrEsS')).toBe('In_progress');
    });
  });
});
