-- ============================================
-- Table Repository
-- ============================================
CREATE TABLE IF NOT EXISTS repositories (
    id SERIAL PRIMARY KEY,
    repo_name VARCHAR(255) UNIQUE NOT NULL,
    owner VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Track which date range has been synchronized from GitHub (DATE only, no timezone issues)
    synced_start_date DATE,
    synced_end_date DATE
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
-- Table WorkflowRun (Données principales)
-- ============================================
CREATE TABLE IF NOT EXISTS workflow_runs (
    id SERIAL PRIMARY KEY,
    
    -- Identifiants
    id_build BIGINT UNIQUE NOT NULL,
    workflow_id INTEGER REFERENCES workflows(id) ON DELETE CASCADE,
    repository_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
    
    -- Git Context
    branch VARCHAR(255),
    commit_sha VARCHAR(40),
    
    -- Status et Résultat
    status VARCHAR(50) NOT NULL,
    conclusion VARCHAR(50),
    
    -- Trigger et Acteur
    workflow_event_trigger VARCHAR(100),
    issuer_name VARCHAR(255),
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP,
    
    -- Durée d'exécution
    build_duration FLOAT,
    
    -- Tests
    tests_ran BOOLEAN DEFAULT FALSE,
    tests_passed INTEGER DEFAULT 0,
    tests_failed INTEGER DEFAULT 0,
    tests_skipped INTEGER DEFAULT 0,
    tests_total INTEGER DEFAULT 0,
    
    -- Jobs
    total_jobs INTEGER DEFAULT 0,
    
    -- Métriques de code
    gh_files_added INTEGER DEFAULT 0,
    gh_files_deleted INTEGER DEFAULT 0,
    gh_files_modified INTEGER DEFAULT 0,
    gh_lines_added INTEGER DEFAULT 0,
    gh_lines_deleted INTEGER DEFAULT 0,
    gh_src_churn INTEGER DEFAULT 0,
    gh_test_churn INTEGER DEFAULT 0,
    
    -- Métriques de fichiers
    gh_src_files INTEGER DEFAULT 0,
    gh_doc_files INTEGER DEFAULT 0,
    gh_other_files INTEGER DEFAULT 0,
    
    -- Pull Request
    gh_pull_req_number INTEGER,
    gh_is_pr BOOLEAN DEFAULT FALSE,
    gh_num_pr_comments INTEGER DEFAULT 0,
    
    -- Repository metrics
    gh_sloc INTEGER,
    git_num_committers INTEGER,
    git_commits INTEGER,
    
    -- Contrainte d'unicité
    CONSTRAINT workflow_runs_unique UNIQUE (repository_id, id_build)
);

COMMENT ON TABLE workflow_runs IS 'Exécutions de workflows GitHub Actions avec toutes les métriques';

-- ============================================
-- Index pour Optimiser les Requêtes
-- ============================================

-- Index sur repository_id (requêtes fréquentes par repo)
CREATE INDEX idx_workflow_runs_repo ON workflow_runs(repository_id);

-- Index sur workflow_id
CREATE INDEX idx_workflow_runs_workflow ON workflow_runs(workflow_id);

-- Index sur created_at pour tri chronologique
CREATE INDEX idx_workflow_runs_created ON workflow_runs(created_at DESC);

-- Index sur conclusion pour filtrer success/failure
CREATE INDEX idx_workflow_runs_conclusion ON workflow_runs(conclusion);

-- Index sur branch
CREATE INDEX idx_workflow_runs_branch ON workflow_runs(branch);

-- Index sur issuer_name pour filtrer par développeur
CREATE INDEX idx_workflow_runs_issuer ON workflow_runs(issuer_name);

-- Index composite pour requêtes repo + date
CREATE INDEX idx_workflow_runs_repo_date ON workflow_runs(repository_id, created_at DESC);

-- Index composite pour requêtes repo + conclusion
CREATE INDEX idx_workflow_runs_repo_conclusion ON workflow_runs(repository_id, conclusion);

-- ============================================
-- Vue Statistiques par Repository
-- ============================================
CREATE OR REPLACE VIEW repo_stats AS
SELECT 
    r.id as repository_id,
    r.repo_name,
    r.owner,
    COUNT(wr.id) as total_runs,
    COUNT(*) FILTER (WHERE wr.conclusion = 'success') as successful_runs,
    COUNT(*) FILTER (WHERE wr.conclusion = 'failure') as failed_runs,
    COUNT(*) FILTER (WHERE wr.conclusion = 'cancelled') as cancelled_runs,
    ROUND(AVG(wr.build_duration)::numeric, 2) as avg_duration_seconds,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY wr.build_duration)::numeric, 2) as median_duration_seconds,
    ROUND((COUNT(*) FILTER (WHERE wr.conclusion = 'success')::numeric / 
           NULLIF(COUNT(wr.id), 0) * 100), 2) as success_rate_percent,
    MAX(wr.created_at) as last_run_at,
    MIN(wr.created_at) as first_run_at,
    COUNT(DISTINCT wr.branch) as unique_branches,
    COUNT(DISTINCT wr.issuer_name) as unique_contributors
FROM repositories r
LEFT JOIN workflow_runs wr ON r.id = wr.repository_id
GROUP BY r.id, r.repo_name, r.owner;

COMMENT ON VIEW repo_stats IS 'Statistiques agrégées par repository pour le dashboard';

-- ============================================
-- Vue Statistiques par Workflow
-- ============================================
CREATE OR REPLACE VIEW workflow_stats AS
SELECT 
    w.id as workflow_id,
    w.workflow_name,
    r.repo_name,
    COUNT(wr.id) as total_runs,
    COUNT(*) FILTER (WHERE wr.conclusion = 'success') as successful_runs,
    COUNT(*) FILTER (WHERE wr.conclusion = 'failure') as failed_runs,
    ROUND(AVG(wr.build_duration)::numeric, 2) as avg_duration_seconds,
    ROUND((COUNT(*) FILTER (WHERE wr.conclusion = 'success')::numeric / 
           NULLIF(COUNT(wr.id), 0) * 100), 2) as success_rate_percent,
    MAX(wr.created_at) as last_run_at
FROM workflows w
LEFT JOIN workflow_runs wr ON w.id = wr.workflow_id
LEFT JOIN repositories r ON w.repository_id = r.id
GROUP BY w.id, w.workflow_name, r.repo_name;

COMMENT ON VIEW workflow_stats IS 'Statistiques agrégées par workflow';

-- ============================================
-- Fonction de Nettoyage
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_old_runs(days_to_keep INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM workflow_runs 
    WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_runs IS 'Supprime les workflow_runs plus anciens que X jours';

-- Message de confirmation
DO $$
BEGIN
    RAISE NOTICE 'Schema GHA Dashboard créé avec succès !';
    RAISE NOTICE 'Tables : repositories, workflows, workflow_runs';
    RAISE NOTICE 'Vues : repo_stats, workflow_stats';
END $$;


