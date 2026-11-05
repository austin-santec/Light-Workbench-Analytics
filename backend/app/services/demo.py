"""Six fictional examples, not production records or dashboard KPI inputs."""

from app.schemas import DemoRun, DemoRunQuery, DemoRunsResponse, Pagination

# Fixed newest-first UTC order; a repeated unit illustrates that runs != units.
DEMO_RUNS: tuple[DemoRun, ...] = tuple(
    DemoRun(
        run_id=f"DEMO-RUN-{6 - index:04d}",
        unit_id=f"DEMO-UNIT-{unit:04d}",
        switch_id=f"DEMO-SWITCH-{unit:04d}",
        model=model,
        purpose=purpose,
        started_at=f"2026-11-{5 - index // 2:02d}T{14 - index % 2:02d}:00:00Z",
    )
    for index, (unit, model, purpose) in enumerate(
        [
            (1, "DEMO-MODEL-A", "production"),
            (2, "DEMO-MODEL-B", "engineering"),
            (1, "DEMO-MODEL-A", "production"),
            (3, "DEMO-MODEL-A", "training"),
            (4, "DEMO-MODEL-B", "calibration"),
            (5, "DEMO-MODEL-B", "production"),
        ]
    )
)


def list_demo_runs(query: DemoRunQuery) -> DemoRunsResponse:
    matches = [
        run
        for run in DEMO_RUNS
        if (query.purpose is None or run.purpose == query.purpose)
        and (query.model is None or run.model == query.model)
    ]
    end = query.offset + query.limit
    return DemoRunsResponse(
        items=matches[query.offset : end],
        pagination=Pagination(
            limit=query.limit, offset=query.offset, total=len(matches), has_more=end < len(matches)
        ),
    )
