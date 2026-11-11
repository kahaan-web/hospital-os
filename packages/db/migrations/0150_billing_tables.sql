-- B5 OP billing. Money is paise. GST rates are basis points.
-- Column names use the *_paise suffix already used by charges and cash_ledger.

CREATE TABLE bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  location_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  encounter_id uuid,
  kind text NOT NULL,
  number text,
  doc_type text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  pay_class text NOT NULL,
  payer_id uuid,
  subtotal_paise bigint NOT NULL,
  discount_paise bigint NOT NULL DEFAULT 0,
  cgst_paise bigint NOT NULL DEFAULT 0,
  sgst_paise bigint NOT NULL DEFAULT 0,
  igst_paise bigint NOT NULL DEFAULT 0,
  round_off_paise bigint NOT NULL DEFAULT 0,
  total_paise bigint NOT NULL,
  paid_paise bigint NOT NULL DEFAULT 0,
  cancel_reason text NOT NULL DEFAULT '',
  created_by uuid,
  finalised_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CONSTRAINT bills_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT bills_patient_fk FOREIGN KEY (tenant_id, patient_id) REFERENCES patients (tenant_id, id),
  CONSTRAINT bills_encounter_fk FOREIGN KEY (tenant_id, encounter_id) REFERENCES encounters (tenant_id, id),
  CONSTRAINT bills_kind_chk CHECK (kind IN ('op', 'ip')),
  CONSTRAINT bills_doc_type_chk CHECK (doc_type IN ('bill_of_supply', 'tax_invoice', 'invoice_cum_bill_of_supply')),
  CONSTRAINT bills_status_chk CHECK (status IN ('draft', 'final', 'cancelled')),
  CONSTRAINT bills_pay_class_chk CHECK (pay_class IN ('cash', 'credit', 'free')),
  CONSTRAINT bills_money_chk CHECK (
    subtotal_paise >= 0
    AND discount_paise >= 0
    AND cgst_paise >= 0
    AND sgst_paise >= 0
    AND igst_paise >= 0
    AND round_off_paise BETWEEN -50 AND 50
    AND total_paise = subtotal_paise - discount_paise + cgst_paise + sgst_paise + igst_paise + round_off_paise
    AND paid_paise >= 0
    AND paid_paise <= total_paise
  ),
  CONSTRAINT bills_number_len_chk CHECK (number IS NULL OR char_length(number) <= 16)
);

CREATE UNIQUE INDEX bills_number_uq ON bills (tenant_id, number) WHERE number IS NOT NULL;
CREATE INDEX bills_patient_idx ON bills (tenant_id, patient_id, created_at DESC);
CREATE INDEX bills_status_idx ON bills (tenant_id, status);

CREATE TABLE bill_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  bill_id uuid NOT NULL,
  charge_id uuid NOT NULL,
  line_no integer NOT NULL,
  description text NOT NULL,
  qty numeric(12, 3) NOT NULL,
  unit_price_paise bigint NOT NULL,
  amount_paise bigint NOT NULL,
  discount_paise bigint NOT NULL DEFAULT 0,
  bill_discount_paise bigint NOT NULL DEFAULT 0,
  taxable_paise bigint NOT NULL,
  gst_treatment text NOT NULL,
  configured_rate_bp integer NOT NULL DEFAULT 0,
  gst_rate_bp integer NOT NULL DEFAULT 0,
  hsn_sac text NOT NULL DEFAULT '9993',
  cgst_paise bigint NOT NULL DEFAULT 0,
  sgst_paise bigint NOT NULL DEFAULT 0,
  igst_paise bigint NOT NULL DEFAULT 0,
  service_id uuid,
  performing_doctor_id uuid,
  service_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (charge_id),
  UNIQUE (tenant_id, bill_id, line_no),
  CONSTRAINT bill_lines_bill_fk FOREIGN KEY (tenant_id, bill_id) REFERENCES bills (tenant_id, id),
  CONSTRAINT bill_lines_gst_chk CHECK (gst_treatment IN ('exempt_healthcare', 'taxable', 'room_rent_rule')),
  CONSTRAINT bill_lines_money_chk CHECK (
    qty > 0
    AND amount_paise >= 0
    AND discount_paise >= 0
    AND bill_discount_paise >= 0
    AND taxable_paise >= 0
    AND taxable_paise = amount_paise - discount_paise - bill_discount_paise
    AND cgst_paise >= 0
    AND sgst_paise >= 0
    AND igst_paise >= 0
  )
);

CREATE INDEX bill_lines_bill_idx ON bill_lines (tenant_id, bill_id);

