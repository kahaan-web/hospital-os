-- B9 Nurse station: MAR schedules and medication administrations.

CREATE TABLE mar_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  order_item_id uuid NOT NULL,
  encounter_id uuid NOT NULL,
  scheduled_at timestamptz NOT NULL,
  voided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, order_item_id, scheduled_at),
  CONSTRAINT mar_schedules_item_fk FOREIGN KEY (tenant_id, order_item_id) REFERENCES clinical_order_items (tenant_id, id),
  CONSTRAINT mar_schedules_encounter_fk FOREIGN KEY (tenant_id, encounter_id) REFERENCES encounters (tenant_id, id)
);

CREATE INDEX mar_schedules_encounter_idx ON mar_schedules (tenant_id, encounter_id, scheduled_at);
CREATE INDEX mar_schedules_item_idx ON mar_schedules (tenant_id, order_item_id);

CREATE TABLE medication_administrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  mar_schedule_id uuid NOT NULL,
  status text NOT NULL,
  dose_given text NOT NULL DEFAULT '',
  given_at timestamptz NOT NULL DEFAULT now(),
  given_by uuid,
  reason text NOT NULL DEFAULT '',
  witness_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, mar_schedule_id),
  CONSTRAINT med_admin_schedule_fk FOREIGN KEY (tenant_id, mar_schedule_id) REFERENCES mar_schedules (tenant_id, id),
  CONSTRAINT med_admin_given_by_fk FOREIGN KEY (tenant_id, given_by) REFERENCES users (tenant_id, id),
  CONSTRAINT med_admin_witness_fk FOREIGN KEY (tenant_id, witness_user_id) REFERENCES users (tenant_id, id),
  CONSTRAINT med_admin_status_chk CHECK (status IN ('given', 'held', 'refused', 'missed', 'self'))
);

CREATE INDEX med_admin_given_idx ON medication_administrations (tenant_id, given_at);
