-- B5 money rows are not rewritten by hos_app. Draft inserts stay granted.
-- Settlements, refunds and bill credit notes are created only inside these
-- functions, together with the paid or deposit balance they change.
-- cash_ledger is the only cash table (0102 granted UPDATE/DELETE). Void and
-- the deposit receipt's ref correction go through functions too.
-- Concessions stay insert-only: the status is chosen on insert, and a draft
-- reprice is hos_bill_reprice.

REVOKE UPDATE, DELETE ON bills, bill_lines, deposits, concessions, cash_ledger FROM hos_app;
REVOKE INSERT, UPDATE, DELETE ON bill_settlements, refunds, bill_credit_notes FROM hos_app;

CREATE OR REPLACE FUNCTION hos_billing_guard() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF hos_scope() NOT IN ('tenant', 'platform') OR hos_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'hos:forbidden' USING ERRCODE = '42501';
  END IF;
END $$;

-- SELECT FOR UPDATE needs UPDATE, which hos_app no longer has. These locks run as
-- the owner so the API can serialise a bill or deposit before it checks status.
CREATE OR REPLACE FUNCTION hos_bill_lock(p_bill_id uuid) RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM hos_billing_guard();
  PERFORM 1 FROM bills WHERE id = p_bill_id AND tenant_id = hos_tenant_id() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'hos:bill_not_found' USING ERRCODE = 'P0001';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION hos_deposit_lock(p_deposit_id uuid) RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM hos_billing_guard();
  PERFORM 1 FROM deposits WHERE id = p_deposit_id AND tenant_id = hos_tenant_id() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'hos:deposit_not_found' USING ERRCODE = 'P0001';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION hos_bill_reprice(
  p_bill_id uuid,
  p_lines jsonb,
  p_doc_type text,
  p_subtotal bigint,
  p_discount bigint,
  p_cgst bigint,
  p_sgst bigint,
  p_igst bigint,
  p_round_off bigint,
  p_total bigint
) RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid;
  v_status text;
  v_n int;
  v_lines int;
BEGIN
  PERFORM hos_billing_guard();
  IF p_doc_type NOT IN ('bill_of_supply', 'tax_invoice', 'invoice_cum_bill_of_supply') THEN
    RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
  END IF;
  SELECT tenant_id, status INTO v_tenant, v_status
  FROM bills WHERE id = p_bill_id FOR UPDATE;
  IF NOT FOUND OR v_tenant IS DISTINCT FROM hos_tenant_id() THEN
    RAISE EXCEPTION 'hos:bill_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
  END IF;
  SELECT count(*)::int, count(DISTINCT elem->>'id')::int
    INTO v_lines, v_n
  FROM jsonb_array_elements(p_lines) elem;
  IF v_lines <> v_n THEN
    RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
  END IF;
  IF v_lines <> (SELECT count(*)::int FROM bill_lines WHERE bill_id = p_bill_id AND tenant_id = hos_tenant_id()) THEN
    RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
  END IF;
  UPDATE bill_lines AS bl
  SET bill_discount_paise = (elem->>'bill_discount_paise')::bigint,
      taxable_paise = (elem->>'taxable_paise')::bigint,
      gst_rate_bp = (elem->>'gst_rate_bp')::integer,
      cgst_paise = (elem->>'cgst_paise')::bigint,
      sgst_paise = (elem->>'sgst_paise')::bigint,
      igst_paise = (elem->>'igst_paise')::bigint
  FROM jsonb_array_elements(p_lines) elem
  WHERE bl.tenant_id = hos_tenant_id()
    AND bl.bill_id = p_bill_id
    AND bl.id = (elem->>'id')::uuid;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> v_lines THEN
    RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
  END IF;
  UPDATE bills SET
    doc_type = p_doc_type,
    subtotal_paise = p_subtotal,
    discount_paise = p_discount,
    cgst_paise = p_cgst,
    sgst_paise = p_sgst,
    igst_paise = p_igst,
    round_off_paise = p_round_off,
    total_paise = p_total
  WHERE id = p_bill_id AND tenant_id = hos_tenant_id();
