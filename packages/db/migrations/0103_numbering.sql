-- Next number in a tenant series. SECURITY INVOKER so it runs under RLS and hos_tenant_id().
-- Call it last in the transaction. A rollback restores the counter, so numbers have no gaps.

CREATE OR REPLACE FUNCTION hos_next_number(p_series text, p_location uuid, p_period text)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  n integer;
BEGIN
  INSERT INTO number_series (tenant_id, location_id, series_key, period, last_no)
  VALUES ((SELECT hos_tenant_id()), p_location, p_series, coalesce(p_period, ''), 1)
  ON CONFLICT ON CONSTRAINT number_series_uq
  DO UPDATE SET last_no = number_series.last_no + 1
  RETURNING last_no INTO n;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION hos_next_number(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hos_next_number(text, uuid, text) TO hos_app;
