import type { RuntimeJobSchedule, TradingCalendarPort } from './runtime.types.js';

const enabled = (name: string, fallback = true): boolean => {
  const raw =
    process.env[`JOB_${name.replaceAll('.', '_').replaceAll('-', '_').toUpperCase()}_ENABLED`];
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1';
};

const alertScanEnabled = (): boolean => {
  const raw = process.env.ALERT_SCAN_ENABLED;
  if (raw === undefined || raw === '') return false;
  return raw === 'true' || raw === '1';
};

export function defaultRuntimeSchedules(): readonly RuntimeJobSchedule[] {
  return [
    {
      name: 'billing.expiry-sweep',
      description: 'Expire elapsed subscriptions',
      everyMs: 3_600_000,
      tradingDay: false,
      enabled: enabled('billing.expiry-sweep'),
    },
    {
      name: 'billing.ipn-reconcile',
      description: 'Reconcile pending payment orders',
      everyMs: 21_600_000,
      tradingDay: false,
      enabled: enabled('billing.ipn-reconcile'),
    },
    {
      name: 'alerts.scan',
      description: 'Evaluate active market alerts',
      everyMs: 600_000,
      tradingDay: true,
      enabled: enabled('alerts.scan', alertScanEnabled()),
    },
    {
      name: 'journey.identity-recovery',
      description: 'Recover incomplete journey identities',
      everyMs: 900_000,
      tradingDay: false,
      enabled: enabled('journey.identity-recovery'),
    },
    {
      name: 'reports.premarket',
      description: 'Generate the pre-market report',
      pattern: '0 15 7 * * 1-5',
      tradingDay: true,
      enabled: enabled('reports.premarket'),
    },
    {
      name: 'market.snapshot-wave-1',
      description: 'Refresh international snapshot wave 1',
      pattern: '0 0 6 * * 1-5',
      tradingDay: true,
      enabled: enabled('market.snapshot-wave-1'),
    },
    {
      name: 'market.snapshot-wave-2',
      description: 'Refresh international snapshot wave 2',
      pattern: '0 5 7 * * 1-5',
      tradingDay: true,
      enabled: enabled('market.snapshot-wave-2'),
    },
    {
      name: 'market.snapshot-wave-3',
      description: 'Refresh international snapshot wave 3',
      pattern: '0 30 8 * * 1-5',
      tradingDay: true,
      enabled: enabled('market.snapshot-wave-3'),
    },
    {
      name: 'reports.midday',
      description: 'Generate the midday report',
      pattern: '0 30 11 * * 1-5',
      tradingDay: true,
      enabled: enabled('reports.midday'),
    },
    {
      name: 'journey.cap2-close-scan',
      description: 'Record verified closing-price breaches',
      pattern: '0 5 15 * * 1-5',
      tradingDay: true,
      enabled: enabled('journey.cap2-close-scan'),
    },
    {
      name: 'reports.daily',
      description: 'Generate the end-of-day report',
      pattern: '0 30 16 * * 1-5',
      tradingDay: true,
      enabled: enabled('reports.daily'),
    },
    {
      name: 'reports.daily-retry',
      description: 'Retry a missing daily report',
      pattern: '0 0 17 * * 1-5',
      tradingDay: true,
      enabled: enabled('reports.daily-retry'),
    },
    {
      name: 'journey.cap5-consensus',
      description: 'Refresh watchlist consensus',
      pattern: '0 30 18 * * 1-5',
      tradingDay: true,
      enabled: enabled('journey.cap5-consensus'),
    },
    {
      name: 'bot.session-eod',
      description: 'Run the standard bot after close',
      pattern: '0 0 19 * * 1-5',
      tradingDay: true,
      enabled: enabled('bot.session-eod'),
    },
  ];
}

export class WeekdayCalendar implements TradingCalendarPort {
  async isTradingDay(date: string): Promise<boolean> {
    const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    return day !== 0 && day !== 6;
  }
}
