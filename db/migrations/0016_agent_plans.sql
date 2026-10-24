-- Agent memory: every run of the placement or academic agent is kept, so the next run can see
-- what was suggested, what the student finished and what changed in their data since then.
CREATE TABLE agent_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text NOT NULL REFERENCES student_records(id) ON DELETE CASCADE,
  agent text NOT NULL CHECK (agent IN ('placement', 'academic')),
  track text NOT NULL DEFAULT '',
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  plan jsonb NOT NULL,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  trace jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text NOT NULL DEFAULT 'rules',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_plans_student_idx ON agent_plans(student_id, agent, track, created_at DESC);

-- Web research is cached per role so the agent does not refetch the same pages on every run.
CREATE TABLE agent_research_cache (
  key text PRIMARY KEY,
  slug text,
  sources jsonb NOT NULL,
  trace jsonb NOT NULL DEFAULT '[]'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
