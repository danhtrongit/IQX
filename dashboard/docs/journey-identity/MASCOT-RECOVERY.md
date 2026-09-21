# Mascot data recovery — 2026-09-21

## Root causes fixed

The market-data adapters publish OHLCV timestamps as `time`, but AI insight's raw-input builder discarded that key. Its downstream learning snapshot therefore lost the market-session date even when all five AI verdicts were present. The builder now preserves the provider timestamp; the snapshot parser accepts the actual ISO/Unix second/millisecond source formats and Vietnam session dates. Request time and `updatedAt` remain excluded as evidence of a market session. The Insight cache key is versioned so results built before this fix do not reintroduce missing session dates.

Manual learning submissions also used an account's admin role to tag the action as an administrative import. User-facing submit now records `learning` for both ordinary users and administrators. Explicit seed/import records remain excluded by the canonical classifier.

## Audited legacy compatibility

Older learners can have complete `doc_5_lop` and `ai_5_lop` maps on `OrderKehoach`, without a `JourneyAssessment` or the newer pre-reveal protocol receipt. These rows are **not** rewritten into canonical evidence and no claim of historical pre-reveal proof is made.

An operator can recover a named completed learner with `grant_legacy_mascot(session, user_id, admin_id, reason)`. This internal operation:

- requires an active administrator and completed C4/C6;
- reads only that learner's real, complete BUY/Thực chiến plan snapshots within the original window;
- takes the first complete snapshot per normalized symbol/session, rejecting ambiguous first timestamps;
- counts exact ok/neu/bad matches equally, with the existing fixed layer tie-break;
- records an append-only `journey.mascot_legacy_recovery` admin audit receipt, including source IDs, maps, timestamps, contributions and hashes;
- never invents trades, answers, source dates, learning events, money, or Bot activity;
- never overwrites an already assigned canonical profile or rerolls an existing recovery.

The API exposes this receipt as `assignment_basis=legacy_order_snapshot`. The profile panel explicitly labels the source as historical stored readings. Normal assignment stays unchanged and no database migration or public grant endpoint is introduced. Once recovered, the original egg/reveal/greet/run milestones continue to be saved through the same authenticated API.

## Known boundary

A zero-evidence account still cannot receive an evidence-based species. Likewise, snapshots whose original source timestamps were lost cannot be made canonical by filling in a guessed date. Recovery requires actual stored paired readings or a separate, explicitly labelled QA display grant; that QA path is outside this change.

## Validation

See the dedicated regression files:

- `backend/tests/test_journey_snapshot_session.py`
- `backend/tests/test_journey_identity_manual_admin.py`
- `backend/tests/test_journey_identity_legacy_recovery.py`
- `dashboard/src/features/journey-identity/IdentityPanel.legacy.test.tsx`

Tests cover source timestamps, pre-reveal ownership, seed exclusion, legacy selection/ties, account/window boundaries, idempotency, tampering, frozen receipts, and historical-source copy.
