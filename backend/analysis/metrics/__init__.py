"""
Metrics calculation system - extensible architecture for adding new metrics
"""
from .base import MetricCalculator, MetricResult
from .registry import MetricRegistry
from .status_metric import StatusMetric
from .time_metric import TimeMetric
from .run_info_metric import RunInfoMetric

# Initialize registry with default metrics
_registry = MetricRegistry()

def get_registry():
    """Get the global metric registry"""
    # Lazy registration to avoid circular imports
    if len(_registry.get_all()) == 0:
        _registry.register(StatusMetric())
        _registry.register(TimeMetric())
        _registry.register(RunInfoMetric())
    return _registry

# Convenience function for external registration
def register_metric(calculator: MetricCalculator, registry: MetricRegistry = None):
    """Register a metric calculator with the global registry"""
    target_registry = registry if registry is not None else get_registry()
    target_registry.register(calculator)

__all__ = [
    'MetricCalculator',
    'MetricResult',
    'MetricRegistry',
    'register_metric',
    'get_registry',
    'StatusMetric',
    'TimeMetric',
    'RunInfoMetric',
]

