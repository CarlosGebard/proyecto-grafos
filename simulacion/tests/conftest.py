import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin

from src.geo.elevation import ElevationModel


@pytest.fixture
def dem_factory(tmp_path):
    def create(values, transform=None, crs="EPSG:32718", nodata=-9999):
        path = tmp_path / f"dem-{len(list(tmp_path.glob('*.tif')))}.tif"
        values = np.asarray(values, dtype="float32")
        with rasterio.open(
            path,
            "w",
            driver="GTiff",
            count=1,
            dtype="float32",
            width=values.shape[1],
            height=values.shape[0],
            crs=crs,
            transform=transform or from_origin(0, 100, 10, 10),
            nodata=nodata,
        ) as out:
            out.write(values, 1)
        return path

    return create


@pytest.fixture
def flat_dem(dem_factory):
    return ElevationModel(dem_factory(np.zeros((10, 10))))
