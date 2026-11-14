# How much gyroscope data does the band give on this link?
# Tries each sensor choice at its fastest allowed rate and measures what really arrives.
#   .venv/bin/python gyro_rate.py 35         .venv/bin/python gyro_rate.py --sim
import os
import sys

KIT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "vexo-open-kit")
sys.path.insert(0, os.path.join(KIT, "python"))
from vexo_open.sync import Band  # noqa: E402

SECONDS = 5
sim = "--sim" in sys.argv
number = 35 if sim else int(sys.argv[1])
band = Band.connect(number, "sim" if sim else "ble")

limits = band.motion_limits()
print("Link allows (samples/s): accel %s, gyro %s, both %s" % (limits.accel, limits.gyro, limits.both))

seen = {}


def on_motion(m):
    seen["count"] = seen.get("count", 0) + 1
    seen.setdefault("first", m)
    seen["last"] = m
    for axis in ("gx", "gy", "gz"):
        v = getattr(m, axis, None)
        if v is not None:
            seen["peak"] = max(seen.get("peak", 0.0), abs(v))


band.on("motion", on_motion)

for sensors in ("gyro", "both"):
    seen.clear()
    streams = band.configure(motion="fastest", sensors=sensors)
    band.wait(SECONDS)
    band.configure(motion=False)
    count, first, last = seen.get("count", 0), seen.get("first"), seen.get("last")
    if count < 2 or last.time <= first.time:
        print("%-5s: too few samples arrived" % sensors)
        continue
    rate = (count - 1) / (last.time - first.time)
    lost = (last.n - first.n + 1 - count) if first.n is not None else "?"
    print("%-5s: asked %d/s, measured %.1f/s, %d samples in %ds, lost %s, peak turn %.1f deg/s"
          % (sensors, streams["motion"], rate, count, SECONDS, lost, seen.get("peak", 0.0)))

band.disconnect()
