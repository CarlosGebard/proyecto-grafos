"""Mapa estático y capas WGS84 para inspección en cualquier GIS."""

import os
from pathlib import Path

os.environ.setdefault("MPLCONFIGDIR", "/tmp/grafos-matplotlib")
import matplotlib

matplotlib.use("Agg")
import geopandas as gpd
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.cm import ScalarMappable
from matplotlib.colors import ListedColormap
from matplotlib.lines import Line2D
from matplotlib.patches import Patch

from src.visualization.relief import paint_relief

# Rampa secuencial de densidad, idéntica a populationColor en terrain-view.js.
DENSITY_STOPS = [(255, 238, 184), (239, 167, 82), (184, 72, 40)]


def _density_colors(count: int) -> list[tuple[float, float, float]]:
    stops = [tuple(value / 255 for value in stop) for stop in DENSITY_STOPS]

    def sample(fraction: float) -> tuple[float, float, float]:
        if fraction <= 0:
            return stops[0]
        if fraction >= 1:
            return stops[-1]
        scaled = fraction * (len(stops) - 1)
        index = min(int(scaled), len(stops) - 2)
        mix = scaled - index
        return tuple(
            stops[index][channel]
            + (stops[index + 1][channel] - stops[index][channel]) * mix
            for channel in range(3)
        )

    return [sample((index + 0.5) / count) for index in range(count)]


def _format_miles(value: float) -> str:
    return f"{value:,.0f}".replace(",", ".")


def export_map(
    demands,
    candidates,
    solution,
    crs,
    area,
    output: Path,
    dem_path: Path,
    hypsometric_palette: str,
    excluded_candidates=None,
) -> None:
    demand = gpd.GeoDataFrame(
        [
            {
                "id": d.id,
                "population": d.population,
                "latitude": d.latitude,
                "longitude": d.longitude,
                "covered": d.id in solution.covered,
                "geometry": d.geometry,
            }
            for d in demands
        ],
        crs=crs,
    )
    antennas = gpd.GeoDataFrame(
        [
            {
                "id": a.id,
                "elevation": a.elevation,
                "latitude": a.latitude,
                "longitude": a.longitude,
                "selected": a.id in solution.selected,
                "constraint_status": a.constraint_status,
                "constraint_rule": a.constraint_rule,
                "geometry": a.point,
            }
            for a in candidates
        ],
        crs=crs,
    )
    points = gpd.GeoDataFrame(
        [
            {
                "id": d.id,
                "population": d.population,
                "covered": d.id in solution.covered,
                "geometry": d.point,
            }
            for d in demands
        ],
        crs=crs,
    )
    demand.to_crs(4326).to_file(output / "demand.geojson", driver="GeoJSON")
    antennas.to_crs(4326).to_file(output / "candidates.geojson", driver="GeoJSON")
    if excluded_candidates:
        antennas.loc[antennas.constraint_status == "excluded"].to_crs(4326).to_file(
            output / "excluded_candidates.geojson", driver="GeoJSON"
        )
    points.to_crs(4326).to_file(output / "demand_points.geojson", driver="GeoJSON")
    gpd.GeoSeries([area], crs=crs).to_crs(4326).to_file(
        output / "study_area.geojson", driver="GeoJSON"
    )

    fig, ax = plt.subplots(figsize=(11, 9), layout="constrained")
    relief_info = paint_relief(ax, dem_path, hypsometric_palette)
    # Segunda dimensión: densidad de población (hab/km²) por cuantiles.
    # Coropletas para la tasa normalizada (Slocum et al.); el conteo bruto
    # queda en los puntos cubiertos, no en el relleno.
    areas_km2 = demand.geometry.area / 1e6
    densities = demand["population"] / areas_km2.where(areas_km2 > 0)
    valid = densities.dropna()
    class_count = min(5, max(1, len(valid)))
    inner = (
        np.unique(
            np.round(
                np.quantile(
                    valid.to_numpy(), [i / class_count for i in range(1, class_count)]
                ),
                2,
            )
        )
        if class_count > 1
        else np.array([])
    )
    demand["densidad_idx"] = densities.apply(
        lambda value: (
            np.searchsorted(inner, value, side="right")
            if np.isfinite(value)
            else np.nan
        )
    )
    class_colors = _density_colors(len(inner) + 1)
    if len(valid):
        demand.plot(
            ax=ax,
            column="densidad_idx",
            cmap=ListedColormap(class_colors),
            edgecolor="#999999",
            linewidth=0.3,
            alpha=0.55,
            missing_kwds={"color": "#e9eee9"},
        )
    else:
        # Sin polígonos con área: puntos sin densidad, relleno neutro.
        demand.plot(
            ax=ax,
            color="#e9eee9",
            edgecolor="#999999",
            linewidth=0.3,
            alpha=0.55,
        )
    covered = demand.loc[demand.covered]
    if not covered.empty:
        polygons = covered[covered.geom_type.isin(["Polygon", "MultiPolygon"])]
        if not polygons.empty:
            polygons.boundary.plot(ax=ax, color="#168354", linewidth=1.4)
        points.loc[points.covered].plot(ax=ax, color="#168354", markersize=12)
    antennas.plot(ax=ax, marker="x", color="#6d78a0", markersize=25)
    selected = antennas.loc[antennas.selected]
    if not selected.empty:
        selected.plot(
            ax=ax, marker="*", color="#1868d0", edgecolor="white", markersize=200
        )
    gpd.GeoSeries([area], crs=crs).boundary.plot(ax=ax, color="#222222", linewidth=1)
    left, bottom, right, top = area.bounds
    pad = max(right - left, top - bottom) * 0.03
    ax.set(
        xlim=(left - pad, right + pad),
        ylim=(bottom - pad, top + pad),
        xlabel=f"Este (m) · {crs.to_string()}",
        ylabel="Norte (m)",
        title=f"Cobertura geométrica · {solution.algorithm} · {len(solution.selected)} antenas\n"
        f"{solution.population_covered:,.0f} habitantes en localidades cubiertas",
    )
    ax.ticklabel_format(style="plain", useOffset=False)
    fig.colorbar(
        ScalarMappable(norm=relief_info["norm"], cmap=relief_info["cmap"]),
        ax=ax,
        boundaries=relief_info["breaks"],
        spacing="proportional",
        shrink=0.6,
        pad=0.02,
        label="Elevación (m)",
    )
    legend_handles = []
    if len(valid):
        edges = [valid.min(), *inner.tolist(), valid.max()]
        for index in range(len(edges) - 1):
            legend_handles.append(
                Patch(
                    facecolor=class_colors[index],
                    edgecolor="#999999",
                    label=(
                        f"{_format_miles(edges[index])}–{_format_miles(edges[index + 1])}"
                        " hab/km²"
                    ),
                )
            )
    legend_handles.extend(
        [
            Patch(
                facecolor="none",
                edgecolor="#168354",
                label="Localidad cubierta (punto interior)",
            ),
            Line2D(
                [], [], marker="x", linestyle="none", color="#6d78a0", label="Candidato"
            ),
            Line2D(
                [],
                [],
                marker="*",
                linestyle="none",
                color="#1868d0",
                markersize=12,
                label="Seleccionada",
            ),
        ]
    )
    if relief_info["has_nodata"]:
        legend_handles.append(
            Patch(facecolor="#D8D8D8", edgecolor="none", label="Sin datos del DEM")
        )
    ax.legend(handles=legend_handles, loc="upper left", fontsize=8)
    fig.savefig(output / "map.png", dpi=160)
    plt.close(fig)
