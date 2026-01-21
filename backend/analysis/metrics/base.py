"""
Base classes for metric calculators
"""
from abc import ABC, abstractmethod
from typing import Any, Dict, List
from dataclasses import dataclass
from models import WorkflowRun


@dataclass
class MetricResult:
    """Container for a metric's calculated value"""
    name: str
    value: Any
    metadata: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}


class MetricCalculator(ABC):
    """
    Abstract base class for all metric calculators.
    
    To add a new metric:
    1. Create a class inheriting from MetricCalculator
    2. Implement calculate() method
    3. Register it using register_metric()
    """
    
    @property
    @abstractmethod
    def name(self) -> str:
        """Unique name for this metric"""
        pass
    
    @property
    @abstractmethod
    def description(self) -> str:
        """Human-readable description of what this metric calculates"""
        pass
    
    @abstractmethod
    def calculate(self, runs: List[WorkflowRun]) -> MetricResult:
        """
        Calculate the metric for a list of workflow runs.
        
        Args:
            runs: List of WorkflowRun objects to calculate metrics from
            
        Returns:
            MetricResult containing the calculated metric value
        """
        pass
    
    def validate_runs(self, runs: List[WorkflowRun]) -> bool:
        """
        Optional validation of input runs.
        Override if your metric requires specific data.
        
        Returns:
            True if runs are valid for this metric, False otherwise
        """
        return len(runs) > 0

