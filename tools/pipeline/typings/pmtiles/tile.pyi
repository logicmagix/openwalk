# Local type stubs for the parts of the pmtiles package the pipeline uses.
from enum import Enum

class Compression(Enum):
    UNKNOWN = 0
    NONE = 1
    GZIP = 2
    BROTLI = 3
    ZSTD = 4

class TileType(Enum):
    UNKNOWN = 0
    MVT = 1
    PNG = 2
    JPEG = 3
    WEBP = 4
    AVIF = 5
    MLT = 6

def zxy_to_tileid(z: int, x: int, y: int) -> int: ...
def tileid_to_zxy(tileid: int) -> tuple[int, int, int]: ...
