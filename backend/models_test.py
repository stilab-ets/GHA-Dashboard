import models as m

import datetime as dt

# ===============================
# || Repository equality tests ||
# ===============================
def test_repository_equality_passes():
    a = m.Repository()
    a.id = 1
    a.repo_name = "crates.io"
    a.owner = "rust-lang"
    a.created_at = dt.datetime.today()
    a.updated_at = dt.datetime.today()

    b = m.Repository()
    b.id = 1
    b.repo_name = "crates.io"
    b.owner = "rust-lang"
    b.created_at = dt.datetime.today()
    b.updated_at = dt.datetime.today()

    assert a == b

def test_repository_equality_fails():
    a = m.Repository()
    a.id = 2
    a.repo_name = "git"
    a.owner = "git"
    a.created_at = dt.datetime.today()
    a.updated_at = dt.datetime.today()

    b = m.Repository()
    b.id = 1
    b.repo_name = "crates.io"
    b.owner = "rust-lang"
    b.created_at = dt.datetime.today()
    b.updated_at = dt.datetime.today()

    assert a != b

# =============================
# || Workflow equality tests ||
# =============================
def test_workflow_equality_passes():
    a = m.Workflow()
    a.id = 1
    a.workflow_name = "CI"
    a.repository_id = 1
    a.created_at = dt.datetime.today()
    a.updated_at = dt.datetime.today()

    b = m.Workflow()
    b.id = 1
    b.workflow_name = "CI"
    b.repository_id = 1
    b.created_at = dt.datetime.today()
    b.updated_at = dt.datetime.today()

    assert a == b

def test_workflow_equality_fails():
    a = m.Workflow()
    a.id = 1
    a.workflow_name = "CI"
    a.repository_id = 1
    a.created_at = dt.datetime.today()
    a.updated_at = dt.datetime.today()

    b = m.Workflow()
    b.id = 2
    b.workflow_name = "CD"
    b.repository_id = 2
    b.created_at = dt.datetime.today()
    b.updated_at = dt.datetime.today()

    assert a != b

# ================================
# || WorkflowRun equality tests ||
# ================================
def test_workflow_run_equality_passes():
    a = m.WorkflowRun()
    a.id = 1
    a.id_build = 1
    a.workflow_id = 1
    a.repository_id = 1
    a.branch = "main"
    a.commit_sha = "0a0a0a0a"
    a.status = "completed"
    a.conclusion = "success"
    a.workflow_event_trigger = "push"
    a.issuer_name = "Gaubbe"
    a.created_at = dt.datetime.today()
    a.updated_at = dt.datetime.today()
    a.build_duration = 300.0
    a.tests_ran = True
    a.tests_passed = 10
    a.tests_failed = 2
    a.tests_skipped = 1
    a.tests_total = 13
    a.total_jobs = 2
    a.gh_files_added = 1
    a.gh_files_deleted = 2
    a.gh_files_modified = 5
    a.gh_lines_added = 254
    a.gh_lines_deleted = 347
    a.gh_src_churn = 0
    a.gh_test_churn = 0
    a.gh_src_files = 103
    a.gh_doc_files = 12
    a.gh_other_files = 2
    a.gh_pull_req_number = None
    a.gh_is_pr = False
    a.gh_num_pr_comments = 0
    a.gh_sloc = 0
    a.git_num_committers = 1
    a.git_commits = 1

    b = m.WorkflowRun()
    b.id = 1
    b.id_build = 1
    b.workflow_id = 1
    b.repository_id = 1
    b.branch = "main"
    b.commit_sha = "0a0a0a0a"
    b.status = "completed"
    b.conclusion = "success"
    b.workflow_event_trigger = "push"
    b.issuer_name = "Gaubbe"
    b.created_at = dt.datetime.today()
    b.updated_at = dt.datetime.today()
    b.build_duration = 300.0
    b.tests_ran = True
    b.tests_passed = 10
    b.tests_failed = 2
    b.tests_skipped = 1
    b.tests_total = 13
    b.total_jobs = 2
    b.gh_files_added = 1
    b.gh_files_deleted = 2
    b.gh_files_modified = 5
    b.gh_lines_added = 254
    b.gh_lines_deleted = 347
    b.gh_src_churn = 0
    b.gh_test_churn = 0
    b.gh_src_files = 103
    b.gh_doc_files = 12
    b.gh_other_files = 2
    b.gh_pull_req_number = None
    b.gh_is_pr = False
    b.gh_num_pr_comments = 0
    b.gh_sloc = 0
    b.git_num_committers = 1
    b.git_commits = 1

    assert a == b

def test_workflow_run_equality_fails():
    a = m.WorkflowRun()
    a.id = 1
    a.id_build = 1
    a.workflow_id = 1
    a.repository_id = 1
    a.branch = "main"
    a.commit_sha = "0a0a0a0a"
    a.status = "completed"
    a.conclusion = "success"
    a.workflow_event_trigger = "push"
    a.issuer_name = "Gaubbe"
    a.created_at = dt.datetime.today()
    a.updated_at = dt.datetime.today()
    a.build_duration = 300.0
    a.tests_ran = True
    a.tests_passed = 10
    a.tests_failed = 2
    a.tests_skipped = 1
    a.tests_total = 13
    a.total_jobs = 2
    a.gh_files_added = 1
    a.gh_files_deleted = 2
    a.gh_files_modified = 5
    a.gh_lines_added = 254
    a.gh_lines_deleted = 347
    a.gh_src_churn = 0
    a.gh_test_churn = 0
    a.gh_src_files = 103
    a.gh_doc_files = 12
    a.gh_other_files = 2
    a.gh_pull_req_number = None
    a.gh_is_pr = False
    a.gh_num_pr_comments = 0
    a.gh_sloc = 0
    a.git_num_committers = 1
    a.git_commits = 1

    b = m.WorkflowRun()
    b.id = 2
    b.id_build = 2
    b.workflow_id = 2
    b.repository_id = 2
    b.branch = "dev"
    b.commit_sha = "0b0b0b0b"
    b.status = "completed"
    b.conclusion = "failure"
    b.workflow_event_trigger = "pull_request"
    b.issuer_name = "torvalds"
    b.created_at = dt.datetime.today()
    b.updated_at = dt.datetime.today()
    b.build_duration = 600.0
    b.tests_ran = False
    b.tests_passed = 0
    b.tests_failed = 0
    b.tests_skipped = 0
    b.tests_total = 0
    b.total_jobs = 2
    b.gh_files_added = 1
    b.gh_files_deleted = 2
    b.gh_files_modified = 5
    b.gh_lines_added = 254
    b.gh_lines_deleted = 347
    b.gh_src_churn = 0
    b.gh_test_churn = 0
    b.gh_src_files = 103
    b.gh_doc_files = 12
    b.gh_other_files = 2
    b.gh_pull_req_number = None
    b.gh_is_pr = True
    b.gh_num_pr_comments = 10
    b.gh_sloc = 0
    b.git_num_committers = 1
    b.git_commits = 1

    assert a != b

