-- Linear-regression models trained on the platform's own data. Every training run is kept, so a
-- model's accuracy can be compared over time and a bad retrain can be spotted.
CREATE TABLE ml_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (name IN ('result_marks', 'next_sgpa', 'interview_score')),
  rows int NOT NULL,
  model jsonb NOT NULL,
  metrics jsonb NOT NULL,
  trained_by uuid REFERENCES users(id) ON DELETE SET NULL,
  trained_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ml_models_name_idx ON ml_models(name, trained_at DESC);