CREATE TABLE deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  location_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  encounter_id uuid,
  number text NOT NULL,
  amount_paise bigint NOT NULL,
  balance_paise bigint NOT NULL,
  mode text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  instrument_ref text,
  received_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, number),
  CONSTRAINT deposits_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT deposits_patient_fk FOREIGN KEY (tenant_id, patient_id) REFERENCES patients (tenant_id, id),
  CONSTRAINT deposits_encounter_fk FOREIGN KEY (tenant_id, encounter_id) REFERENCES encounters (tenant_id, id),
  CONSTRAINT deposits_mode_chk CHECK (mode IN ('cash', 'upi', 'card', 'cheque', 'neft')),
  CONSTRAINT deposits_status_chk CHECK (status IN ('open', 'refunded', 'adjusted', 'closed')),
  CONSTRAINT deposits_money_chk CHECK (
    amount_paise > 0
    AND balance_paise >= 0
    AND balance_paise <= amount_paise
    AND char_length(number) <= 16
  )
);

CREATE INDEX deposits_patient_idx ON deposits (tenant_id, patient_id);

CREATE TABLE bill_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  bill_id uuid NOT NULL,
  mode text NOT NULL,
  amount_paise bigint NOT NULL,
  deposit_id uuid,
  cash_entry_id uuid,
  instrument_ref text,
  received_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CONSTRAINT bill_settlements_bill_fk FOREIGN KEY (tenant_id, bill_id) REFERENCES bills (tenant_id, id),
  CONSTRAINT bill_settlements_deposit_fk FOREIGN KEY (tenant_id, deposit_id) REFERENCES deposits (tenant_id, id),
  CONSTRAINT bill_settlements_mode_chk CHECK (mode IN ('cash', 'upi', 'card', 'cheque', 'neft', 'deposit', 'credit')),
  CONSTRAINT bill_settlements_amount_chk CHECK (amount_paise > 0)
);

CREATE INDEX bill_settlements_bill_idx ON bill_settlements (tenant_id, bill_id);

CREATE TABLE concessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  bill_id uuid NOT NULL,
  amount_paise bigint NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'requested',
  requested_by uuid,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CONSTRAINT concessions_bill_fk FOREIGN KEY (tenant_id, bill_id) REFERENCES bills (tenant_id, id),
  CONSTRAINT concessions_status_chk CHECK (status IN ('requested', 'approved', 'rejected')),
  CONSTRAINT concessions_amount_chk CHECK (amount_paise > 0)
);

CREATE INDEX concessions_bill_idx ON concessions (tenant_id, bill_id);

CREATE TABLE refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  bill_id uuid,
  deposit_id uuid,
  number text NOT NULL,
  amount_paise bigint NOT NULL,
  reason text NOT NULL,
  mode text NOT NULL,
  cash_entry_id uuid,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, number),
  CONSTRAINT refunds_bill_fk FOREIGN KEY (tenant_id, bill_id) REFERENCES bills (tenant_id, id),
  CONSTRAINT refunds_deposit_fk FOREIGN KEY (tenant_id, deposit_id) REFERENCES deposits (tenant_id, id),
  CONSTRAINT refunds_target_chk CHECK (bill_id IS NOT NULL OR deposit_id IS NOT NULL),
  CONSTRAINT refunds_mode_chk CHECK (mode IN ('cash', 'upi', 'card', 'cheque', 'neft')),
  CONSTRAINT refunds_money_chk CHECK (amount_paise > 0 AND char_length(number) <= 16)
);

-- Clinical credit notes. Not `credit_notes`: that name is the platform invoice credit note
-- (invoice_id) already present on shared test databases and targeted by tests/db-rls/fixtures/credit-notes.ts.
CREATE TABLE bill_credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  bill_id uuid NOT NULL,
  refund_id uuid,
  number text NOT NULL,
  amount_paise bigint NOT NULL,
  cgst_paise bigint NOT NULL DEFAULT 0,
  sgst_paise bigint NOT NULL DEFAULT 0,
  igst_paise bigint NOT NULL DEFAULT 0,
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'issued',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, number),
  CONSTRAINT bill_credit_notes_bill_fk FOREIGN KEY (tenant_id, bill_id) REFERENCES bills (tenant_id, id),
  CONSTRAINT bill_credit_notes_refund_fk FOREIGN KEY (tenant_id, refund_id) REFERENCES refunds (tenant_id, id),
  CONSTRAINT bill_credit_notes_status_chk CHECK (status IN ('issued', 'cancelled')),
  CONSTRAINT bill_credit_notes_money_chk CHECK (
    amount_paise > 0
    AND cgst_paise >= 0
    AND sgst_paise >= 0
    AND igst_paise >= 0
    AND char_length(number) <= 16
  )
);

CREATE INDEX bill_credit_notes_bill_idx ON bill_credit_notes (tenant_id, bill_id);

ALTER TABLE charges
  ADD CONSTRAINT charges_bill_fk FOREIGN KEY (tenant_id, bill_id) REFERENCES bills (tenant_id, id);
