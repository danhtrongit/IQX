-- Demo Trading corporate actions. This migration is additive only: it stores the
-- rights rollout policy, normalized VCI dividends/AIS evidence and per-account
-- entitlements, plus the ledger guards needed to apply them idempotently. No
-- existing account, position, settlement or ledger data is rewritten.

-- Applied transactionally by the existing migration runner.
CREATE TABLE virtual_rights_policy (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  deployment_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO virtual_rights_policy(singleton, deployment_date)
VALUES (TRUE, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date);

CREATE TABLE virtual_corporate_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(20) NOT NULL DEFAULT 'VCI' CHECK (source = 'VCI'),
  source_event_id VARCHAR(64) NOT NULL,
  symbol VARCHAR(10) NOT NULL,
  event_code VARCHAR(3) NOT NULL CHECK (event_code IN ('DIV','ISS','AIS')),
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('cash_dividend','stock_dividend','listing')),
  event_title_en TEXT NOT NULL DEFAULT '',
  announced_date DATE,
  exright_date DATE,
  record_date DATE,
  payout_date DATE,
  issue_date DATE,
  cash_per_share_vnd BIGINT,
  stock_ratio NUMERIC(20,10),
  credit_date DATE,
  credit_action_id UUID REFERENCES virtual_corporate_actions(id),
  disposition VARCHAR(24) NOT NULL DEFAULT 'processable'
    CHECK (disposition IN ('processable','skipped_pre_deploy','review_required')),
  review_reason TEXT,
  financial_frozen_at TIMESTAMPTZ,
  latest_payload JSONB NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_virtual_corporate_action_source UNIQUE (source, source_event_id),
  CONSTRAINT ck_virtual_corporate_action_terms CHECK (
    (kind='cash_dividend' AND event_code='DIV'
      AND cash_per_share_vnd IS NOT NULL AND cash_per_share_vnd > 0
      AND stock_ratio IS NULL)
    OR (kind='stock_dividend' AND event_code='ISS'
      AND stock_ratio IS NOT NULL AND stock_ratio > 0 AND cash_per_share_vnd IS NULL)
    OR (kind='listing' AND event_code='AIS'
      AND issue_date IS NOT NULL AND cash_per_share_vnd IS NULL AND stock_ratio IS NULL)
  ),
  CONSTRAINT ck_virtual_corporate_action_credit CHECK (
    (credit_date IS NULL AND credit_action_id IS NULL)
    OR (kind='stock_dividend' AND record_date IS NOT NULL
        AND credit_date IS NOT NULL AND credit_action_id IS NOT NULL
        AND credit_date > record_date)
  )
);
CREATE INDEX ix_virtual_rights_action_ex
  ON virtual_corporate_actions(exright_date, symbol, id)
  WHERE kind <> 'listing' AND disposition='processable';
CREATE INDEX ix_virtual_rights_ais
  ON virtual_corporate_actions(symbol, issue_date, source_event_id)
  WHERE kind='listing';
CREATE INDEX ix_virtual_rights_unresolved
  ON virtual_corporate_actions(record_date, symbol)
  WHERE kind='stock_dividend' AND credit_date IS NULL;

