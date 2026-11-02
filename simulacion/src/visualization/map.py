"""Mapa estático y capas WGS84 para inspección en cualquier GIS."""

import os
from pathlib import Path

os.environ.setdefault("MPLCONFIGDIR", "/tmp/grafos-matplotlib")
import matplotlib

matplotlib.use("Agg")
import geopandas as gpd
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from matplotlib.patches import Patch


def export_map(demands, candidates, solution, crs, area, output: Path) -> None:
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
    points.to_crs(4326).to_file(output / "demand_points.geojson", driver="GeoJSON")
    gpd.GeoSeries([area], crs=crs).to_crs(4326).to_file(
        output / "study_area.geojson", driver="GeoJSON"
    )

    fig, ax = plt.subplots(figsize=(11, 9), layout="constrained")
    demand.plot(
        ax=ax,
        column="population",
        cmap="YlOrBr",
        edgecolor="#999999",
        linewidth=0.3,
        legend=True,
        legend_kwds={"label": "Población censal de la localidad"},
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
    ax.legend(
        handles=[
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
        ],
        loc="upper left",
        fontsize=8,
    )
    fig.savefig(output / "map.png", dpi=160)
    plt.close(fig)
