-- AI Insight v2 "Góc nhìn đầu tư": broker research store and the thesis engine state.
-- Additive only. Reports are downloaded daily without AI; claims, broker current views,
-- canonical theses and published investment views are produced on demand per symbol.
-- Dilutive corporate actions are read from virtual_corporate_actions (0013), not copied.

-- Applied transactionally by the existing migration runner.
CREATE TABLE research_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(20) NOT NULL CHECK (source IN ('vietstock','vndirect')),
  source_report_id VARCHAR(64) NOT NULL,
  -- NULL for industry/strategy/macro reports covering several symbols: stored, not processed.
  symbol VARCHAR(10),
  broker VARCHAR(40) NOT NULL,
  broker_raw VARCHAR(120) NOT NULL,
  report_type VARCHAR(20) NOT NULL CHECK (report_type IN ('company','industry','strategy','macro','technical','other')),
  report_date DATE NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  language VARCHAR(2) NOT NULL DEFAULT 'vi' CHECK (language IN ('vi','en')),
  source_url TEXT NOT NULL,
  file_url TEXT,
  file_path TEXT,
  file_hash CHAR(64),
  file_bytes INTEGER,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  -- Target price parsed by the backend from the source metadata (title/summary), or later
  -- extracted from the report text by the claim extraction step.
  target_price_vnd BIGINT CHECK (target_price_vnd IS NULL OR target_price_vnd > 0),
  target_source VARCHAR(10) CHECK (target_source IS NULL OR target_source IN ('metadata','extracted')),
  target_horizon TEXT,
  download_status VARCHAR(12) NOT NULL DEFAULT 'pending'
    CHECK (download_status IN ('pending','downloaded','failed','duplicate')),
  process_status VARCHAR(12) NOT NULL DEFAULT 'pending'
    CHECK (process_status IN ('pending','processed','failed','skipped')),
  download_attempts SMALLINT NOT NULL DEFAULT 0,
  process_attempts SMALLINT NOT NULL DEFAULT 0,
  downloaded_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_research_report_source UNIQUE (source, source_report_id),
  CONSTRAINT ck_research_report_company_symbol CHECK (report_type <> 'company' OR symbol IS NOT NULL)
);
-- One stored file per content hash: the same PDF from two sources is kept once.
CREATE UNIQUE INDEX uq_research_report_file_hash ON research_reports(file_hash)
  WHERE file_hash IS NOT NULL AND download_status = 'downloaded';
CREATE INDEX idx_research_reports_symbol_date ON research_reports(symbol, report_date DESC);
CREATE INDEX idx_research_reports_download ON research_reports(download_status, created_at);

CREATE TABLE research_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES research_reports(id) ON DELETE CASCADE,
  symbol VARCHAR(10) NOT NULL,
  broker VARCHAR(40) NOT NULL,
  claim_type VARCHAR(20) NOT NULL CHECK (claim_type IN (
    'growth_driver','earnings_driver','margin_driver','project_catalyst','industry_driver',
    'financial_risk','execution_risk','valuation','forecast','assumption','other')),
  subject TEXT NOT NULL,
  driver TEXT NOT NULL,
  mechanism TEXT NOT NULL,
  outcome TEXT NOT NULL,
  direction VARCHAR(8) NOT NULL CHECK (direction IN ('positive','negative','neutral','mixed')),
  time_horizon TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL,
  numbers JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(numbers) = 'array'),
  source_page INTEGER,
  evidence_date DATE NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded','invalidated')),
  -- Set once the claim went through semantic matching; NULL claims are matched on the next run.
  matched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_research_claims_symbol ON research_claims(symbol, evidence_date DESC);
CREATE INDEX idx_research_claims_unmatched ON research_claims(symbol) WHERE matched_at IS NULL;
CREATE INDEX idx_research_claims_report ON research_claims(report_id);

CREATE TABLE broker_current_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol VARCHAR(10) NOT NULL,
  broker VARCHAR(40) NOT NULL,
  as_of DATE NOT NULL,
  latest_report_id UUID NOT NULL REFERENCES research_reports(id),
  latest_target_price BIGINT CHECK (latest_target_price IS NULL OR latest_target_price > 0),
  latest_target_report_date DATE,
  latest_target_report_id UUID REFERENCES research_reports(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_broker_current_view UNIQUE (symbol, broker)
);

