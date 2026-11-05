"""Parámetros explícitos compartidos por CLI y configuración TOML."""

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class PipelineConfig:
    region: str = "biobio"
    bbox: tuple[float, ...] | None = None
    polygon: str | None = None
    center: tuple[float, float] | None = None
    study_size_m: float | None = None
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
    download_osm_roads: bool = False
    osm_roads: str | None = None
    prc_directory: str | None = None
    prc_mode: str = "screening"
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
        if (self.center is None) != (self.study_size_m is None):
            raise ValueError("center y study_size_m deben usarse juntos")
        if self.center is not None:
            if len(self.center) != 2 or not all(
                math.isfinite(value) for value in self.center
            ):
                raise ValueError("center requiere longitud y latitud finitas")
            longitude, latitude = self.center
            if not (-180 <= longitude <= 180 and -80 <= latitude <= 84):
                raise ValueError("center WGS84 inválido")
            if not math.isfinite(self.study_size_m) or self.study_size_m <= 0:
                raise ValueError("study_size_m debe ser positivo")
            if self.bbox is not None or self.polygon is not None:
                raise ValueError("center/study_size_m no se combinan con bbox/polygon")
        if self.prc_mode not in {"screening", "strict"}:
            raise ValueError("prc_mode debe ser screening o strict")