CREATE TABLE virtual_rights_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES virtual_trading_accounts(id) ON DELETE CASCADE,
  corporate_action_id UUID NOT NULL REFERENCES virtual_corporate_actions(id),
  account_epoch_at TIMESTAMPTZ NOT NULL,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('cash_dividend','stock_dividend')),
  effective_ex_date DATE NOT NULL,
  eligibility_date DATE NOT NULL,
  eligible_quantity INTEGER NOT NULL CHECK (eligible_quantity >= 0),
  cash_amount_vnd BIGINT NOT NULL DEFAULT 0 CHECK (cash_amount_vnd >= 0),
  share_quantity INTEGER NOT NULL DEFAULT 0 CHECK (share_quantity >= 0),
  avg_before_ex_vnd BIGINT NOT NULL CHECK (avg_before_ex_vnd >= 0),
  avg_after_ex_vnd BIGINT NOT NULL CHECK (avg_after_ex_vnd >= 0),
  status VARCHAR(24) NOT NULL CHECK (
    status IN ('no_entitlement','pending_cash','pending_stock','paid','credited','cancelled_reset')
  ),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  fulfilled_at TIMESTAMPTZ,
  CONSTRAINT uq_virtual_rights_account_action UNIQUE (account_id, corporate_action_id),
  CONSTRAINT ck_virtual_rights_dates CHECK (eligibility_date < effective_ex_date),
  CONSTRAINT ck_virtual_rights_kind_amount CHECK (
    (kind='cash_dividend' AND share_quantity=0)
    OR (kind='stock_dividend' AND cash_amount_vnd=0)
  ),
  CONSTRAINT ck_virtual_rights_state CHECK (
    (status='no_entitlement' AND eligible_quantity=0
      AND cash_amount_vnd=0 AND share_quantity=0 AND fulfilled_at IS NULL)
    OR (status='pending_cash' AND kind='cash_dividend'
      AND eligible_quantity>0 AND fulfilled_at IS NULL)
    OR (status='pending_stock' AND kind='stock_dividend'
      AND eligible_quantity>0 AND fulfilled_at IS NULL)
    OR (status='paid' AND kind='cash_dividend'
      AND eligible_quantity>0 AND fulfilled_at IS NOT NULL)
    OR (status='credited' AND kind='stock_dividend'
      AND eligible_quantity>0 AND fulfilled_at IS NOT NULL)
    OR (status='cancelled_reset' AND fulfilled_at IS NOT NULL)
  )
);
CREATE INDEX ix_virtual_rights_pending
  ON virtual_rights_entitlements(account_id, corporate_action_id)
  WHERE status IN ('pending_cash','pending_stock');
CREATE INDEX ix_virtual_rights_action_accounts
  ON virtual_rights_entitlements(corporate_action_id, account_id);
CREATE INDEX ix_virtual_rights_trade_replay
  ON virtual_trades(account_id, symbol, traded_at, id);

-- Snapshots cannot be edited; only specified lifecycle transitions are allowed.
CREATE FUNCTION protect_virtual_rights_entitlement() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['status','fulfilled_at'])
      IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','fulfilled_at']) THEN
    RAISE EXCEPTION 'Rights entitlement snapshot is immutable';
  END IF;
  IF NEW.status = OLD.status THEN
    IF NEW.fulfilled_at IS DISTINCT FROM OLD.fulfilled_at THEN
      RAISE EXCEPTION 'Rights transition timestamp is immutable';
    END IF;
  ELSIF NOT (
    (OLD.status='pending_cash' AND NEW.status IN ('paid','cancelled_reset'))
    OR (OLD.status='pending_stock' AND NEW.status IN ('credited','cancelled_reset'))
  ) THEN
    RAISE EXCEPTION 'Invalid rights entitlement transition';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_protect_virtual_rights_entitlement
  BEFORE UPDATE ON virtual_rights_entitlements
  FOR EACH ROW EXECUTE FUNCTION protect_virtual_rights_entitlement();

ALTER TABLE virtual_cash_ledger ADD CONSTRAINT ck_virtual_rights_ledger_reference CHECK (
  reference_type IS DISTINCT FROM 'rights_entitlement'
  OR (reference_id IS NOT NULL
      AND kind IN ('rights_ex_applied','rights_cash_paid','rights_stock_credited'))
);
CREATE UNIQUE INDEX uq_virtual_rights_ledger_transition
  ON virtual_cash_ledger(account_id, reference_type, reference_id, kind)
  WHERE reference_type='rights_entitlement';

