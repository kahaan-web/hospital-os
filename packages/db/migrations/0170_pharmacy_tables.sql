-- B7 pharmacy and stores. Class T: tenant_id, UNIQUE (tenant_id, id), composite FKs.
-- pharmacy_stock is locked with FOR UPDATE on (tenant_id, batch_id, location_id).
-- It also has a uuid id primary key so the RLS suites can address a row by id.
-- The plan's composite primary key is the unique key pharmacy_stock_loc_uq.
-- Stock moves are append-only (trigger in 0171). They reference the batch so the
-- ledger can be summed back to the balance.

CREATE TABLE pharmacy_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  generic_code text NOT NULL,
  brand text NOT NULL,
  form text NOT NULL,
  strength text NOT NULL DEFAULT '',
  hsn text NOT NULL,
  gst_rate_bp integer NOT NULL,
  reorder_level integer NOT NULL DEFAULT 0,
  schedule text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CONSTRAINT pharmacy_items_gst_chk CHECK (gst_rate_bp >= 0 AND gst_rate_bp <= 10000),
  CONSTRAINT pharmacy_items_reorder_chk CHECK (reorder_level >= 0),
  CONSTRAINT pharmacy_items_schedule_chk CHECK (schedule IN ('H', 'H1', 'X', 'OTC'))
);

CREATE INDEX pharmacy_items_generic_idx ON pharmacy_items (tenant_id, generic_code);

CREATE TABLE pharmacy_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  gstin text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE TABLE pharmacy_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  item_id uuid NOT NULL,
  supplier_id uuid,
  batch_no text NOT NULL,
  expiry date NOT NULL,
  mrp_paise bigint NOT NULL,
  purchase_rate_paise bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, item_id, batch_no),
  CONSTRAINT pharmacy_batches_item_fk FOREIGN KEY (tenant_id, item_id) REFERENCES pharmacy_items (tenant_id, id),
  CONSTRAINT pharmacy_batches_supplier_fk FOREIGN KEY (tenant_id, supplier_id) REFERENCES pharmacy_suppliers (tenant_id, id),
  CONSTRAINT pharmacy_batches_money_chk CHECK (mrp_paise >= 0 AND purchase_rate_paise >= 0)
);

CREATE INDEX pharmacy_batches_expiry_idx ON pharmacy_batches (tenant_id, expiry);

CREATE TABLE pharmacy_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  batch_id uuid NOT NULL,
  location_id uuid NOT NULL,
  qty integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, batch_id, location_id),
  CONSTRAINT pharmacy_stock_batch_fk FOREIGN KEY (tenant_id, batch_id) REFERENCES pharmacy_batches (tenant_id, id),
  CONSTRAINT pharmacy_stock_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT pharmacy_stock_qty_chk CHECK (qty >= 0)
);

CREATE TABLE pharmacy_stock_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  batch_id uuid NOT NULL,
  location_id uuid NOT NULL,
  qty integer NOT NULL,
  move_type text NOT NULL,
  ref_type text NOT NULL,
  ref_id uuid NOT NULL,
  ref_line text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CONSTRAINT pharmacy_stock_moves_batch_fk FOREIGN KEY (tenant_id, batch_id) REFERENCES pharmacy_batches (tenant_id, id),
  CONSTRAINT pharmacy_stock_moves_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT pharmacy_stock_moves_user_fk FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, id),
  CONSTRAINT pharmacy_stock_moves_qty_chk CHECK (qty <> 0),
  CONSTRAINT pharmacy_stock_moves_type_chk CHECK (move_type IN ('grn', 'supplier_return', 'sale', 'sale_return', 'ip_issue', 'ip_return', 'adjustment'))
);

CREATE INDEX pharmacy_stock_moves_batch_idx ON pharmacy_stock_moves (tenant_id, batch_id, location_id);

CREATE TABLE pharmacy_grns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  location_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  number text NOT NULL,
  notes text NOT NULL DEFAULT '',
  received_at timestamptz NOT NULL DEFAULT now(),
  taxable_paise bigint NOT NULL DEFAULT 0,
  tax_paise bigint NOT NULL DEFAULT 0,
  total_paise bigint NOT NULL DEFAULT 0,
  created_by uuid,
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, number),
  CONSTRAINT pharmacy_grns_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT pharmacy_grns_supplier_fk FOREIGN KEY (tenant_id, supplier_id) REFERENCES pharmacy_suppliers (tenant_id, id),
  CONSTRAINT pharmacy_grns_user_fk FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, id)
);

