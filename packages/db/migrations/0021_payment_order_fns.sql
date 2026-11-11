-- Payment and order status changes. hos_app inserts a payment as `created`
-- and then calls these functions; it has no UPDATE on payments.

CREATE OR REPLACE FUNCTION hos_payment_tenant(p_public_id text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT tenant_id FROM payments WHERE public_id = p_public_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION hos_payment_transition(
  p_payment_id uuid,
  p_to text,
  p_failure_code text,
  p_failure_reason text,
  p_signature_verified boolean
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid;
  v_status text;
BEGIN
  IF hos_scope() NOT IN ('tenant', 'platform') OR hos_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'hos:forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_to NOT IN ('pending', 'captured', 'failed') THEN
    RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
  END IF;
  SELECT tenant_id, status INTO v_tenant, v_status
  FROM payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND OR v_tenant IS DISTINCT FROM hos_tenant_id() THEN
    RAISE EXCEPTION 'hos:payment_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_status = 'captured' AND p_to = 'captured' AND p_signature_verified IS TRUE THEN
    UPDATE payments SET signature_verified = true WHERE id = p_payment_id;
    RETURN;
  END IF;
  IF v_status = p_to AND p_to = 'pending' THEN
    RETURN;
  END IF;
  IF NOT (
    (v_status = 'created' AND p_to IN ('pending', 'captured', 'failed'))
    OR (v_status = 'pending' AND p_to IN ('captured', 'failed'))
  ) THEN
    RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
  END IF;
  IF p_to = 'captured' THEN
    UPDATE payments SET
      status = 'captured',
      captured_at = coalesce(captured_at, now()),
      failure_code = NULL,
      failure_reason = NULL,
      signature_verified = CASE WHEN p_signature_verified IS TRUE THEN true ELSE signature_verified END
    WHERE id = p_payment_id;
  ELSIF p_to = 'failed' THEN
    UPDATE payments SET
      status = 'failed',
      failure_code = coalesce(p_failure_code, 'failed'),
      failure_reason = coalesce(p_failure_reason, 'The mock gateway declined this attempt')
    WHERE id = p_payment_id;
  ELSE
    UPDATE payments SET status = 'pending' WHERE id = p_payment_id;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION hos_order_transition(p_order_id uuid, p_to text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_status text;
BEGIN
  IF hos_scope() NOT IN ('tenant', 'platform') OR hos_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'hos:forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_to NOT IN ('attempted', 'paid', 'cancelled') THEN
    RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
  END IF;
  SELECT status INTO v_status FROM orders
  WHERE id = p_order_id AND tenant_id = hos_tenant_id()
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'hos:order_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_status = p_to THEN
    IF p_to = 'paid' THEN
      UPDATE orders SET paid_at = coalesce(paid_at, now()) WHERE id = p_order_id AND paid_at IS NULL;
    END IF;
    RETURN;
  END IF;
  IF v_status NOT IN ('created', 'attempted') THEN
    RAISE EXCEPTION 'hos:order_closed' USING ERRCODE = 'P0001';
  END IF;
  IF p_to = 'paid' THEN
    UPDATE orders SET status = 'paid', paid_at = coalesce(paid_at, now()) WHERE id = p_order_id;
  ELSE
    UPDATE orders SET status = p_to WHERE id = p_order_id;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION hos_order_mark_paid(p_order_id uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM hos_order_transition(p_order_id, 'paid');
END $$;

REVOKE ALL ON FUNCTION hos_payment_tenant(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION hos_payment_transition(uuid, text, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION hos_order_transition(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION hos_order_mark_paid(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hos_payment_tenant(text) TO hos_app;
GRANT EXECUTE ON FUNCTION hos_payment_transition(uuid, text, text, text, boolean) TO hos_app;
GRANT EXECUTE ON FUNCTION hos_order_transition(uuid, text) TO hos_app;
GRANT EXECUTE ON FUNCTION hos_order_mark_paid(uuid) TO hos_app;
