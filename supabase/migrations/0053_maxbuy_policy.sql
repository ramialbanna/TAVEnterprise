-- Migration 0053 — MaxBuy policy table + global $800 seed (DEC-1)

CREATE TABLE tav.maxbuy_policy (
  id                   uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  policy_version       text        NOT NULL,
  scope                text        NOT NULL
    CHECK (scope IN ('global', 'segment', 'source', 'price_band')),
  scope_key            text,
  target_net_gross     numeric     CHECK (target_net_gross >= 0),
  effective_from       timestamptz NOT NULL DEFAULT now(),
  effective_to         timestamptz,
  changed_by_user_id   text        NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_maxbuy_policy_current
  ON tav.maxbuy_policy (scope, coalesce(scope_key, ''))
  WHERE effective_to IS NULL;

INSERT INTO tav.maxbuy_policy (
  policy_version,
  scope,
  scope_key,
  target_net_gross,
  changed_by_user_id
) VALUES (
  'global-v1',
  'global',
  NULL,
  800,
  'system'
);