CREATE TABLE pharmacy_grn_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  grn_id uuid NOT NULL,
  line_no integer NOT NULL,
  item_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  qty integer NOT NULL,
  mrp_paise bigint NOT NULL,
  purchase_rate_paise bigint NOT NULL,
  gst_rate_bp integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, grn_id, line_no),
  CONSTRAINT pharmacy_grn_lines_grn_fk FOREIGN KEY (tenant_id, grn_id) REFERENCES pharmacy_grns (tenant_id, id),
  CONSTRAINT pharmacy_grn_lines_item_fk FOREIGN KEY (tenant_id, item_id) REFERENCES pharmacy_items (tenant_id, id),
  CONSTRAINT pharmacy_grn_lines_batch_fk FOREIGN KEY (tenant_id, batch_id) REFERENCES pharmacy_batches (tenant_id, id),
  CONSTRAINT pharmacy_grn_lines_qty_chk CHECK (qty > 0),
  CONSTRAINT pharmacy_grn_lines_money_chk CHECK (mrp_paise >= 0 AND purchase_rate_paise >= 0 AND gst_rate_bp >= 0)
);

CREATE TABLE pharmacy_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  location_id uuid NOT NULL,
  patient_id uuid,
  encounter_id uuid,
  walkin_name text NOT NULL DEFAULT '',
  kind text NOT NULL,
  number text NOT NULL,
  mode text NOT NULL,
  doc_type text NOT NULL,
  gross_paise bigint NOT NULL,
  taxable_paise bigint NOT NULL,
  cgst_paise bigint NOT NULL,
  sgst_paise bigint NOT NULL,
  igst_paise bigint NOT NULL DEFAULT 0,
  total_paise bigint NOT NULL,
  created_by uuid,
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, number),
  CONSTRAINT pharmacy_sales_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT pharmacy_sales_patient_fk FOREIGN KEY (tenant_id, patient_id) REFERENCES patients (tenant_id, id),
  CONSTRAINT pharmacy_sales_encounter_fk FOREIGN KEY (tenant_id, encounter_id) REFERENCES encounters (tenant_id, id),
  CONSTRAINT pharmacy_sales_user_fk FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, id),
  CONSTRAINT pharmacy_sales_kind_chk CHECK (kind IN ('op', 'outside')),
  CONSTRAINT pharmacy_sales_mode_chk CHECK (mode IN ('cash', 'upi', 'card', 'cheque', 'neft')),
  CONSTRAINT pharmacy_sales_doc_chk CHECK (doc_type IN ('bill_of_supply', 'tax_invoice', 'invoice_cum_bill_of_supply')),
  CONSTRAINT pharmacy_sales_money_chk CHECK (gross_paise >= 0 AND taxable_paise >= 0 AND cgst_paise >= 0 AND sgst_paise >= 0 AND igst_paise >= 0 AND total_paise >= 0)
);

CREATE TABLE pharmacy_sale_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  sale_id uuid NOT NULL,
  line_no integer NOT NULL,
  item_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  order_item_id uuid,
  qty integer NOT NULL,
  returned_qty integer NOT NULL DEFAULT 0,
  mrp_paise bigint NOT NULL,
  gst_rate_bp integer NOT NULL,
  gross_paise bigint NOT NULL,
  taxable_paise bigint NOT NULL,
  tax_paise bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, sale_id, line_no),
  CONSTRAINT pharmacy_sale_lines_sale_fk FOREIGN KEY (tenant_id, sale_id) REFERENCES pharmacy_sales (tenant_id, id),
  CONSTRAINT pharmacy_sale_lines_item_fk FOREIGN KEY (tenant_id, item_id) REFERENCES pharmacy_items (tenant_id, id),
  CONSTRAINT pharmacy_sale_lines_batch_fk FOREIGN KEY (tenant_id, batch_id) REFERENCES pharmacy_batches (tenant_id, id),
  CONSTRAINT pharmacy_sale_lines_order_fk FOREIGN KEY (tenant_id, order_item_id) REFERENCES clinical_order_items (tenant_id, id),
  CONSTRAINT pharmacy_sale_lines_qty_chk CHECK (qty > 0 AND returned_qty >= 0 AND returned_qty <= qty)
);

CREATE TABLE pharmacy_sale_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  location_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  patient_id uuid,
  number text NOT NULL,
  reason text NOT NULL,
  gross_paise bigint NOT NULL,
  taxable_paise bigint NOT NULL,
  tax_paise bigint NOT NULL,
  created_by uuid,
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, number),
  CONSTRAINT pharmacy_sale_returns_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT pharmacy_sale_returns_sale_fk FOREIGN KEY (tenant_id, sale_id) REFERENCES pharmacy_sales (tenant_id, id),
  CONSTRAINT pharmacy_sale_returns_patient_fk FOREIGN KEY (tenant_id, patient_id) REFERENCES patients (tenant_id, id),
  CONSTRAINT pharmacy_sale_returns_user_fk FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, id)
);

