-- B2 appointments, clinic hours and the OPD queue. Class T (CONTRACTS §3).
-- Column names start_time/end_time stand in for the plan's start/end so the SQL stays unquoted.
-- opd_queue holds the token and queue status. Encounters cannot gain columns (B0 owns that table).

CREATE TABLE doctor_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  doctor_id uuid NOT NULL,
  location_id uuid NOT NULL,
  weekday integer NOT NULL,
  start_time text NOT NULL,
  end_time text NOT NULL,
  slot_minutes integer NOT NULL,
  max_per_slot integer NOT NULL,
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT doctor_schedules_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT doctor_schedules_window_uq UNIQUE (tenant_id, doctor_id, location_id, weekday, start_time),
  CONSTRAINT doctor_schedules_doctor_fk FOREIGN KEY (tenant_id, doctor_id) REFERENCES doctors (tenant_id, id),
  CONSTRAINT doctor_schedules_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT doctor_schedules_weekday_chk CHECK (weekday BETWEEN 0 AND 6),
  CONSTRAINT doctor_schedules_time_chk CHECK (start_time ~ '^[0-2][0-9]:[0-5][0-9]$' AND end_time ~ '^[0-2][0-9]:[0-5][0-9]$' AND end_time > start_time),
  CONSTRAINT doctor_schedules_slot_chk CHECK (slot_minutes BETWEEN 5 AND 180),
  CONSTRAINT doctor_schedules_max_chk CHECK (max_per_slot BETWEEN 1 AND 50)
);

CREATE TABLE schedule_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  doctor_id uuid NOT NULL,
  location_id uuid NOT NULL,
  on_date date NOT NULL,
  kind text NOT NULL,
  start_time text,
  end_time text,
  slot_minutes integer,
  max_per_slot integer,
  reason text NOT NULL DEFAULT '',
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schedule_exceptions_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT schedule_exceptions_doctor_fk FOREIGN KEY (tenant_id, doctor_id) REFERENCES doctors (tenant_id, id),
  CONSTRAINT schedule_exceptions_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT schedule_exceptions_kind_chk CHECK (kind IN ('closed', 'override', 'extra')),
  CONSTRAINT schedule_exceptions_time_chk CHECK (
    (start_time IS NULL AND end_time IS NULL)
    OR (start_time ~ '^[0-2][0-9]:[0-5][0-9]$' AND end_time ~ '^[0-2][0-9]:[0-5][0-9]$' AND end_time > start_time)
  ),
  CONSTRAINT schedule_exceptions_slot_chk CHECK (slot_minutes IS NULL OR slot_minutes BETWEEN 5 AND 180),
  CONSTRAINT schedule_exceptions_max_chk CHECK (max_per_slot IS NULL OR max_per_slot BETWEEN 1 AND 50),
  CONSTRAINT schedule_exceptions_shape_chk CHECK (
    (kind = 'closed' AND ((start_time IS NULL AND end_time IS NULL) OR (start_time IS NOT NULL AND end_time IS NOT NULL)))
    OR (kind IN ('override', 'extra') AND start_time IS NOT NULL AND end_time IS NOT NULL)
  )
);

CREATE INDEX schedule_exceptions_day_idx ON schedule_exceptions (tenant_id, doctor_id, on_date);

CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  location_id uuid NOT NULL,
  patient_id uuid,
  walkin_name text NOT NULL DEFAULT '',
  walkin_mobile text NOT NULL DEFAULT '',
  doctor_id uuid NOT NULL,
  date date NOT NULL,
  slot_start text NOT NULL,
  slot_end text NOT NULL,
  seq integer NOT NULL,
  channel text NOT NULL,
  status text NOT NULL DEFAULT 'booked',
  reason text NOT NULL DEFAULT '',
  counter_kind text,
  encounter_id uuid,
  cancel_reason text,
  cancelled_at timestamptz,
  is_sample boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appointments_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT appointments_patient_fk FOREIGN KEY (tenant_id, patient_id) REFERENCES patients (tenant_id, id),
  CONSTRAINT appointments_doctor_fk FOREIGN KEY (tenant_id, doctor_id) REFERENCES doctors (tenant_id, id),
  CONSTRAINT appointments_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT appointments_encounter_fk FOREIGN KEY (tenant_id, encounter_id) REFERENCES encounters (tenant_id, id),
  CONSTRAINT appointments_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, id),
  CONSTRAINT appointments_channel_chk CHECK (channel IN ('counter', 'phone', 'portal')),
  CONSTRAINT appointments_status_chk CHECK (status IN ('booked', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show')),
  CONSTRAINT appointments_counter_chk CHECK (counter_kind IS NULL OR counter_kind IN ('new', 'repeat')),
  CONSTRAINT appointments_time_chk CHECK (slot_start ~ '^[0-2][0-9]:[0-5][0-9]$' AND slot_end ~ '^[0-2][0-9]:[0-5][0-9]$' AND slot_end > slot_start),
  CONSTRAINT appointments_seq_chk CHECK (seq >= 1),
  CONSTRAINT appointments_party_chk CHECK (patient_id IS NOT NULL OR (walkin_name <> '' AND walkin_mobile <> ''))
);

CREATE INDEX appointments_doctor_day_idx ON appointments (tenant_id, doctor_id, date);
CREATE INDEX appointments_location_day_idx ON appointments (tenant_id, location_id, date);

-- Cancelled rows leave the index so the same seat can be booked again.
CREATE UNIQUE INDEX appointments_slot_seq_uq
  ON appointments (doctor_id, date, slot_start, seq)
  WHERE status <> 'cancelled';

CREATE TABLE opd_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  location_id uuid NOT NULL,
  encounter_id uuid NOT NULL,
  appointment_id uuid,
  patient_id uuid NOT NULL,
  doctor_id uuid NOT NULL,
  token integer NOT NULL,
  status text NOT NULL DEFAULT 'waiting',
  visit_date date NOT NULL,
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT opd_queue_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT opd_queue_encounter_uq UNIQUE (tenant_id, encounter_id),
  CONSTRAINT opd_queue_encounter_fk FOREIGN KEY (tenant_id, encounter_id) REFERENCES encounters (tenant_id, id),
  CONSTRAINT opd_queue_appointment_fk FOREIGN KEY (tenant_id, appointment_id) REFERENCES appointments (tenant_id, id),
  CONSTRAINT opd_queue_patient_fk FOREIGN KEY (tenant_id, patient_id) REFERENCES patients (tenant_id, id),
  CONSTRAINT opd_queue_doctor_fk FOREIGN KEY (tenant_id, doctor_id) REFERENCES doctors (tenant_id, id),
  CONSTRAINT opd_queue_location_fk FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT opd_queue_status_chk CHECK (status IN ('waiting', 'in_consultation', 'done', 'skipped')),
  CONSTRAINT opd_queue_token_chk CHECK (token >= 1)
);

CREATE INDEX opd_queue_day_idx ON opd_queue (tenant_id, location_id, visit_date);

ALTER TABLE encounters DROP CONSTRAINT IF EXISTS encounters_appointment_fk;
ALTER TABLE encounters
  ADD CONSTRAINT encounters_appointment_fk
  FOREIGN KEY (tenant_id, appointment_id) REFERENCES appointments (tenant_id, id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['doctor_schedules', 'schedule_exceptions', 'appointments', 'opd_queue']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC', t);
    EXECUTE format('CREATE POLICY %I ON %I TO hos_migrator USING (true) WITH CHECK (true)', t || '_owner', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I TO hos_app USING (tenant_id = (SELECT hos_tenant_id())) WITH CHECK (tenant_id = (SELECT hos_tenant_id()))',
      t || '_tenant', t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO hos_app', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION hos_touch_updated_at()',
      t || '_touch', t
    );
  END LOOP;
END $$;
