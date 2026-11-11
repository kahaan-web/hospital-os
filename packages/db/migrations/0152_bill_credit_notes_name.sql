-- 0150 originally created clinical notes as credit_notes. Shared test databases already
-- have a different credit_notes (platform invoice). Rename only the clinical table.
DO $$
BEGIN
  IF to_regclass('public.bill_credit_notes') IS NOT NULL THEN
    RETURN;
  END IF;
  IF to_regclass('public.credit_notes') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'credit_notes' AND column_name = 'bill_id'
     ) THEN
    ALTER TABLE credit_notes RENAME TO bill_credit_notes;
  END IF;
END $$;
