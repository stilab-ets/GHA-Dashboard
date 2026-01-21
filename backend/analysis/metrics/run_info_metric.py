"""
Run info metrics calculator - extracts workflow names, branches, authors
"""
from typing import List
from .base import MetricCalculator, MetricResult
from models import WorkflowRun, RunInfo


class RunInfoMetric(MetricCalculator):
    """Extracts run information (workflow names, branches, authors)"""
    
    @property
    def name(self) -> str:
        return "run_info"
    
    @property
    def description(self) -> str:
        return "Extracts run information (workflow names, branches, authors)"
    
    def calculate(self, runs: List[WorkflowRun]) -> MetricResult:
        if not runs:
            return MetricResult(
                name=self.name,
                value=RunInfo("", [], [], []),
                metadata={
                    "num_workflows": 0,
                    "num_branches": 0,
                    "num_authors": 0,
                }
            )
        
        workflow_names = set()
        branches = set()
        authors = set()
        
        for run in runs:
            if run.workflow and run.workflow.workflow_name:
                workflow_names.add(run.workflow.workflow_name)
            if run.branch:
                branches.add(run.branch)
            if run.issuer_name:
                authors.add(run.issuer_name)
        
        run_info = RunInfo(
            repositoryName=runs[0].repository.repo_name if runs and runs[0].repository else "",
            workflowNames=list(workflow_names),
            branches=list(branches),
            authors=list(authors),
        )
        
        return MetricResult(
            name=self.name,
            value=run_info,
            metadata={
                "num_workflows": len(workflow_names),
                "num_branches": len(branches),
                "num_authors": len(authors),
            }
        )

