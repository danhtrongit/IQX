-- Test fixture only. Alembic remains the production schema owner.
CREATE TABLE symbols (
    id uuid NOT NULL,
    symbol varchar(10) NOT NULL,
    name varchar(500),
    short_name varchar(255),
    exchange varchar(20),
    asset_type varchar(50) DEFAULT 'stock',
    is_index boolean DEFAULT false NOT NULL,
    current_price_vnd bigint,
    target_price_vnd bigint,
    upside_pct double precision,
    logo_url varchar(2048),
    logo_source varchar(30),
    icb_lv1 varchar(100),
    icb_lv2 varchar(100),
    source varchar(50),
    source_url varchar(2048),
    last_synced_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT pk_symbols PRIMARY KEY (id),
    CONSTRAINT uq_symbols_symbol UNIQUE (symbol)
);

CREATE UNIQUE INDEX ix_symbols_symbol ON symbols (symbol);
CREATE INDEX ix_symbols_exchange ON symbols (exchange);
CREATE INDEX ix_symbols_asset_type ON symbols (asset_type);
CREATE INDEX ix_symbols_is_index ON symbols (is_index);