END $$;

CREATE OR REPLACE FUNCTION hos_bill_finalise(p_bill_id uuid, p_number text) RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid;
  v_status text;
BEGIN
  PERFORM hos_billing_guard();
  IF p_number IS NULL OR btrim(p_number) = '' OR char_length(p_number) > 16 THEN
    RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
  END IF;
  SELECT tenant_id, status INTO v_tenant, v_status
  FROM bills WHERE id = p_bill_id FOR UPDATE;
  IF NOT FOUND OR v_tenant IS DISTINCT FROM hos_tenant_id() THEN
    RAISE EXCEPTION 'hos:bill_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
  END IF;
  UPDATE bills SET
    status = 'final',
    number = p_number,
    finalised_at = coalesce(finalised_at, now())
  WHERE id = p_bill_id AND tenant_id = hos_tenant_id();
END $$;

CREATE OR REPLACE FUNCTION hos_bill_cancel(p_bill_id uuid, p_reason text) RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid;
  v_status text;
  v_paid bigint;
BEGIN
  PERFORM hos_billing_guard();
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 3 OR char_length(p_reason) > 300 THEN
    RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
  END IF;
  SELECT tenant_id, status, paid_paise INTO v_tenant, v_status, v_paid
  FROM bills WHERE id = p_bill_id FOR UPDATE;
  IF NOT FOUND OR v_tenant IS DISTINCT FROM hos_tenant_id() THEN
    RAISE EXCEPTION 'hos:bill_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_status NOT IN ('draft', 'final') THEN
    RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
  END IF;
  IF v_status = 'final' AND (
    v_paid <> 0
    OR EXISTS (
      SELECT 1 FROM bill_settlements s
      WHERE s.bill_id = p_bill_id AND s.tenant_id = hos_tenant_id()
    )
  ) THEN
    RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
  END IF;
  UPDATE bills SET status = 'cancelled', cancel_reason = btrim(p_reason)
  WHERE id = p_bill_id AND tenant_id = hos_tenant_id();
END $$;

CREATE OR REPLACE FUNCTION hos_bill_settle(
  p_bill_id uuid,
  p_mode text,
  p_amount bigint,
  p_deposit_id uuid,
  p_cash_entry_id uuid,
  p_instrument_ref text,
  p_received_by uuid
) RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid;
  v_status text;
  v_patient uuid;
  v_pay_class text;
  v_total bigint;
  v_paid bigint;
  v_credit bigint;
  v_dep_tenant uuid;
  v_dep_patient uuid;
  v_dep_status text;
  v_dep_balance bigint;
  v_next bigint;
  v_cash_tenant uuid;
  v_cash_amount bigint;
  v_cash_void timestamptz;
  v_cash_ref_type text;
  v_cash_ref uuid;
  v_cash_direction text;
  v_cash_type text;
  v_cash_mode text;
