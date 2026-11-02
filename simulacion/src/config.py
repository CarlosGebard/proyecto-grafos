"""Parámetros explícitos compartidos por CLI y configuración TOML."""

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class PipelineConfig:
    region: str = "biobio"
    bbox: tuple[float, ...] | None = None
    polygon: str | None = None
    k: int = 5
    candidate_spacing_m: float = 5000.0
    max_distance_m: float = 30000.0
    antenna_height_m: float = 30.0
    receiver_height_m: float = 1.5
    sample_step_m: float | None = None
    dem_resolution_m: float | None = None
    dem_source: str = "alos"
    dem: str | None = None
    population: str | None = None
    population_field: str = "HABITANTES"
    id_field: str = "ID"
    layer: str | None = None
    data_dir: str = "data"
    output: str = "outputs/pilot"
    download_population: bool = False
    max_combinations: int = 100_000
    max_candidates: int = 10_000
    max_pairs: int = 2_000_000
    max_dem_pixels: int = 10_000_000

    def validate(self) -> None:
        for name in (
            "k",
            "max_combinations",
            "max_candidates",
            "max_pairs",
            "max_dem_pixels",
        ):
            value = getattr(self, name)
            if type(value) is not int or value < (0 if name == "k" else 1):
                raise ValueError(
                    f"{name} debe ser un entero {'no negativo' if name == 'k' else 'positivo'}"
                )
        for name in (
            "candidate_spacing_m",
            "max_distance_m",
            "antenna_height_m",
            "receiver_height_m",
            "sample_step_m",
            "dem_resolution_m",
        ):
            value = getattr(self, name)
            if value is None and name in {"sample_step_m", "dem_resolution_m"}:
                continue
            minimum_ok = (
                value >= 0
                if name in {"antenna_height_m", "receiver_height_m"}
                else value > 0
            )
            if not math.isfinite(value) or not minimum_ok:
                raise ValueError(f"{name} inválido")
        if self.region not in {"biobio", "metropolitana"}:
            raise ValueError(
                "region debe ser biobio o metropolitana; usar bbox/polygon para otras áreas"
            )
        if self.dem_source not in {"alos", "copernicus"}:
            raise ValueError("dem_source debe ser alos o copernicus")
