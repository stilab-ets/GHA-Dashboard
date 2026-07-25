from data.manager import DataManager
from data.persistence import DataPersistence
from ghaminer_stream import convert_ghaminer_run_to_dashboard, dedupe_runs_by_id, get_run_identity


def test_save_runs_batch_de_duplicates_existing_runs_by_id(tmp_path):
    persistence = DataPersistence(data_dir=str(tmp_path))
    repo = "owner/repo"

    persistence.save_runs_batch(repo, [
        {"id": 101, "conclusion": "failure"},
        {"id": "101", "conclusion": "success"},
        {"id": 102, "conclusion": "success"},
        {"conclusion": "cancelled"},
    ])

    runs = persistence.get_all_runs(repo)

    assert set(runs.keys()) == {"101", "102"}
    assert runs["101"]["conclusion"] == "success"
    assert len(runs) == 2


def test_jobs_can_be_saved_and_loaded_in_bulk(tmp_path):
    persistence = DataPersistence(data_dir=str(tmp_path))
    repo = "owner/repo"

    persistence.save_jobs_batch(repo, {
        "101": [{"name": "build", "conclusion": "success"}],
        102: [{"name": "test", "conclusion": "failure"}],
    })

    jobs_by_run = persistence.get_jobs_for_runs(repo, ["101", "102", "999"])

    assert jobs_by_run == {
        "101": [{"name": "build", "conclusion": "success"}],
        "102": [{"name": "test", "conclusion": "failure"}],
    }


def test_data_manager_filters_previously_collected_runs(tmp_path):
    persistence = DataPersistence(data_dir=str(tmp_path))
    repo = "owner/repo"
    persistence.save_runs_batch(repo, [
        {"id": 201, "conclusion": "success"},
    ])

    manager = DataManager(repo, persistence)
    new_runs = manager.filter_new_runs([
        {"id": 201, "conclusion": "success"},
        {"id": 202, "conclusion": "failure"},
        {"conclusion": "cancelled"},
    ])

    assert [run["id"] for run in new_runs] == [202]


def test_dedupe_runs_by_id_keeps_statistics_count_coherent():
    deduped = dedupe_runs_by_id([
        {"id": 301, "conclusion": "failure", "jobs": [{"id": "job-1"}]},
        {"id_build": "301", "conclusion": "success"},
        {"id": 302, "conclusion": "success"},
        {"conclusion": "cancelled"},
    ])

    assert len(deduped) == 2
    assert [get_run_identity(run) for run in deduped] == ["301", "302"]

    run_301 = deduped[0]
    assert run_301["conclusion"] == "success"
    assert run_301["jobs"] == [{"id": "job-1"}]


def test_dashboard_run_conversion_preserves_commit_sha():
    run = convert_ghaminer_run_to_dashboard({
        "id_build": 401,
        "workflow_id": 10,
        "workflow_name": "CI",
        "head_sha": "abc123456789",
        "job_details": [],
    }, "owner/repo")

    assert run["commit_sha"] == "abc123456789"
    assert run["head_sha"] == "abc123456789"
