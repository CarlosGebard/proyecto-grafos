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

# Estados de cobertura (ADR 0014); colores compartidos con el visor.
COVERED = "#168354"
REACHABLE = "#c9771c"
UNREACHABLE = "#5f6660"
STATE_LABELS = {
    "covered": "Cubierta",
    "reachable": "Alcanzable, no cubierta",
    "unreachable": "Sin alcance de candidatos",
}


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
    default_radius_m: float | None = None,
    status: dict[str, str] | None = None,
) -> None:
    # Estado por localidad (cubierta / alcanzable / sin alcance, ADR 0014).
    # Sin clasificación explícita sólo se distingue cubierta de no cubierta.
    if status is None:
        status = {
            d.id: "covered" if d.id in solution.covered else "reachable"
            for d in demands
        }
    demand = gpd.GeoDataFrame(
        [
            {
                "id": d.id,
                "population": d.population,
                "latitude": d.latitude,
                "longitude": d.longitude,
                "covered": d.id in solution.covered,
                "status": status.get(d.id, "unreachable"),
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
                # Rango efectivo ρ(a): radio por clase de potencia; None →
                # max_distance_m (misma resolución que compute_coverage).
                "radius_m": a.radius_m if a.radius_m is not None else default_radius_m,
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
                "status": status.get(d.id, "unreachable"),
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
    # Estado de cobertura (ADR 0014): encima de la coropleta, con borde,
    # trama y relleno del punto; nunca con el tono, que es la densidad.
    is_polygon = demand.geom_type.isin(["Polygon", "MultiPolygon"])
    unreachable = demand.loc[is_polygon & (demand.status == "unreachable")]
    if not unreachable.empty:
        with plt.rc_context({"hatch.linewidth": 0.6, "hatch.color": UNREACHABLE}):
            unreachable.plot(
                ax=ax,
                facecolor="none",
                edgecolor=UNREACHABLE,
                linewidth=0,
                hatch="////",
            )
    reachable = demand.loc[is_polygon & (demand.status == "reachable")]
    if not reachable.empty:
        reachable.boundary.plot(
            ax=ax, color=REACHABLE, linewidth=1.1, linestyle=(0, (3, 2))
        )
    covered = demand.loc[is_polygon & (demand.status == "covered")]
    if not covered.empty:
        covered.boundary.plot(ax=ax, color=COVERED, linewidth=1.4)
    for state, color in (("reachable", REACHABLE), ("unreachable", UNREACHABLE)):
        hollow = points.loc[points.status == state]
        if not hollow.empty:
            hollow.plot(
                ax=ax, facecolor="white", edgecolor=color, linewidth=0.9, markersize=14
            )
    filled = points.loc[points.status == "covered"]
    if not filled.empty:
        filled.plot(
            ax=ax, color=COVERED, edgecolor="white", linewidth=0.4, markersize=14
        )
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
        title=f"Cobertura geométrica conectada · {solution.algorithm} · "
        f"{len(solution.selected)} antenas\n"
        f"{_format_miles(solution.population_covered)} habitantes en localidades cubiertas",
    )
    # Resumen de población por estado: cuánto queda fuera y por qué.
    total = float(demand["population"].sum())
    summary = []
    for state, label in STATE_LABELS.items():
        rows = demand.loc[demand.status == state]
        people = float(rows["population"].sum())
        share = f" ({100 * people / total:.1f} %)".replace(".", ",") if total else ""
        summary.append(
            f"{label}: {_format_miles(people)} hab{share} · {len(rows)} loc."
        )
    ax.text(
        0.99,
        0.01,
        "\n".join(summary),
        transform=ax.transAxes,
        ha="right",
        va="bottom",
        fontsize=8,
        bbox={"facecolor": "white", "edgecolor": "#999999", "alpha": 0.9},
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
                edgecolor=COVERED,
                linewidth=1.4,
                label=STATE_LABELS["covered"],
            ),
            Patch(
                facecolor="none",
                edgecolor=REACHABLE,
                linestyle=(0, (3, 2)),
                label=STATE_LABELS["reachable"],
            ),
            Patch(
                facecolor="none",
                edgecolor=UNREACHABLE,
                hatch="////",
                linewidth=0,
                label=STATE_LABELS["unreachable"],
            ),
            Line2D(
                [],
                [],
                marker="o",
                linestyle="none",
                markerfacecolor="white",
                markeredgecolor="#555555",
                label="Punto interior (lleno = cubierta)",
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
