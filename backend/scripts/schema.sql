-- ============================================
-- Table Repository
-- ============================================
CREATE TABLE IF NOT EXISTS repositories (
    id SERIAL PRIMARY KEY,
    repo_name VARCHAR(255) UNIQUE NOT NULL,
    owner VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE repositories IS 'Liste des repositories GitHub suivis';

-- ============================================
-- Table Workflow
-- ============================================
CREATE TABLE IF NOT EXISTS workflows (
    id SERIAL PRIMARY KEY,
    workflow_id BIGINT UNIQUE,
    workflow_name VARCHAR(255) NOT NULL,
    repository_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT workflows_unique_name UNIQUE (repository_id, workflow_name)
);

COMMENT ON TABLE workflows IS 'Workflows GitHub Actions configurés pour chaque repository';

-- ============================================
-- Table WorkflowRun
-- ============================================
CREATE TABLE IF NOT EXISTS workflow_runs (
    id SERIAL PRIMARY KEY,

    -- Identifiants
    id_build BIGINT UNIQUE NOT NULL,
    workflow_id INTEGER REFERENCES workflows(id) ON DELETE CASCADE,
    repository_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,

    -- Git Context
    branch VARCHAR(255),
    issuer_name VARCHAR(255),

    -- Status
    status VARCHAR(50),
    conclusion VARCHAR(50),

    -- Trigger info
    workflow_event_trigger VARCHAR(100),

    -- Timestamps
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP,

    -- Duration
    build_duration FLOAT,

    -- Unique constraint
    CONSTRAINT workflow_runs_unique UNIQUE (repository_id, id_build)
);

COMMENT ON TABLE workflow_runs IS 'Exécutions de workflows GitHub Actions simplifiées';

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX idx_workflow_runs_repo ON workflow_runs(repository_id);
CREATE INDEX idx_workflow_runs_workflow ON workflow_runs(workflow_id);
CREATE INDEX idx_workflow_runs_created ON workflow_runs(created_at DESC);
CREATE INDEX idx_workflow_runs_conclusion ON workflow_runs(conclusion);
CREATE INDEX idx_workflow_runs_branch ON workflow_runs(branch);
CREATE INDEX idx_workflow_runs_issuer ON workflow_runs(issuer_name);

DO $$
BEGIN
    RAISE NOTICE 'Schema GHA Dashboard created (minimal version, no tests, no metrics, no total_jobs)';
END $$;