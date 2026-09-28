# Mobile smoke tests

The Node smoke test validates the package and Expo metadata without requiring an emulator. CI runs it on every change under `apps/mobile`.

## Maestro matrix

When Maestro flows are added, run the same smoke flow against the supported targets:

| Target | Flow | Purpose |
| --- | --- | --- |
| Android emulator | `maestro/launch.yaml` | App launches and the primary navigation is reachable |
| iOS simulator | `maestro/launch.yaml` | App launches and the primary navigation is reachable |

Keep flows deterministic and independent of network data. Store them in `apps/mobile/maestro/` and invoke them locally with `maestro test maestro/launch.yaml`.
