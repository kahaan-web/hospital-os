-- Replace hos_next_invoice_number. RETURNS TABLE columns named fy/number clash with
-- invoice_sequences.fy inside the function body (Postgres: column reference "fy" is ambiguous).
-- #variable_conflict use_column makes SQL statements prefer the table column. The OUT
-- variables are still assigned explicitly before RETURN NEXT.
-- Argument stays timestamptz so a timestamp near midnight IST lands in the right financial year.

CREATE OR REPLACE FUNCTION hos_next_invoice_number(issue_date timestamptz)
RETURNS TABLE (fy text, number text)
LANGUAGE plpgsql VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  v_local timestamp;
  v_y int;
  v_m int;
  v_start int;
  v_fy text;
  v_prefix text;
  v_seq int;
  v_compact text;
  v_number text;
BEGIN
  IF hos_scope() NOT IN ('tenant', 'platform') THEN
    RAISE EXCEPTION 'invoice numbering requires tenant or platform scope' USING ERRCODE = '42501';
  END IF;
  v_local := timezone('Asia/Kolkata', issue_date);
  v_y := extract(year FROM v_local)::int;
  v_m := extract(month FROM v_local)::int;
  IF v_m >= 4 THEN v_start := v_y; ELSE v_start := v_y - 1; END IF;
  v_fy := v_start::text || '-' || lpad(((v_start + 1) % 100)::text, 2, '0');
  v_compact := lpad((v_start % 100)::text, 2, '0') || lpad(((v_start + 1) % 100)::text, 2, '0');
  SELECT s.invoice_prefix INTO v_prefix FROM platform_settings s WHERE s.id = 1;
  IF v_prefix IS NULL OR v_prefix = '' THEN v_prefix := 'HOS'; END IF;
  INSERT INTO invoice_sequences AS seq (fy, last_no) VALUES (v_fy, 1)
  ON CONFLICT (fy) DO UPDATE SET last_no = seq.last_no + 1
  RETURNING seq.last_no INTO v_seq;
  v_number := v_prefix || '/' || v_compact || '/' || lpad(v_seq::text, 6, '0');
  IF char_length(v_number) > 16 THEN
    RAISE EXCEPTION 'invoice number % exceeds 16 characters', v_number USING ERRCODE = '22023';
  END IF;
  fy := v_fy;
  number := v_number;
  RETURN NEXT;
END $$;

REVOKE ALL ON FUNCTION hos_next_invoice_number(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hos_next_invoice_number(timestamptz) TO hos_app;
