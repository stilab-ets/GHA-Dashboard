"""
Time metrics calculator - calculates build duration statistics
"""
from typing import List
from math import floor
from .base import MetricCalculator, MetricResult
from models import WorkflowRun, TimeInfo


class TimeMetric(MetricCalculator):
    """Calculates build duration statistics (min, max, median, quartiles, average)"""
    
    @property
    def name(self) -> str:
        return "time"
    
    @property
    def description(self) -> str:
        return "Calculates build duration statistics (min, Q1, median, Q3, max, average)"
    
    def calculate(self, runs: List[WorkflowRun]) -> MetricResult:
        num_runs = len(runs)
        build_times = [run.build_duration for run in runs]
        average_build_time = sum(build_times) / num_runs if num_runs > 0 else 0
        
        sorted_build_times = sorted(build_times)
        
        if not sorted_build_times:
            return MetricResult(
                name=self.name,
                value=TimeInfo(0, 0, 0, 0, 0, 0),
                metadata={"num_runs": 0}
            )
        
        # Calculate median
        median_idx = num_runs * 0.5
        if median_idx % 1 != 0:
            median = sorted_build_times[floor(median_idx)]
        else:
            median = (sorted_build_times[int(median_idx)] + sorted_build_times[int(median_idx) - 1]) / 2
        
        # Calculate Q1
        q1_idx = num_runs * 0.25
        if q1_idx % 1 != 0:
            q1 = sorted_build_times[floor(q1_idx)]
        else:
            q1 = (sorted_build_times[int(q1_idx)] + sorted_build_times[int(q1_idx) - 1]) / 2
        
        # Calculate Q3
        q3_idx = num_runs * 0.75
        if q3_idx % 1 != 0:
            q3 = sorted_build_times[floor(q3_idx)]
        else:
            q3 = (sorted_build_times[int(q3_idx)] + sorted_build_times[int(q3_idx) - 1]) / 2
        
        time_info = TimeInfo(
            min=sorted_build_times[0],
            q1=q1,
            median=median,
            q3=q3,
            max=sorted_build_times[-1],
            average=average_build_time
        )
        
        return MetricResult(
            name=self.name,
            value=time_info,
            metadata={
                "num_runs": num_runs,
            }
        )

