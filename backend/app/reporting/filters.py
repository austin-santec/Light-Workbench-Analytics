"""Shared reporting filters for run-grain SQL and unit-grain projections."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


class FilterQuery(Protocol):
    switch_model: str | None
    wavelength_mode: str | None
    channel_count: int | None
    station: int | None


@dataclass(frozen=True)
class ReportingFilters:
    switch_model: str | None = None
    wavelength_mode: str | None = None
    channel_count: int | None = None
    station: int | None = None

    @classmethod
    def from_query(cls, query: FilterQuery) -> ReportingFilters:
        return cls(
            switch_model=query.switch_model,
            wavelength_mode=query.wavelength_mode,
            channel_count=query.channel_count,
            station=query.station,
        )


def run_filter_predicate(run_alias: str = "r", switch_alias: str = "s") -> str:
    """Return the reviewed fixed-shape, parameter-bound run predicate."""
    return f"""AND (? IS NULL OR {switch_alias}.switch_model = ?)
        AND (? IS NULL OR {run_alias}.wavelength_mode = ?)
        AND (? IS NULL OR {run_alias}.front_panel_channel_count = ?)
        AND (? IS NULL OR {run_alias}.station_number = ?)"""


def run_filter_parameters(query: FilterQuery) -> tuple[object, ...]:
    filters = ReportingFilters.from_query(query)
    return tuple(
        value
        for value in (
            filters.switch_model,
            filters.wavelength_mode,
            filters.channel_count,
            filters.station,
        )
        for _ in range(2)
    )


def unit_matches_filters(
    query: FilterQuery,
    *,
    switch_model: str | None,
    wavelength_mode: str | None,
    channel_count: int | None,
    station: int | None,
) -> bool:
    filters = ReportingFilters.from_query(query)
    return all(
        selected is None or actual == selected
        for selected, actual in (
            (filters.switch_model, switch_model),
            (filters.wavelength_mode, wavelength_mode),
            (filters.channel_count, channel_count),
            (filters.station, station),
        )
    )
