"""Mapa de segmentos candidato-localidad del piloto exacto de Biobío."""

import json
from pathlib import Path

import geopandas as gpd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
from matplotlib.lines import Line2D

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "outputs/biobio-exacto"
OUT = ROOT / "output/pdf/figures/segmentos_biobio.pdf"


def main() -> None:
    manifest = json.loads((BASE / "manifest.json").read_text())
    graph = json.loads((BASE / "graph.json").read_text())
    crs = manifest["metric_crs"]
    candidates = gpd.read_file(BASE / "candidates.geojson").to_crs(crs).set_index("id")
    demands = gpd.read_file(BASE / "demand_points.geojson").to_crs(crs).set_index("id")
    area = gpd.read_file(BASE / "study_area.geojson").to_crs(crs)
    selected = set(json.loads((BASE / "metrics.json").read_text())["results"][0]["selected"])

    blocked, visible = [], []
    for candidate_id, candidate in candidates.iterrows():
        for demand_id, demand in demands.iterrows():
            segment = [
                (candidate.geometry.x, candidate.geometry.y),
                (demand.geometry.x, demand.geometry.y),
            ]
            if demand_id in graph["coverage"][candidate_id]:
                visible.append(segment)
            else:
                blocked.append(segment)

    fig, ax = plt.subplots(figsize=(8.0, 7.1), layout="constrained")
    area.boundary.plot(ax=ax, color="#1c2f3b", linewidth=1.1, zorder=1)
    ax.add_collection(LineCollection(blocked, colors="#c8874e", linewidths=0.18, alpha=0.08, zorder=2))
    ax.add_collection(LineCollection(visible, colors="#008b80", linewidths=0.34, alpha=0.30, zorder=3))
    ax.scatter(
        demands.geometry.x,
        demands.geometry.y,
        s=8 + demands.population * 0.10,
        color="#526d7a",
        edgecolor="white",
        linewidth=0.25,
        alpha=0.9,
        zorder=4,
    )
    ax.scatter(
        candidates.geometry.x,
        candidates.geometry.y,
        marker="+",
        color="#1c2f3b",
        s=48,
        linewidth=1.0,
        zorder=5,
    )
    chosen = candidates.loc[list(selected)]
    ax.scatter(
        chosen.geometry.x,
        chosen.geometry.y,
        marker="*",
        color="#1c2f3b",
        edgecolor="white",
        linewidth=0.8,
        s=210,
        zorder=6,
    )
    left, bottom, right, top = area.total_bounds
    ax.set(
        xlim=(left, right),
        ylim=(bottom, top),
        aspect="equal",
        xlabel="Este UTM (m)",
        ylabel="Norte UTM (m)",
    )
    ax.ticklabel_format(style="plain", useOffset=False)
    ax.legend(
        handles=[
            Line2D([], [], color="#008b80", lw=1.8, label="Segmento con línea de vista"),
            Line2D([], [], color="#c8874e", lw=1.8, label="Segmento bloqueado por relieve"),
            Line2D([], [], marker="+", linestyle="none", color="#1c2f3b", label="Candidato"),
            Line2D([], [], marker="*", linestyle="none", color="#1c2f3b", markersize=10, label="Seleccionada"),
        ],
        loc="upper right",
        fontsize=8,
        frameon=True,
    )
    fig.savefig(OUT, bbox_inches="tight")
    plt.close(fig)


if __name__ == "__main__":
    main()
