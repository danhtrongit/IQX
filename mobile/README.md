# IQX Mobile

Ứng dụng di động IQX (Expo SDK 57, React Native 0.86, React 19, expo-router, TypeScript). Giao diện tiếng Việt.

## Cài đặt

```bash
cd mobile
npm install
cp .env.example .env.local   # chỉnh EXPO_PUBLIC_API_URL nếu cần
```

## Biến môi trường

| Biến | Mặc định | Ghi chú |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `https://iqx.vn/api/v2` | Dev local: `http://127.0.0.1:8000/api/v2`. Trên Android emulator, `127.0.0.1`/`localhost` được tự đổi thành `10.0.2.2`. |

`.env.local` đã được gitignore. App dev cho phép HTTP tới localhost (iOS ATS ngoại lệ, Android `usesCleartextTraffic`); cân nhắc tắt cleartext cho bản production.

## Chạy app

```bash
npx expo run:ios       # iOS simulator (cần Xcode)
npx expo run:android   # Android emulator (cần Android Studio)
npx expo start         # chỉ dev server (dev build đã cài)
```

App dùng module native (NativeTabs, secure-store, glass effect) nên cần development build, không chạy được trong Expo Go.

## Kiểm thử

```bash
npm test            # unit test (jest-expo): API client, auth, format, tokens
npm run typecheck   # tsc --noEmit
npm run lint        # expo lint
npm run e2e:ios     # Maestro: maestro test .maestro
```

Maestro cần biến `IQX_EMAIL` và `IQX_PASSWORD`:

```bash
maestro test -e IQX_EMAIL=you@example.com -e IQX_PASSWORD='...' .maestro
```

Flow dùng lại: `.maestro/subflows/login.yaml` (gọi bằng `- runFlow: subflows/login.yaml`).

## Cấu trúc

```
src/
  app/                 route (expo-router): (auth)/login, register; (tabs)/trade|portfolio|strategy|more
  components/ui/       Screen, Text, Button, Card, Input, Badge, Tabs, ListRow, PanelState...
  features/            trading, strategy, explore (do từng nhóm tính năng sở hữu)
  lib/api/             ApiError, apiRequest, unwrapData, refresh 401, retry
  lib/auth/            AuthProvider, useAuth, token-store (expo-secure-store)
  lib/query.tsx        QueryClient + focusManager
  lib/format.ts        định dạng vi-VN (không dùng Intl)
  theme/               tokens.generated.ts (sinh tự động), useTheme
scripts/sync-design-tokens.mjs
.maestro/              flow e2e
```

## Design

Hợp đồng thiết kế của app di động nằm ở [`DESIGN.md`](./DESIGN.md) (phần chênh lệch so với [`frontend/DESIGN.md`](../frontend/DESIGN.md)); không lặp lại quy tắc ở đây. Token màu sinh bằng `npm run tokens:sync` vào `src/theme/tokens.generated.ts` (không sửa tay, test fail nếu lỗi thời).

Điểm vào trong code:
- `src/theme/tokens.ts`: `layout`, `typography`, `NUMERIC_FONT_SCALE_CAP` (theo DESIGN.md §2–§3). `Text` có prop `capFontScale` chỉ dành cho ô số trong bảng và trục biểu đồ.
- `src/components/ui`: thư viện primitive duy nhất, gồm `SnackbarProvider`/`useSnackbar` (DESIGN.md §7), `GlassSurface` (§6, đánh giá lại Reduce Transparency ngay khi đổi).
- `src/lib/query.tsx`: `POLL` và `wireLifecycle()` dừng polling khi vào nền hoặc mất mạng (§8).
- `src/lib/haptics.ts`: haptic tuỳ chọn, không làm gì khi bị tắt (§7).
