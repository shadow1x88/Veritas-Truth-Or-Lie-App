CREATE TABLE IF NOT EXISTS veritas_rounds (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  question text NOT NULL,
  call text NOT NULL,
  confidence double precision,
  features jsonb NOT NULL,
  mark text,
  label smallint
);

CREATE TABLE IF NOT EXISTS veritas_model (
  id integer PRIMARY KEY,
  updated_at timestamptz NOT NULL DEFAULT now(),
  samples integer NOT NULL,
  kind text NOT NULL,
  model text NOT NULL
);
