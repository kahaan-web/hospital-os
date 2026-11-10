-- Dev-only switch. The API honours a client-supplied mock outcome only when
-- NODE_ENV is not production AND this flag is true. Default is off, so the
-- server decides (capture) on every production and demo checkout.

ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS mock_payment_simulator boolean NOT NULL DEFAULT false;