CREATE TABLE pharmacy_sale_return_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  return_id uuid NOT NULL,
  line_no integer NOT NULL,
  sale_line_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  qty integer NOT NULL,
  gross_paise bigint NOT NULL,
  taxable_paise bigint NOT NULL,
  tax_paise bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, return_id, line_no),
  CONSTRAINT pharmacy_sale_return_lines_return_fk FOREIGN KEY (tenant_id, return_id) REFERENCES pharmacy_sale_returns (tenant_id, id),
  CONSTRAINT pharmacy_sale_return_lines_sale_line_fk FOREIGN KEY (tenant_id, sale_line_id) REFERENCES pharmacy_sale_lines (tenant_id, id),
  CONSTRAINT pharmacy_sale_return_lines_batch_fk FOREIGN KEY (tenant_id, batch_id) REFERENCES pharmacy_batches (tenant_id, id),
  CONSTRAINT pharmacy_sale_return_lines_qty_chk CHECK (qty > 0)
);

CREATE TABLE pharmacy_ip_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  location_id uuid NOT NULL,
  encounter_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  number text NOT NULL,
  notes text NOT NULL DEFAULT '',
  created_by uuid,
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, number),
  CONSTRAINT pharmacy_ip_issues_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT pharmacy_ip_issues_encounter_fk FOREIGN KEY (tenant_id, encounter_id) REFERENCES encounters (tenant_id, id),
  CONSTRAINT pharmacy_ip_issues_patient_fk FOREIGN KEY (tenant_id, patient_id) REFERENCES patients (tenant_id, id),
  CONSTRAINT pharmacy_ip_issues_user_fk FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, id)
);

CREATE TABLE pharmacy_ip_issue_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  issue_id uuid NOT NULL,
  line_no integer NOT NULL,
  item_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  qty integer NOT NULL,
  returned_qty integer NOT NULL DEFAULT 0,
  mrp_paise bigint NOT NULL,
  charge_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, issue_id, line_no),
  CONSTRAINT pharmacy_ip_issue_lines_issue_fk FOREIGN KEY (tenant_id, issue_id) REFERENCES pharmacy_ip_issues (tenant_id, id),
  CONSTRAINT pharmacy_ip_issue_lines_item_fk FOREIGN KEY (tenant_id, item_id) REFERENCES pharmacy_items (tenant_id, id),
  CONSTRAINT pharmacy_ip_issue_lines_batch_fk FOREIGN KEY (tenant_id, batch_id) REFERENCES pharmacy_batches (tenant_id, id),
  CONSTRAINT pharmacy_ip_issue_lines_qty_chk CHECK (qty > 0 AND returned_qty >= 0 AND returned_qty <= qty)
);

CREATE TABLE pharmacy_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  location_id uuid NOT NULL,
  number text NOT NULL,
  reason text NOT NULL,
  created_by uuid,
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, number),
  CONSTRAINT pharmacy_adjustments_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT pharmacy_adjustments_user_fk FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, id)
);

CREATE TABLE pharmacy_adjustment_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  adjustment_id uuid NOT NULL,
  line_no integer NOT NULL,
  batch_id uuid NOT NULL,
  qty_delta integer NOT NULL,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, adjustment_id, line_no),
  CONSTRAINT pharmacy_adjustment_lines_adj_fk FOREIGN KEY (tenant_id, adjustment_id) REFERENCES pharmacy_adjustments (tenant_id, id),
  CONSTRAINT pharmacy_adjustment_lines_batch_fk FOREIGN KEY (tenant_id, batch_id) REFERENCES pharmacy_batches (tenant_id, id),
  CONSTRAINT pharmacy_adjustment_lines_qty_chk CHECK (qty_delta <> 0)
);

CREATE TABLE pharmacy_supplier_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  location_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  number text NOT NULL,
  reason text NOT NULL,
  created_by uuid,
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, number),
  CONSTRAINT pharmacy_supplier_returns_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT pharmacy_supplier_returns_supplier_fk FOREIGN KEY (tenant_id, supplier_id) REFERENCES pharmacy_suppliers (tenant_id, id),
  CONSTRAINT pharmacy_supplier_returns_user_fk FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, id)
);

CREATE TABLE pharmacy_supplier_return_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  return_id uuid NOT NULL,
  line_no integer NOT NULL,
  batch_id uuid NOT NULL,
  qty integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, return_id, line_no),
  CONSTRAINT pharmacy_supplier_return_lines_return_fk FOREIGN KEY (tenant_id, return_id) REFERENCES pharmacy_supplier_returns (tenant_id, id),
  CONSTRAINT pharmacy_supplier_return_lines_batch_fk FOREIGN KEY (tenant_id, batch_id) REFERENCES pharmacy_batches (tenant_id, id),
  CONSTRAINT pharmacy_supplier_return_lines_qty_chk CHECK (qty > 0)
);