COMMENT ON TABLE virtual_rights_policy IS 'Immutable rollout boundary for demo trading rights.';
COMMENT ON COLUMN virtual_rights_policy.singleton IS 'Exactly one rollout policy row.';
COMMENT ON COLUMN virtual_rights_policy.deployment_date IS 'First eligible ex-date, in Vietnam calendar dates.';
COMMENT ON COLUMN virtual_rights_policy.created_at IS 'Policy installation timestamp.';
COMMENT ON TABLE virtual_corporate_actions IS 'Normalized VCI dividends and AIS evidence; retained after completion.';
COMMENT ON COLUMN virtual_corporate_actions.id IS 'Internal UUID; distinct from VCI event identity.';
COMMENT ON COLUMN virtual_corporate_actions.source IS 'Upstream provider identity.';
COMMENT ON COLUMN virtual_corporate_actions.source_event_id IS 'Stable VCI event ID; unique within source.';
COMMENT ON COLUMN virtual_corporate_actions.symbol IS 'Normalized uppercase ticker.';
COMMENT ON COLUMN virtual_corporate_actions.event_code IS 'VCI DIV, ISS or AIS code.';
COMMENT ON COLUMN virtual_corporate_actions.kind IS 'Accepted economic classification.';
COMMENT ON COLUMN virtual_corporate_actions.event_title_en IS 'English source title used for ISS classification.';
COMMENT ON COLUMN virtual_corporate_actions.announced_date IS 'VCI public_date as Vietnam DATE.';
COMMENT ON COLUMN virtual_corporate_actions.exright_date IS 'VCI exright_date; NULL while unannounced.';
COMMENT ON COLUMN virtual_corporate_actions.record_date IS 'VCI record_date; required for AIS matching.';
COMMENT ON COLUMN virtual_corporate_actions.payout_date IS 'Cash payment date; NULL keeps entitlement pending.';
COMMENT ON COLUMN virtual_corporate_actions.issue_date IS 'AIS issue_date; no inferred fallback.';
COMMENT ON COLUMN virtual_corporate_actions.cash_per_share_vnd IS 'Integer VND per share for cash dividends.';
COMMENT ON COLUMN virtual_corporate_actions.stock_ratio IS 'Exact decimal ratio; 0.2 means 20 percent.';
COMMENT ON COLUMN virtual_corporate_actions.credit_date IS 'Earliest accepted same-ticker AIS date after record_date.';
COMMENT ON COLUMN virtual_corporate_actions.credit_action_id IS 'AIS evidence; may support multiple ISS events.';
COMMENT ON COLUMN virtual_corporate_actions.disposition IS 'Processing policy, separate from date-derived lifecycle.';
COMMENT ON COLUMN virtual_corporate_actions.review_reason IS 'Reason normalized source data cannot be applied safely.';
COMMENT ON COLUMN virtual_corporate_actions.financial_frozen_at IS 'First snapshot timestamp; freezes financial terms.';
COMMENT ON COLUMN virtual_corporate_actions.latest_payload IS 'Latest source observation, including conflicting edits.';
COMMENT ON COLUMN virtual_corporate_actions.first_seen_at IS 'First local observation timestamp.';
COMMENT ON COLUMN virtual_corporate_actions.last_seen_at IS 'Latest local observation timestamp.';
COMMENT ON TABLE virtual_rights_entitlements IS 'Immutable per-account rights snapshots and guarded fulfillment.';
COMMENT ON COLUMN virtual_rights_entitlements.id IS 'Stable UUID used by rights ledger references.';
COMMENT ON COLUMN virtual_rights_entitlements.account_id IS 'Beneficiary demo trading account.';
COMMENT ON COLUMN virtual_rights_entitlements.corporate_action_id IS 'Normalized source corporate action.';
COMMENT ON COLUMN virtual_rights_entitlements.account_epoch_at IS 'Account reset_at, otherwise activated_at, at snapshot.';
COMMENT ON COLUMN virtual_rights_entitlements.kind IS 'Immutable entitlement type.';
COMMENT ON COLUMN virtual_rights_entitlements.effective_ex_date IS 'Accepted ex-date at snapshot.';
COMMENT ON COLUMN virtual_rights_entitlements.eligibility_date IS 'Previous trading session used for ownership snapshot.';
COMMENT ON COLUMN virtual_rights_entitlements.eligible_quantity IS 'Immutable quantity held at eligibility cutoff.';
COMMENT ON COLUMN virtual_rights_entitlements.cash_amount_vnd IS 'Original integer cash entitlement; retained after payment.';
COMMENT ON COLUMN virtual_rights_entitlements.share_quantity IS 'Original floored share entitlement; retained after credit.';
COMMENT ON COLUMN virtual_rights_entitlements.avg_before_ex_vnd IS 'Reconstructed average immediately before ex adjustment.';
COMMENT ON COLUMN virtual_rights_entitlements.avg_after_ex_vnd IS 'Rounded average immediately after ex adjustment.';
COMMENT ON COLUMN virtual_rights_entitlements.status IS 'Actual account processing and fulfillment state.';
COMMENT ON COLUMN virtual_rights_entitlements.applied_at IS 'Atomic snapshot, average adjustment and pending creation timestamp.';
COMMENT ON COLUMN virtual_rights_entitlements.fulfilled_at IS 'Payment, share credit or reset cancellation timestamp.';
