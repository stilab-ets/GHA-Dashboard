"""
Metric registry for managing and discovering metric calculators
"""
from typing import Dict, List
from .base import MetricCalculator, MetricResult
from models import WorkflowRun


class MetricRegistry:
    """
    Registry for metric calculators.
    Allows dynamic registration and discovery of metrics.
    """
    
    def __init__(self):
        self._metrics: Dict[str, MetricCalculator] = {}
    
    def register(self, calculator: MetricCalculator):
        """
        Register a metric calculator.
        
        Args:
            calculator: MetricCalculator instance to register
            
        Raises:
            ValueError: If a metric with the same name is already registered
        """
        if calculator.name in self._metrics:
            raise ValueError(
                f"Metric '{calculator.name}' is already registered. "
                f"Use unregister() first to replace it."
            )
        self._metrics[calculator.name] = calculator
    
    def unregister(self, name: str):
        """
        Unregister a metric calculator.
        
        Args:
            name: Name of the metric to unregister
        """
        if name in self._metrics:
            del self._metrics[name]
    
    def get(self, name: str) -> MetricCalculator:
        """
        Get a metric calculator by name.
        
        Args:
            name: Name of the metric
            
        Returns:
            MetricCalculator instance
            
        Raises:
            KeyError: If metric is not found
        """
        if name not in self._metrics:
            raise KeyError(f"Metric '{name}' not found in registry")
        return self._metrics[name]
    
    def get_all(self) -> List[MetricCalculator]:
        """
        Get all registered metric calculators.
        
        Returns:
            List of all registered MetricCalculator instances
        """
        return list(self._metrics.values())
    
    def calculate_all(self, runs: List[WorkflowRun]) -> Dict[str, MetricResult]:
        """
        Calculate all registered metrics for the given runs.
        
        Args:
            runs: List of WorkflowRun objects
            
        Returns:
            Dictionary mapping metric names to MetricResult objects
        """
        results = {}
        for calculator in self._metrics.values():
            if calculator.validate_runs(runs):
                try:
                    result = calculator.calculate(runs)
                    results[result.name] = result
                except Exception as e:
                    # Log error but continue with other metrics
                    print(f"Error calculating metric '{calculator.name}': {e}")
        return results


# Note: register_metric is now defined in __init__.py to avoid circular imports

