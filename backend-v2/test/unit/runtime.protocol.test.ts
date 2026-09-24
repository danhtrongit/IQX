import { describe, expect, it } from 'vitest';

import { eventChannel, parseClientFrame } from '../../src/modules/realtime/protocol.js';
import { normalizePayload } from '../../src/modules/realtime/normalize.js';
import {
  createDnseProviderFactory,
  providerOptionsFromEnvironment,
} from '../../src/modules/realtime/dnse.stream.js';

describe('realtime protocol', () => {
  it('normalizes subscribe frames and rejects malformed symbols', () => {
    expect(
      parseClientFrame({ action: 'subscribe', symbols: [' fpt ', 'FPT'], channels: ['tick'] }),
    ).toEqual({
      action: 'subscribe',
      symbols: ['FPT'],
      channels: ['tick'],
    });
    expect(
      parseClientFrame({ action: 'subscribe', symbols: ['A/B'], channels: ['tick'] }),
    ).toBeNull();
  });

  it('maps the legacy and v2 channel names to one Redis event channel', () => {
    expect(eventChannel('orderbook', 'fpt')).toBe('rt:ob:FPT');
    expect(eventChannel('tick', 'fpt')).toBe('rt:tick:FPT');
  });

  it('normalizes stock prices to absolute VND while keeping index points', () => {
    expect(normalizePayload('tick', 'FPT', { matchPrice: 73.4, matchQtty: 100 }).price).toBe(
      73_400,
    );
    expect(normalizePayload('index', 'VNINDEX', { valueIndexes: 1_350.2 }).value).toBe(1_350.2);
  });

  it('fails configuration before opening an upstream connection', () => {
    const options = providerOptionsFromEnvironment({ DNSE_TRANSPORT: 'openapi' });
    expect(() => createDnseProviderFactory(options)).toThrow('credentials are required');
  });
});
