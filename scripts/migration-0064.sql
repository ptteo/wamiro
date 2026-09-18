-- Migration 0064 — Admin panel Phase D: health scores + alerts/playbooks
-- Additive + idempotent per ADR-004.
--
--   platform.tenant_health_scores  explainable 0..100 score per org per day
--                                  (Historical class: soft org ref + name
--                                  snapshot, so trend history survives tenant
--                                  deletion). Computed daily from Phase A
--                                  usage rollups + support + billing state.
--   platform.alert_rules           operator-editable thresholds + actions.
--   platform.alert_instances       one row per (rule, org, week) — the
--                                  UNIQUE dedupe index makes the hourly
--                                  evaluator idempotent across restarts and
--                                  concurrent ticks (§8, amendment #5).
--
-- Alert rules are OPERATIONAL class (org-scoped rules die with the tenant's
-- rule book — rules reference orgs only via their instances); instances carry
-- name snapshots so the inbox stays readable after churn.

CREATE TABLE IF NOT EXISTS platform.tenant_health_scores (
  org_id uuid NOT NULL,
  org_name text NOT NULL DEFAULT '',
  day date NOT NULL,
  score int NOT NULL,
  grade text NOT NULL,               -- green | yellow | red
  factors jsonb NOT NULL DEFAULT '{}', -- {recency,adoption,breadth,support,billing}
  PRIMARY KEY (org_id, day)
);
CREATE INDEX IF NOT EXISTS tenant_health_scores_day_idx ON platform.tenant_health_scores(day);
-- retention: 3 years (§8) — pruned nightly by the health_rollup job.

CREATE TABLE IF NOT EXISTS platform.alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  kind text NOT NULL,                -- dormant | trial_ending | failed_payment | sla_breach | churn_risk
  threshold jsonb NOT NULL DEFAULT '{}',
  action text NOT NULL DEFAULT 'notify_operator', -- notify_operator | email_tenant | create_task
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform.alert_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES platform.alert_rules(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  org_name text NOT NULL DEFAULT '',
  window_start date NOT NULL,        -- dedupe bucket (weekly, Monday UTC)
  fired_at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL DEFAULT 'open', -- open | acknowledged | resolved
  payload jsonb NOT NULL DEFAULT '{}',
  resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  acknowledged_at timestamptz,
  CONSTRAINT alert_instances_dedupe_key UNIQUE (rule_id, org_id, window_start)
);
CREATE INDEX IF NOT EXISTS alert_instances_state_idx ON platform.alert_instances(state, fired_at);
CREATE INDEX IF NOT EXISTS alert_instances_org_idx ON platform.alert_instances(org_id);

-- ---------- seeded playbooks (§3.5) ----------
INSERT INTO platform.alert_rules (name, kind, threshold, action)
SELECT * FROM (VALUES
  ('Dormant > 14 days', 'dormant', '{"days":14}'::jsonb, 'notify_operator'),
  ('Trial ending ≤ 7 days', 'trial_ending', '{"daysLeft":7}'::jsonb, 'notify_operator'),
  ('Invoice past due', 'failed_payment', '{}'::jsonb, 'email_tenant'),
  ('Escalated ticket SLA breach', 'sla_breach', '{}'::jsonb, 'notify_operator'),
  ('Health grade red', 'churn_risk', '{"grade":"red"}'::jsonb, 'notify_operator')
) AS seed(name, kind, threshold, action)
WHERE NOT EXISTS (SELECT 1 FROM platform.alert_rules r WHERE r.kind = seed.kind);
