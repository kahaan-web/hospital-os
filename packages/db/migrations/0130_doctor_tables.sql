-- B3 doctor workspace: order sets and prescription templates.

CREATE TABLE order_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('lab', 'procedure', 'medicine')),
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  owner_doctor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CONSTRAINT order_sets_doctor_fk FOREIGN KEY (tenant_id, owner_doctor_id) REFERENCES doctors (tenant_id, id)
);

CREATE INDEX order_sets_tenant_idx ON order_sets (tenant_id, owner_doctor_id);

CREATE TABLE prescription_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  owner_doctor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CONSTRAINT prescription_templates_doctor_fk FOREIGN KEY (tenant_id, owner_doctor_id) REFERENCES doctors (tenant_id, id)
);

CREATE INDEX prescription_templates_tenant_idx ON prescription_templates (tenant_id, owner_doctor_id);