BEGIN
  PERFORM hos_billing_guard();
  IF p_mode NOT IN ('cash', 'upi', 'card', 'cheque', 'neft', 'deposit', 'credit')
     OR p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
  END IF;
  SELECT tenant_id, status, patient_id, pay_class, total_paise, paid_paise
    INTO v_tenant, v_status, v_patient, v_pay_class, v_total, v_paid
  FROM bills WHERE id = p_bill_id FOR UPDATE;
  IF NOT FOUND OR v_tenant IS DISTINCT FROM hos_tenant_id() THEN
    RAISE EXCEPTION 'hos:bill_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_status IS DISTINCT FROM 'final' THEN
    RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
  END IF;
  IF p_mode = 'credit' THEN
    IF v_pay_class IS DISTINCT FROM 'credit' OR p_deposit_id IS NOT NULL OR p_cash_entry_id IS NOT NULL THEN
      RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
    END IF;
    SELECT coalesce(sum(amount_paise), 0)::bigint INTO v_credit
    FROM bill_settlements
    WHERE bill_id = p_bill_id AND tenant_id = hos_tenant_id() AND mode = 'credit';
    IF v_credit + p_amount > v_total THEN
      RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF v_paid + p_amount > v_total THEN
      RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF p_mode = 'deposit' THEN
    IF p_deposit_id IS NULL OR p_cash_entry_id IS NOT NULL THEN
      RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
    END IF;
    SELECT tenant_id, patient_id, status, balance_paise
      INTO v_dep_tenant, v_dep_patient, v_dep_status, v_dep_balance
    FROM deposits WHERE id = p_deposit_id FOR UPDATE;
    IF NOT FOUND OR v_dep_tenant IS DISTINCT FROM hos_tenant_id() THEN
      RAISE EXCEPTION 'hos:deposit_not_found' USING ERRCODE = 'P0001';
    END IF;
    IF v_dep_patient IS DISTINCT FROM v_patient OR v_dep_status IS DISTINCT FROM 'open' OR v_dep_balance < p_amount THEN
      RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
    END IF;
    v_next := v_dep_balance - p_amount;
    UPDATE deposits SET
      balance_paise = v_next,
      status = CASE WHEN v_next = 0 THEN 'adjusted' ELSE 'open' END
    WHERE id = p_deposit_id AND tenant_id = hos_tenant_id();
  ELSIF p_mode <> 'credit' THEN
    IF p_cash_entry_id IS NULL OR p_deposit_id IS NOT NULL THEN
      RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
    END IF;
    SELECT tenant_id, amount_paise, voided_at, ref_type, ref_id, direction, entry_type, mode
      INTO v_cash_tenant, v_cash_amount, v_cash_void, v_cash_ref_type, v_cash_ref, v_cash_direction, v_cash_type, v_cash_mode
    FROM cash_ledger WHERE id = p_cash_entry_id FOR UPDATE;
    IF NOT FOUND OR v_cash_tenant IS DISTINCT FROM hos_tenant_id()
       OR v_cash_void IS NOT NULL
       OR v_cash_amount <> p_amount
       OR v_cash_ref_type IS DISTINCT FROM 'bill'
       OR v_cash_ref IS DISTINCT FROM p_bill_id
       OR v_cash_direction IS DISTINCT FROM 'in'
       OR v_cash_type IS DISTINCT FROM 'receipt'
       OR v_cash_mode IS DISTINCT FROM p_mode THEN
      RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  INSERT INTO bill_settlements (
    tenant_id, bill_id, mode, amount_paise, deposit_id, cash_entry_id, instrument_ref, received_by
  ) VALUES (
    hos_tenant_id(), p_bill_id, p_mode, p_amount, p_deposit_id, p_cash_entry_id,
    nullif(btrim(coalesce(p_instrument_ref, '')), ''), p_received_by
  );
  IF p_mode <> 'credit' THEN
    UPDATE bills SET paid_paise = paid_paise + p_amount
    WHERE id = p_bill_id AND tenant_id = hos_tenant_id();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION hos_bill_refund(
  p_bill_id uuid,
  p_amount bigint,
  p_reason text,
  p_mode text,
  p_refund_number text,
  p_note_number text,
  p_cash_entry_id uuid,
  p_approved_by uuid
) RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid;
  v_status text;
  v_total bigint;
  v_paid bigint;
  v_cgst bigint;
  v_sgst bigint;
  v_igst bigint;
  v_note_cgst bigint;
  v_note_sgst bigint;
  v_note_igst bigint;
  v_refund uuid;
  v_cash_tenant uuid;
  v_cash_amount bigint;
  v_cash_void timestamptz;
  v_cash_ref_type text;
  v_cash_ref uuid;
  v_cash_direction text;
  v_cash_type text;
  v_cash_mode text;
