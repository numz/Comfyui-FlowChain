import os
import shutil
import subprocess
from .caching import HierarchicalCache, LRUCache, CacheKeySetInputSignature, CacheKeySetID


class CacheSet:
    def __init__(self, lru_size=None):
        if lru_size is None or lru_size == 0:
            self.init_classic_cache()
        else:
            self.init_lru_cache(lru_size)
        self.all = [self.outputs, self.ui, self.objects]

    # Useful for those with ample RAM/VRAM -- allows experimenting without
    # blowing away the cache every time
    def init_lru_cache(self, cache_size):
        self.outputs = LRUCache(CacheKeySetInputSignature, max_size=cache_size)
        self.ui = LRUCache(CacheKeySetInputSignature, max_size=cache_size)
        self.objects = HierarchicalCache(CacheKeySetID)

    # Performs like the old cache -- dump data ASAP
    def init_classic_cache(self):
        self.outputs = HierarchicalCache(CacheKeySetInputSignature)
        self.ui = HierarchicalCache(CacheKeySetInputSignature)
        self.objects = HierarchicalCache(CacheKeySetID)

    def recursive_debug_dump(self):
        result = {
            "outputs": self.outputs.recursive_debug_dump(),
            "ui": self.ui.recursive_debug_dump(),
        }
        return result


caches = CacheSet(None)


def ffmpeg_suitability(path):
    try:
        version = subprocess.run([path, "-version"], check=True,
                                 capture_output=True).stdout.decode("utf-8")
    except:
        return 0
    score = 0
    # rough layout of the importance of various features
    simple_criterion = [("libvpx", 20), ("264", 10), ("265", 3),
                        ("svtav1", 5), ("libopus", 1)]
    for criterion in simple_criterion:
        if version.find(criterion[0]) >= 0:
            score += criterion[1]
    # obtain rough compile year from copyright information
    copyright_index = version.find('2000-2')
    if copyright_index >= 0:
        copyright_year = version[copyright_index + 6:copyright_index + 9]
        if copyright_year.isnumeric():
            score += int(copyright_year)
    return score


if "VHS_FORCE_FFMPEG_PATH" in os.environ:
    ffmpeg_path = os.environ.get("VHS_FORCE_FFMPEG_PATH")
else:
    ffmpeg_paths = []
    try:
        from imageio_ffmpeg import get_ffmpeg_exe

        imageio_ffmpeg_path = get_ffmpeg_exe()
        ffmpeg_paths.append(imageio_ffmpeg_path)
    except:
        if "VHS_USE_IMAGEIO_FFMPEG" in os.environ:
            raise

    if "VHS_USE_IMAGEIO_FFMPEG" in os.environ:
        ffmpeg_path = imageio_ffmpeg_path
    else:
        system_ffmpeg = shutil.which("ffmpeg")
        if system_ffmpeg is not None:
            ffmpeg_paths.append(system_ffmpeg)
        if os.path.isfile("ffmpeg"):
            ffmpeg_paths.append(os.path.abspath("ffmpeg"))
        if os.path.isfile("ffmpeg.exe"):
            ffmpeg_paths.append(os.path.abspath("ffmpeg.exe"))
        if len(ffmpeg_paths) == 0:

            ffmpeg_path = None
        elif len(ffmpeg_paths) == 1:
            # Evaluation of suitability isn't required, can take sole option
            # to reduce startup time
            ffmpeg_path = ffmpeg_paths[0]
        else:
            ffmpeg_path = max(ffmpeg_paths, key=ffmpeg_suitability)
