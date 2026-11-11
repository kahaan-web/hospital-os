-- Review fixes 11 Nov.
-- P1-1: an invite resolves only when the invited user is still pending.
-- P1-3: tenant-scope no_payment_change cannot move the period, inflate credit, or buy a pricier plan.
--       The 8-argument signature stays so App Admin renewal (platform scope) is unchanged.
--       Tenant scope derives the period (kept) and the credit, and rejects caller values outside that.
-- P2-2: at most one open order per tenant per purpose.

CREATE OR REPLACE FUNCTION hos_invite_tenant(p_token_hash text) RETURNS uuid
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT i.tenant_id
  FROM invitations i
  JOIN users u ON u.id = i.user_id AND u.tenant_id = i.tenant_id
  WHERE i.token_hash = p_token_hash
    AND i.status = 'pending'
    AND i.expires_at > now()
    AND u.status = 'pending'
$$;

REVOKE ALL ON FUNCTION hos_invite_tenant(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hos_invite_tenant(text) TO hos_app;

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
  v_sub subscriptions%ROWTYPE;
  v_cycle text;
  v_span_ms numeric;
  v_total integer;
  v_used integer;
  v_remaining integer;
  v_cur_plan bigint;
  v_next_plan bigint;
  v_cur_month bigint;
  v_next_month bigint;
  v_cur_monthly bigint;
  v_next_monthly bigint;
  v_net bigint := 0;
  v_mod uuid;
  v_unit bigint;
  v_month_unit bigint;
  v_in_cur boolean;
  v_in_next boolean;
  v_cur_amt bigint;
  v_next_amt bigint;
  v_derived bigint;
  v_applied bigint;
BEGIN
  IF hos_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'hos:forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_reason = 'renewal' THEN
    IF hos_scope() IS DISTINCT FROM 'platform' THEN
      RAISE EXCEPTION 'hos:forbidden' USING ERRCODE = '42501';
    END IF;
  ELSIF p_reason = 'no_payment_change' THEN
    IF hos_scope() IS DISTINCT FROM 'platform' AND hos_scope() IS DISTINCT FROM 'tenant' THEN
      RAISE EXCEPTION 'hos:forbidden' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'hos:forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_sub FROM subscriptions WHERE tenant_id = hos_tenant_id() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'hos:no_subscription' USING ERRCODE = 'P0001';
  END IF;
  v_cycle := v_sub.billing_cycle;

  IF p_reason = 'no_payment_change' AND hos_scope() = 'tenant' THEN
    -- A downgrade keeps the period the hospital already paid for.
    IF p_set_period IS TRUE THEN
      RAISE EXCEPTION 'hos:period_change' USING ERRCODE = 'P0001';
    END IF;
    IF p_location_count IS NULL OR p_location_count < 1 THEN
      RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
    END IF;
    IF p_addon_module_ids IS NOT NULL AND jsonb_typeof(p_addon_module_ids) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
    END IF;

    -- Same remaining-day rule as quoteChange: the current day counts as used.
    v_span_ms := extract(epoch FROM (v_sub.current_period_end - v_sub.current_period_start)) * 1000;
    v_total := greatest(1, round(v_span_ms / 86400000)::integer);
    v_used := floor(extract(epoch FROM (now() - v_sub.current_period_start)) * 1000 / 86400000)::integer + 1;
    v_remaining := least(v_total, greatest(0, v_total - greatest(0, v_used)));

    SELECT amount_paise INTO v_cur_plan FROM prices
    WHERE target_type = 'plan' AND target_id = v_sub.plan_id AND billing_cycle = v_cycle;
    SELECT amount_paise INTO v_next_plan FROM prices
    WHERE target_type = 'plan' AND target_id = p_plan_id AND billing_cycle = v_cycle;
    SELECT amount_paise INTO v_cur_month FROM prices
    WHERE target_type = 'plan' AND target_id = v_sub.plan_id AND billing_cycle = 'monthly';
    SELECT amount_paise INTO v_next_month FROM prices
    WHERE target_type = 'plan' AND target_id = p_plan_id AND billing_cycle = 'monthly';
    IF v_cur_plan IS NULL OR v_next_plan IS NULL OR v_cur_month IS NULL OR v_next_month IS NULL THEN
      RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
    END IF;

    v_cur_monthly := v_cur_month * v_sub.location_count;
    v_next_monthly := v_next_month * p_location_count;
    v_net := round((v_next_plan::numeric * p_location_count * v_remaining) / v_total)::bigint
      - round((v_cur_plan::numeric * v_sub.location_count * v_remaining) / v_total)::bigint;

    FOR v_mod IN
      SELECT DISTINCT module_id FROM (
        SELECT si.module_id
        FROM subscription_items si
        WHERE si.subscription_id = v_sub.id
          AND si.status = 'active'
          AND si.kind = 'addon'
          AND si.module_id IS NOT NULL
        UNION
        SELECT t.value::uuid
        FROM jsonb_array_elements_text(coalesce(p_addon_module_ids, '[]'::jsonb)) AS t(value)
      ) mods
    LOOP
      SELECT EXISTS (
        SELECT 1 FROM subscription_items si
        WHERE si.subscription_id = v_sub.id
          AND si.status = 'active'
          AND si.kind = 'addon'
          AND si.module_id = v_mod
      ) INTO v_in_cur;
      v_in_next := jsonb_exists(coalesce(p_addon_module_ids, '[]'::jsonb), v_mod::text);
      SELECT amount_paise INTO v_unit FROM prices
      WHERE target_type = 'module_addon' AND target_id = v_mod AND billing_cycle = v_cycle;
      SELECT amount_paise INTO v_month_unit FROM prices
      WHERE target_type = 'module_addon' AND target_id = v_mod AND billing_cycle = 'monthly';
      IF v_unit IS NULL OR v_month_unit IS NULL THEN
        RAISE EXCEPTION 'hos:bad_transition' USING ERRCODE = 'P0001';
      END IF;
      IF v_in_cur THEN
        v_cur_monthly := v_cur_monthly + v_month_unit * v_sub.location_count;
      END IF;
      IF v_in_next THEN
        v_next_monthly := v_next_monthly + v_month_unit * p_location_count;
      END IF;
      v_cur_amt := CASE WHEN v_in_cur THEN v_unit * v_sub.location_count ELSE 0 END;
      v_next_amt := CASE WHEN v_in_next THEN v_unit * p_location_count ELSE 0 END;
      v_net := v_net
        + round((v_next_amt::numeric * v_remaining) / v_total)::bigint
        - round((v_cur_amt::numeric * v_remaining) / v_total)::bigint;
    END LOOP;

    -- Catalogue monthly price, not the caller's word, decides whether this is an upgrade.
    IF v_next_monthly > v_cur_monthly THEN
      RAISE EXCEPTION 'hos:price_increase' USING ERRCODE = 'P0001';
    END IF;

    -- Unused value is the prorated pre-tax drop. Credit cannot be set above current + that amount.
    IF v_net <= 0 THEN
      v_derived := v_sub.credit_paise - v_net;
    ELSE
      v_applied := least(v_sub.credit_paise, v_net);
      v_derived := v_sub.credit_paise - v_applied;
    END IF;
    IF p_credit_paise IS NULL OR p_credit_paise > v_derived THEN
      RAISE EXCEPTION 'hos:credit_above' USING ERRCODE = 'P0001';
    END IF;

    PERFORM hos_subscription_replace(
      p_plan_id,
      v_cycle,
      p_location_count,
      coalesce(p_addon_module_ids, '[]'::jsonb),
      v_derived,
      v_sub.current_period_start,
      v_sub.current_period_end,
      false
    );
  ELSE
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
  END IF;
END $$;

REVOKE ALL ON FUNCTION hos_subscription_admin_change(uuid, integer, jsonb, bigint, timestamptz, timestamptz, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hos_subscription_admin_change(uuid, integer, jsonb, bigint, timestamptz, timestamptz, boolean, text) TO hos_app;

CREATE UNIQUE INDEX orders_one_open_purpose_uq
  ON orders (tenant_id, purpose)
  WHERE status IN ('created', 'attempted');