BEGIN
  PERFORM hos_billing_guard();
  IF p_mode NOT IN ('cash', 'upi', 'card', 'cheque', 'neft')
     OR p_amount IS NULL OR p_amount <= 0
     OR p_reason IS NULL OR char_length(btrim(p_reason)) < 3
     OR p_refund_number IS NULL OR char_length(p_refund_number) > 16 OR btrim(p_refund_number) = ''
     OR p_note_number IS NULL OR char_length(p_note_number) > 16 OR btrim(p_note_number) = ''
     OR p_cash_entry_id IS NULL THEN
    RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
  END IF;
  SELECT tenant_id, status, total_paise, paid_paise, cgst_paise, sgst_paise, igst_paise
    INTO v_tenant, v_status, v_total, v_paid, v_cgst, v_sgst, v_igst
  FROM bills WHERE id = p_bill_id FOR UPDATE;
  IF NOT FOUND OR v_tenant IS DISTINCT FROM hos_tenant_id() THEN
    RAISE EXCEPTION 'hos:bill_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_status IS DISTINCT FROM 'final' OR p_amount > v_paid THEN
    RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
  END IF;
  SELECT tenant_id, amount_paise, voided_at, ref_type, ref_id, direction, entry_type, mode
    INTO v_cash_tenant, v_cash_amount, v_cash_void, v_cash_ref_type, v_cash_ref, v_cash_direction, v_cash_type, v_cash_mode
  FROM cash_ledger WHERE id = p_cash_entry_id FOR UPDATE;
  IF NOT FOUND OR v_cash_tenant IS DISTINCT FROM hos_tenant_id()
     OR v_cash_void IS NOT NULL
     OR v_cash_amount <> p_amount
     OR v_cash_ref_type IS DISTINCT FROM 'bill'
     OR v_cash_ref IS DISTINCT FROM p_bill_id
     OR v_cash_direction IS DISTINCT FROM 'out'
     OR v_cash_type IS DISTINCT FROM 'refund'
     OR v_cash_mode IS DISTINCT FROM p_mode THEN
    RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO refunds (
    tenant_id, bill_id, number, amount_paise, reason, mode, cash_entry_id, approved_by
  ) VALUES (
    hos_tenant_id(), p_bill_id, p_refund_number, p_amount, btrim(p_reason), p_mode, p_cash_entry_id, p_approved_by
  ) RETURNING id INTO v_refund;
  v_note_cgst := CASE WHEN v_total <= 0 THEN 0 ELSE round((v_cgst::numeric * p_amount) / v_total)::bigint END;
  v_note_sgst := CASE WHEN v_total <= 0 THEN 0 ELSE round((v_sgst::numeric * p_amount) / v_total)::bigint END;
  v_note_igst := CASE WHEN v_total <= 0 THEN 0 ELSE round((v_igst::numeric * p_amount) / v_total)::bigint END;
  INSERT INTO bill_credit_notes (
    tenant_id, bill_id, refund_id, number, amount_paise, cgst_paise, sgst_paise, igst_paise, reason, status
  ) VALUES (
    hos_tenant_id(), p_bill_id, v_refund, p_note_number, p_amount,
    v_note_cgst, v_note_sgst, v_note_igst, btrim(p_reason), 'issued'
  );
  UPDATE bills SET paid_paise = paid_paise - p_amount
  WHERE id = p_bill_id AND tenant_id = hos_tenant_id();
END $$;

CREATE OR REPLACE FUNCTION hos_bill_credit_note_cancel(p_note_id uuid) RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid;
  v_status text;
BEGIN
  PERFORM hos_billing_guard();
  SELECT tenant_id, status INTO v_tenant, v_status
  FROM bill_credit_notes WHERE id = p_note_id FOR UPDATE;
  IF NOT FOUND OR v_tenant IS DISTINCT FROM hos_tenant_id() THEN
    RAISE EXCEPTION 'hos:credit_note_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_status IS DISTINCT FROM 'issued' THEN
    RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
  END IF;
  UPDATE bill_credit_notes SET status = 'cancelled'
  WHERE id = p_note_id AND tenant_id = hos_tenant_id();
