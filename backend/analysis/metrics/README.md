# Extensible Metrics System

This directory contains the extensible metrics calculation system for GHA-Dashboard. The system allows you to easily add new metrics without modifying the core aggregation code.

## Architecture

- **`base.py`**: Defines the `MetricCalculator` abstract base class and `MetricResult` data class
- **`registry.py`**: Implements the `MetricRegistry` for managing metric calculators
- **`status_metric.py`**: Calculates run status metrics (successes, failures, cancelled)
- **`time_metric.py`**: Calculates build duration statistics (min, Q1, median, Q3, max, average)
- **`run_info_metric.py`**: Extracts run information (workflow names, branches, authors)

## Adding a New Metric

To add a new metric, follow these steps:

### 1. Create a Metric Calculator Class

Create a new file (e.g., `backend/analysis/metrics/my_metric.py`):

```python
from typing import List
from .base import MetricCalculator, MetricResult
from models import WorkflowRun, YourDataClass  # Import your data class

class MyMetric(MetricCalculator):
    """Description of what this metric calculates"""
    
    @property
    def name(self) -> str:
        return "my_metric"
    
    @property
    def description(self) -> str:
        return "Brief description of the metric"
    
    def calculate(self, runs: List[WorkflowRun]) -> MetricResult:
        # Your calculation logic here
        result_value = YourDataClass(...)  # Your result data structure
        
        return MetricResult(
            name=self.name,
            value=result_value,
            metadata={
                "additional_info": "any extra data"
            }
        )
```

### 2. Register the Metric

In `backend/analysis/metrics/__init__.py`, add:

```python
from .my_metric import MyMetric

# In get_registry() function, add:
_registry.register(MyMetric())
```

### 3. Update AggregationData Model (if needed)

If your metric returns a new data structure, add it to `backend/models.py`:

```python
@dataclass
class YourDataClass:
    field1: type
    field2: type
    # ...

@dataclass
class AggregationData:
    runsInfo: RunInfo
    aggregationPeriod: AggregationPeriod
    periodStart: date
    statusInfo: StatusInfo
    timeInfo: TimeInfo
    yourMetricInfo: YourDataClass  # Add your new field
```

### 4. Update aggregation.py (if needed)

If you added a new field to `AggregationData`, update `aggregate_one_period()` in `backend/analysis/aggregation.py`:

```python
my_metric_result = metric_results.get("my_metric")

return AggregationData(
    run_info_result.value,
    aggregationPeriod,
    periodStart,
    status_result.value if status_result else StatusInfo(0, 0, 0, 0),
    time_result.value if time_result else TimeInfo(0, 0, 0, 0, 0, 0),
    my_metric_result.value if my_metric_result else YourDataClass(...)  # Add your metric
)
```

## Example: Adding a "Failure Rate" Metric

Here's a complete example:

```python
# backend/analysis/metrics/failure_rate_metric.py
from typing import List
from .base import MetricCalculator, MetricResult
from models import WorkflowRun

@dataclass
class FailureRateInfo:
    total_runs: int
    failure_rate: float
    recent_failures: int

class FailureRateMetric(MetricCalculator):
    @property
    def name(self) -> str:
        return "failure_rate"
    
    @property
    def description(self) -> str:
        return "Calculates failure rate and recent failure trends"
    
    def calculate(self, runs: List[WorkflowRun]) -> MetricResult:
        total = len(runs)
        failures = sum(1 for run in runs if run.conclusion == "failure")
        failure_rate = (failures / total * 100) if total > 0 else 0
        
        # Recent failures (last 10 runs)
        recent = runs[:10] if len(runs) >= 10 else runs
        recent_failures = sum(1 for run in recent if run.conclusion == "failure")
        
        return MetricResult(
            name=self.name,
            value=FailureRateInfo(total, failure_rate, recent_failures),
            metadata={"total_failures": failures}
        )
```

Then register it in `__init__.py` and update the models/aggregation as needed.

## Benefits

- **Separation of Concerns**: Each metric is self-contained
- **Easy Testing**: Test each metric independently
- **Extensibility**: Add metrics without touching existing code
- **Maintainability**: Clear structure makes code easier to understand
- **Backward Compatible**: Existing metrics continue to work

## Current Metrics

1. **Status Metric** (`status`): Counts runs by conclusion status
2. **Time Metric** (`time`): Calculates build duration statistics
3. **Run Info Metric** (`run_info`): Extracts workflow names, branches, authors

