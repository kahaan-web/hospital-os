-- U3: hos_app cannot write subscriptions in any scope. Fulfilment and
-- App Admin (including a no-payment downgrade) go through these functions.
-- hos_subscription_replace is not granted to hos_app.

REVOKE INSERT, UPDATE, DELETE ON subscriptions FROM hos_app;
REVOKE INSERT, UPDATE, DELETE ON subscription_items FROM hos_app;

CREATE OR REPLACE FUNCTION hos_subscription_replace(
  p_plan_id uuid,
  p_cycle text,
  p_location_count integer,
  p_addon_module_ids jsonb,
  p_credit_paise bigint,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_set_period boolean
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid := hos_tenant_id();
  v_sub uuid;
  v_cycle text;
  v_unit bigint;
  v_addon uuid;
  v_addon_unit bigint;
BEGIN
  IF v_tenant IS NULL OR hos_scope() NOT IN ('tenant', 'platform') THEN
    RAISE EXCEPTION 'hos:forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_location_count < 1 OR p_credit_paise < 0 OR p_cycle NOT IN ('monthly', 'annual') THEN
    RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM plans WHERE id = p_plan_id AND status = 'active') THEN
    RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
  END IF;

  SELECT id, billing_cycle INTO v_sub, v_cycle
  FROM subscriptions WHERE tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN
    v_cycle := p_cycle;
    INSERT INTO subscriptions (
      tenant_id, plan_id, billing_cycle, location_count, status,
      current_period_start, current_period_end, credit_paise
    ) VALUES (
      v_tenant, p_plan_id, v_cycle, p_location_count, 'active',
      p_period_start, p_period_end, p_credit_paise
    ) RETURNING id INTO v_sub;
  ELSE
    UPDATE subscriptions SET
      plan_id = p_plan_id,
      location_count = p_location_count,
      credit_paise = p_credit_paise,
      current_period_start = CASE WHEN p_set_period THEN p_period_start ELSE current_period_start END,
      current_period_end = CASE WHEN p_set_period THEN p_period_end ELSE current_period_end END
    WHERE id = v_sub;
  END IF;

  SELECT amount_paise INTO v_unit FROM prices
  WHERE target_type = 'plan' AND target_id = p_plan_id AND billing_cycle = v_cycle;
  IF v_unit IS NULL THEN
    RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
  END IF;

  UPDATE subscription_items
  SET status = 'removed', removed_at = now()
  WHERE subscription_id = v_sub AND status = 'active';

  INSERT INTO subscription_items (
    tenant_id, subscription_id, kind, plan_id, unit_amount_paise, quantity, status
  ) VALUES (
    v_tenant, v_sub, 'plan', p_plan_id, v_unit, p_location_count, 'active'
  );

  FOR v_addon IN
    SELECT DISTINCT t.value::uuid
    FROM jsonb_array_elements_text(coalesce(p_addon_module_ids, '[]'::jsonb)) AS t(value)
  LOOP
    SELECT amount_paise INTO v_addon_unit FROM prices
    WHERE target_type = 'module_addon' AND target_id = v_addon AND billing_cycle = v_cycle;
    IF v_addon_unit IS NULL THEN
      RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO subscription_items (
      tenant_id, subscription_id, kind, module_id, unit_amount_paise, quantity, status
    ) VALUES (
      v_tenant, v_sub, 'addon', v_addon, v_addon_unit, p_location_count, 'active'
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION hos_subscription_apply_order(p_order_id uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_quote jsonb;
  v_credit bigint;
BEGIN
  IF hos_scope() NOT IN ('tenant', 'platform') OR hos_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'hos:forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_order FROM orders
  WHERE id = p_order_id AND tenant_id = hos_tenant_id()
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'hos:order_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_order.fulfilled_at IS NOT NULL THEN
    RETURN false;
  END IF;
  IF v_order.status <> 'paid' THEN
    RAISE EXCEPTION 'hos:order_not_paid' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM payments
    WHERE order_id = v_order.id AND status = 'captured' AND signature_verified
  ) THEN
    RAISE EXCEPTION 'hos:payment_not_verified' USING ERRCODE = 'P0001';
  END IF;
  v_quote := v_order.quote;
  v_credit := coalesce((v_quote->'change'->>'creditBalanceAfterPaise')::bigint, 0);
  PERFORM hos_subscription_replace(
    (v_quote->'config'->>'planId')::uuid,
    v_quote->'config'->>'cycle',
    (v_quote->'config'->>'locationCount')::integer,
    v_quote->'config'->'addonModuleIds',
    v_credit,
    (v_quote->>'periodStart')::timestamptz,
    (v_quote->>'periodEnd')::timestamptz,
    v_order.purpose = 'onboarding'
  );
  UPDATE orders
  SET fulfilled_at = now(), status = 'paid', paid_at = coalesce(paid_at, now())
  WHERE id = v_order.id;
  RETURN true;
END $$;

-- p_reason = 'renewal' is App Admin only (platform scope).
-- p_reason = 'no_payment_change' is the immediate downgrade path (tenant or platform).
CREATE OR REPLACE FUNCTION hos_subscription_admin_change(
  p_plan_id uuid,
  p_location_count integer,
  p_addon_module_ids jsonb,
  p_credit_paise bigint,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_set_period boolean,
  p_reason text
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_cycle text;
BEGIN
  IF hos_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'hos:forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_reason = 'renewal' THEN
    IF hos_scope() IS DISTINCT FROM 'platform' THEN
      RAISE EXCEPTION 'hos:forbidden' USING ERRCODE = '42501';
    END IF;
  ELSIF p_reason = 'no_payment_change' THEN
    IF hos_scope() NOT IN ('tenant', 'platform') THEN
      RAISE EXCEPTION 'hos:forbidden' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'hos:forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT billing_cycle INTO v_cycle FROM subscriptions WHERE tenant_id = hos_tenant_id();
  IF v_cycle IS NULL THEN
    RAISE EXCEPTION 'hos:no_subscription' USING ERRCODE = 'P0001';
  END IF;
  PERFORM hos_subscription_replace(
    p_plan_id,
    v_cycle,
    p_location_count,
    p_addon_module_ids,
    p_credit_paise,
    p_period_start,
    p_period_end,
    p_set_period
  );
END $$;

REVOKE ALL ON FUNCTION hos_subscription_replace(uuid, text, integer, jsonb, bigint, timestamptz, timestamptz, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION hos_subscription_apply_order(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hos_subscription_admin_change(uuid, integer, jsonb, bigint, timestamptz, timestamptz, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hos_subscription_apply_order(uuid) TO hos_app;
GRANT EXECUTE ON FUNCTION hos_subscription_admin_change(uuid, integer, jsonb, bigint, timestamptz, timestamptz, boolean, text) TO hos_app;
