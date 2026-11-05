import json
import re
import time
from pathlib import Path

import requests

BASE = "https://geoide.minvu.cl/server/rest/services/IPT/PRC_Biobio/FeatureServer"
OUT = Path("prc_biobio")
OUT.mkdir(exist_ok=True)

session = requests.Session()
session.headers["User-Agent"] = "PRC-Biobio-GIS/1.0"


def get_json(url, params=None):
    for attempt in range(4):
        try:
            response = session.get(url, params=params, timeout=90)
            response.raise_for_status()
            data = response.json()
            if "error" in data:
                raise RuntimeError(data["error"])
            return data
        except (requests.RequestException, ValueError, RuntimeError):
            if attempt == 3:
                raise
            time.sleep(2**attempt)


def main():
    service = get_json(BASE, {"f": "json"})
    manifest = []

    for layer in service["layers"]:
        layer_id = layer["id"]
        name = layer["name"]
        safe = re.sub(r"[^a-zA-Z0-9_-]", "_", name)
        print(f"Descargando {layer_id}: {name}")

        url = f"{BASE}/{layer_id}/query"
        try:
            ids = get_json(
                url, {"where": "1=1", "returnIdsOnly": "true", "f": "json"}
            ).get("objectIds") or []

            features = []
            for i in range(0, len(ids), 100):
                batch = ids[i : i + 100]
                data = get_json(
                    url,
                    {
                        "objectIds": ",".join(map(str, batch)),
                        "outFields": "*",
                        "outSR": 4326,
                        "returnGeometry": "true",
                        "f": "geojson",
                    },
                )
                features.extend(data["features"])

            result = {"type": "FeatureCollection", "features": features}
            path = OUT / f"{layer_id:02d}_{safe}.geojson"
            path.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
            manifest.append(
                {
                    "id": layer_id,
                    "name": name,
                    "file": path.name,
                    "features": len(features),
                }
            )
            print(f"  OK: {len(features)} geometrías")

        except Exception as error:
            print(f"  ERROR: {error}")

    (OUT / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"\nDescarga finalizada: {len(manifest)} capas")


if __name__ == "__main__":
    main()
