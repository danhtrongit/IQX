import { resolveApiBase } from '../config';

describe('resolveApiBase', () => {
  it('defaults to production', () => {
    expect(resolveApiBase(undefined, 'ios')).toBe('https://iqx.vn/api/v2');
    expect(resolveApiBase('  ', 'ios')).toBe('https://iqx.vn/api/v2');
  });
  it('keeps loopback on iOS', () => {
    expect(resolveApiBase('http://127.0.0.1:8000/api/v2/', 'ios')).toBe('http://127.0.0.1:8000/api/v2');
  });
  it('rewrites loopback on Android', () => {
    expect(resolveApiBase('http://127.0.0.1:8000/api/v2', 'android')).toBe('http://10.0.2.2:8000/api/v2');
    expect(resolveApiBase('http://localhost:8000/api/v2', 'android')).toBe('http://10.0.2.2:8000/api/v2');
    expect(resolveApiBase('https://iqx.vn/api/v2', 'android')).toBe('https://iqx.vn/api/v2');
  });
});
