"""
Status metrics calculator - counts runs by conclusion status
"""
from typing import List
from .base import MetricCalculator, MetricResult
from models import WorkflowRun, StatusInfo


class StatusMetric(MetricCalculator):
    """Calculates run status metrics (successes, failures, cancelled)"""
    
    @property
    def name(self) -> str:
        return "status"
    
    @property
    def description(self) -> str:
        return "Counts workflow runs by conclusion status (success, failure, cancelled)"
    
    def calculate(self, runs: List[WorkflowRun]) -> MetricResult:
        num_runs = len(runs)
        num_successes = 0
        num_failures = 0
        num_cancelled = 0
        
        for run in runs:
            if run.conclusion == "success":
                num_successes += 1
            elif run.conclusion == "failure":
                num_failures += 1
            elif run.conclusion == "cancelled":
                num_cancelled += 1
        
        status_info = StatusInfo(
            numRuns=num_runs,
            successes=num_successes,
            failures=num_failures,
            cancelled=num_cancelled
        )
        
        return MetricResult(
            name=self.name,
            value=status_info,
            metadata={
                "total_runs": num_runs,
                "success_rate": (num_successes / num_runs * 100) if num_runs > 0 else 0,
                "failure_rate": (num_failures / num_runs * 100) if num_runs > 0 else 0,
            }
        )

