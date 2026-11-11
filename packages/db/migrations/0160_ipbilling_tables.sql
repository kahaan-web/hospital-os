-- B6 IP billing: payers, encounter linkage, TPA receivables.

CREATE TABLE payers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  code text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL,
  gstin text NOT NULL DEFAULT '',
  state_code text NOT NULL DEFAULT '',
  credit_days integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code),
  CONSTRAINT payers_kind_chk CHECK (kind IN ('tpa', 'insurer', 'corporate', 'scheme'))
);

CREATE TABLE encounter_payers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  encounter_id uuid NOT NULL,
  payer_id uuid NOT NULL,
  policy_no text NOT NULL DEFAULT '',
  preauth_amount_paise bigint NOT NULL DEFAULT 0,
  approved_amount_paise bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, encounter_id),
  CONSTRAINT encounter_payers_fk_enc FOREIGN KEY (tenant_id, encounter_id) REFERENCES encounters (tenant_id, id),
  CONSTRAINT encounter_payers_fk_payer FOREIGN KEY (tenant_id, payer_id) REFERENCES payers (tenant_id, id),
  CONSTRAINT encounter_payers_status_chk CHECK (status IN ('active', 'closed'))
);

CREATE TABLE payer_receivables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  bill_id uuid NOT NULL,
  payer_id uuid NOT NULL,
  amount_paise bigint NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CONSTRAINT payer_receivables_fk_bill FOREIGN KEY (tenant_id, bill_id) REFERENCES bills (tenant_id, id),
  CONSTRAINT payer_receivables_fk_payer FOREIGN KEY (tenant_id, payer_id) REFERENCES payers (tenant_id, id),
  CONSTRAINT payer_receivables_amount_chk CHECK (amount_paise > 0),
  CONSTRAINT payer_receivables_status_chk CHECK (status IN ('open', 'submitted', 'settled', 'denied'))
);

CREATE INDEX payers_name_idx ON payers (tenant_id, lower(name));
CREATE INDEX payer_receivables_bill_idx ON payer_receivables (tenant_id, bill_id);
CREATE INDEX payer_receivables_status_idx ON payer_receivables (tenant_id, status);
