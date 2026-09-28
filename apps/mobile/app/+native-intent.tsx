/**
 * Keep the web route names as the public deep-link contract while mapping
 * them to the native Expo Router screens. Query parameters are preserved so
 * alert, chart, tour, and journey links can carry their current state.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const [pathname, query = ''] = normalized.split('?');
  const querySuffix = query ? `?${query}` : '';

  if (pathname === '/' || pathname === '/thi-truong') return `/(tabs)/market${querySuffix}`;
  if (pathname === '/co-phieu') return `/(tabs)/market${querySuffix}`;
  if (pathname.startsWith('/co-phieu/')) {
    const symbol = pathname.slice('/co-phieu/'.length);
    return `/stock/${symbol}${querySuffix}`;
  }
  if (pathname === '/bang-gia' || pathname === '/bieu-do') return `/(tabs)/market${querySuffix}`;
  if (pathname === '/demo-trading') return `/(tabs)/trading${querySuffix}`;
  if (pathname === '/chien-luoc' || pathname === '/canh-bao' || pathname === '/backtest') {
    return `/(tabs)/strategy${querySuffix}`;
  }
  if (pathname === '/bai-hoc' || pathname === '/kien-thuc') return `/(tabs)/learning${querySuffix}`;
  if (pathname === '/nang-cap') return `/premium${querySuffix}`;
  if (pathname === '/tai-khoan' || pathname === '/cai-dat') return `/settings${querySuffix}`;
  return `${pathname}${querySuffix}`;
}

