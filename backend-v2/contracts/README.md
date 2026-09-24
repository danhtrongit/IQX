# API contract snapshots

These files make the strangler migration measurable:

- `legacy-v1-endpoints.json` is generated from the mounted FastAPI v1 routers
  using Python's AST only. The legacy application, settings and `.env` are
  never imported or executed.
- `legacy-v1-dispositions.json` is human-maintained. Routes are `pending` by
  default; absence of an override does not mean that a route is unused.
- `openapi-v2.json` is generated from the Nest application factory without
  listening on a socket. It includes native v2 operations and any intentionally
  mounted v1 compatibility operations.
- `client/` contains compile-time TypeScript request/response types generated
  from `openapi-v2.json`. It intentionally contains no SDK, transport, hooks or
  runtime validation code.

From `backend-v2`, regenerate the snapshots with:

```sh
python3 scripts/generate-legacy-contract.py
npm run contracts:generate
```

Check for drift without changing files with:

```sh
python3 scripts/generate-legacy-contract.py --check
npm run contracts:check
```

The legacy generator fails when it encounters dynamic or unsupported router
registration. Extend the extractor explicitly rather than silently dropping a
route from the migration inventory.