END $$;

CREATE OR REPLACE FUNCTION hos_deposit_refund(
  p_deposit_id uuid,
  p_amount bigint,
  p_reason text,
  p_mode text,
  p_refund_number text,
  p_cash_entry_id uuid,
  p_approved_by uuid
) RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid;
  v_status text;
  v_balance bigint;
  v_next bigint;
  v_cash_tenant uuid;
  v_cash_amount bigint;
  v_cash_void timestamptz;
  v_cash_ref_type text;
  v_cash_ref uuid;
  v_cash_direction text;
  v_cash_type text;
  v_cash_mode text;
BEGIN
  PERFORM hos_billing_guard();
  IF p_mode NOT IN ('cash', 'upi', 'card', 'cheque', 'neft')
     OR p_amount IS NULL OR p_amount <= 0
     OR p_reason IS NULL OR char_length(btrim(p_reason)) < 3
     OR p_refund_number IS NULL OR char_length(p_refund_number) > 16 OR btrim(p_refund_number) = ''
     OR p_cash_entry_id IS NULL THEN
    RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
  END IF;
  SELECT tenant_id, status, balance_paise INTO v_tenant, v_status, v_balance
  FROM deposits WHERE id = p_deposit_id FOR UPDATE;
  IF NOT FOUND OR v_tenant IS DISTINCT FROM hos_tenant_id() THEN
    RAISE EXCEPTION 'hos:deposit_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_status IN ('refunded', 'closed') OR p_amount > v_balance THEN
    RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
  END IF;
  SELECT tenant_id, amount_paise, voided_at, ref_type, ref_id, direction, entry_type, mode
    INTO v_cash_tenant, v_cash_amount, v_cash_void, v_cash_ref_type, v_cash_ref, v_cash_direction, v_cash_type, v_cash_mode
  FROM cash_ledger WHERE id = p_cash_entry_id FOR UPDATE;
  IF NOT FOUND OR v_cash_tenant IS DISTINCT FROM hos_tenant_id()
     OR v_cash_void IS NOT NULL
     OR v_cash_amount <> p_amount
     OR v_cash_ref_type IS DISTINCT FROM 'deposit'
     OR v_cash_ref IS DISTINCT FROM p_deposit_id
     OR v_cash_direction IS DISTINCT FROM 'out'
     OR v_cash_type IS DISTINCT FROM 'deposit_refund'
     OR v_cash_mode IS DISTINCT FROM p_mode THEN
    RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
  END IF;
  v_next := v_balance - p_amount;
  UPDATE deposits SET
    balance_paise = v_next,
    status = CASE
      WHEN v_next = 0 THEN 'refunded'
      WHEN v_status = 'adjusted' THEN 'adjusted'
      ELSE 'open'
    END
  WHERE id = p_deposit_id AND tenant_id = hos_tenant_id();
  INSERT INTO refunds (
    tenant_id, deposit_id, number, amount_paise, reason, mode, cash_entry_id, approved_by
  ) VALUES (
    hos_tenant_id(), p_deposit_id, p_refund_number, p_amount, btrim(p_reason), p_mode, p_cash_entry_id, p_approved_by
  );
END $$;

CREATE OR REPLACE FUNCTION hos_cash_attach_ref(p_entry_id uuid, p_ref_id uuid) RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid;
  v_type text;
  v_ref_type text;
  v_ref uuid;
  v_void timestamptz;
  v_patient uuid;
  v_dep_tenant uuid;
  v_dep_patient uuid;