CREATE TABLE broker_current_view_claims (
  broker_current_view_id UUID NOT NULL REFERENCES broker_current_views(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES research_claims(id) ON DELETE CASCADE,
  relationship VARCHAR(12) NOT NULL CHECK (relationship IN ('current','inherited')),
  PRIMARY KEY (broker_current_view_id, claim_id)
);

CREATE TABLE canonical_theses (
  id VARCHAR(40) PRIMARY KEY,
  symbol VARCHAR(10) NOT NULL,
  seq INTEGER NOT NULL CHECK (seq >= 1),
  canonical_driver TEXT NOT NULL,
  canonical_mechanism TEXT NOT NULL,
  canonical_outcome TEXT NOT NULL,
  direction VARCHAR(8) NOT NULL CHECK (direction IN ('positive','negative','neutral','mixed')),
  is_risk BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(12) NOT NULL DEFAULT 'active' CHECK (status IN ('active','updated','invalidated','expired')),
  materiality SMALLINT NOT NULL DEFAULT 3 CHECK (materiality BETWEEN 1 AND 5),
  current_title TEXT,
  current_summary TEXT,
  -- Structured disagreement between brokers (timeline, size, forecast...), never shown as fact.
  disagreement JSONB,
  -- Brokers whose evidence backed the current summary; a smaller set means a rewrite.
  summary_brokers TEXT[] NOT NULL DEFAULT '{}',
  needs_rewrite BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_canonical_thesis_seq UNIQUE (symbol, seq)
);
CREATE INDEX idx_canonical_theses_symbol ON canonical_theses(symbol, status);

CREATE TABLE canonical_thesis_claims (
  canonical_thesis_id VARCHAR(40) NOT NULL REFERENCES canonical_theses(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES research_claims(id) ON DELETE CASCADE,
  relationship VARCHAR(12) NOT NULL CHECK (relationship IN ('support','update','contradict','replace')),
  match_reason JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (canonical_thesis_id, claim_id)
);

CREATE TABLE investment_view_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol VARCHAR(10) NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  status VARCHAR(12) NOT NULL CHECK (status IN ('published','superseded')),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  input_fingerprint CHAR(64) NOT NULL,
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_investment_view_version UNIQUE (symbol, version)
);
CREATE UNIQUE INDEX uq_investment_view_published ON investment_view_versions(symbol)
  WHERE status = 'published';

CREATE TABLE investment_view_theses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investment_view_version_id UUID NOT NULL REFERENCES investment_view_versions(id) ON DELETE CASCADE,
  canonical_thesis_id VARCHAR(40) NOT NULL REFERENCES canonical_theses(id),
  order_index SMALLINT NOT NULL CHECK (order_index BETWEEN 1 AND 5),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  CONSTRAINT uq_investment_view_thesis_order UNIQUE (investment_view_version_id, order_index)
);

CREATE TABLE valuation_snapshots (
  investment_view_version_id UUID PRIMARY KEY REFERENCES investment_view_versions(id) ON DELETE CASCADE,
  target_median BIGINT,
  target_min BIGINT,
  target_max BIGINT,
  active_broker_count SMALLINT NOT NULL DEFAULT 0,
  -- Broker → target used, for audit and the circuit breaker; never shown.
  targets JSONB NOT NULL DEFAULT '[]'::jsonb,
  research_as_of DATE,
  hidden_reason VARCHAR(20) CHECK (hidden_reason IS NULL OR hidden_reason IN ('corporate_action','no_target'))
);

-- One running job per symbol: a lease kept alive by heartbeats. A stale lease is taken over.
CREATE TABLE research_processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol VARCHAR(10) NOT NULL,
  status VARCHAR(10) NOT NULL CHECK (status IN ('running','done','failed','blocked')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  input_fingerprint CHAR(64),
  llm_calls INTEGER NOT NULL DEFAULT 0,
  result JSONB,
  error_message TEXT
);
CREATE UNIQUE INDEX uq_research_job_running ON research_processing_jobs(symbol) WHERE status = 'running';
CREATE INDEX idx_research_jobs_symbol ON research_processing_jobs(symbol, started_at DESC);

-- Daily AI budget across all symbols (Asia/Ho_Chi_Minh calendar day).
CREATE TABLE research_ai_usage (
  usage_date DATE PRIMARY KEY,
  llm_calls INTEGER NOT NULL DEFAULT 0 CHECK (llm_calls >= 0),
  prompt_tokens BIGINT NOT NULL DEFAULT 0,
  completion_tokens BIGINT NOT NULL DEFAULT 0
);