BEGIN
  PERFORM hos_billing_guard();
  SELECT tenant_id, entry_type, ref_type, ref_id, voided_at, patient_id
    INTO v_tenant, v_type, v_ref_type, v_ref, v_void, v_patient
  FROM cash_ledger WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND OR v_tenant IS DISTINCT FROM hos_tenant_id() THEN
    RAISE EXCEPTION 'hos:cash_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_void IS NOT NULL OR v_type IS DISTINCT FROM 'deposit' OR v_ref_type IS DISTINCT FROM 'deposit' THEN
    RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
  END IF;
  SELECT tenant_id, patient_id INTO v_dep_tenant, v_dep_patient
  FROM deposits WHERE id = p_ref_id;
  IF NOT FOUND OR v_dep_tenant IS DISTINCT FROM hos_tenant_id() THEN
    RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
  END IF;
  IF v_patient IS NOT NULL AND v_patient IS DISTINCT FROM v_dep_patient THEN
    RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM deposits d WHERE d.id = v_ref AND d.tenant_id = hos_tenant_id()) THEN
    IF v_ref IS DISTINCT FROM p_ref_id THEN
      RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
    END IF;
    RETURN;
  END IF;
  UPDATE cash_ledger SET ref_id = p_ref_id
  WHERE id = p_entry_id AND tenant_id = hos_tenant_id();
END $$;

CREATE OR REPLACE FUNCTION hos_cash_void(p_entry_id uuid, p_reason text) RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid;
  v_void timestamptz;
BEGIN
  PERFORM hos_billing_guard();
  SELECT tenant_id, voided_at INTO v_tenant, v_void
  FROM cash_ledger WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND OR v_tenant IS DISTINCT FROM hos_tenant_id() THEN
    RAISE EXCEPTION 'hos:cash_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_void IS NOT NULL THEN
    RETURN;
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 3 OR char_length(p_reason) > 300 THEN
    RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
  END IF;
  UPDATE cash_ledger SET voided_at = now(), void_reason = btrim(p_reason)
  WHERE id = p_entry_id AND tenant_id = hos_tenant_id();
END $$;

REVOKE ALL ON FUNCTION hos_billing_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION hos_bill_lock(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hos_deposit_lock(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hos_bill_reprice(uuid, jsonb, text, bigint, bigint, bigint, bigint, bigint, bigint, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION hos_bill_finalise(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION hos_bill_cancel(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION hos_bill_settle(uuid, text, bigint, uuid, uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hos_bill_refund(uuid, bigint, text, text, text, text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hos_bill_credit_note_cancel(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hos_deposit_refund(uuid, bigint, text, text, text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hos_cash_attach_ref(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hos_cash_void(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION hos_bill_lock(uuid) TO hos_app;
GRANT EXECUTE ON FUNCTION hos_deposit_lock(uuid) TO hos_app;
GRANT EXECUTE ON FUNCTION hos_bill_reprice(uuid, jsonb, text, bigint, bigint, bigint, bigint, bigint, bigint, bigint) TO hos_app;
GRANT EXECUTE ON FUNCTION hos_bill_finalise(uuid, text) TO hos_app;
GRANT EXECUTE ON FUNCTION hos_bill_cancel(uuid, text) TO hos_app;
GRANT EXECUTE ON FUNCTION hos_bill_settle(uuid, text, bigint, uuid, uuid, text, uuid) TO hos_app;
GRANT EXECUTE ON FUNCTION hos_bill_refund(uuid, bigint, text, text, text, text, uuid, uuid) TO hos_app;
GRANT EXECUTE ON FUNCTION hos_bill_credit_note_cancel(uuid) TO hos_app;
GRANT EXECUTE ON FUNCTION hos_deposit_refund(uuid, bigint, text, text, text, uuid, uuid) TO hos_app;
GRANT EXECUTE ON FUNCTION hos_cash_attach_ref(uuid, uuid) TO hos_app;
GRANT EXECUTE ON FUNCTION hos_cash_void(uuid, text) TO hos_app;
