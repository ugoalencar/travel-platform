import json, re, subprocess

FPS = 30


def _rms(src, off, extra):
    af = "aresample=44100,aformat=channel_layouts=mono" + extra + ",asetnsamples=n=1470:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-"
    out = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(off), "-t", "20", "-i", src, "-af", af, "-f", "null", "-"], capture_output=True, text=True).stdout
    vals = []
    for m in re.finditer(r"RMS_level=(\S+)", out):
        v = m.group(1)
        vals.append(-90.0 if v in ("-inf", "nan") else float(v))
    return vals


def _norm(x):
    lo, hi = min(x), max(x)
    return [round((v - lo) / (hi - lo), 3) for v in x]


def write(dest, src, off):
    a = _rms(src, off, "")
    b = _rms(src, off, ",lowpass=f=180")
    n = min(len(a), len(b), 600)
    a, b = _norm(a[:n]), _norm(b[:n])
    frames = [{"bands": [b[i], a[i]]} for i in range(n)]
    open(dest, "w").write("var AUDIO_DATA=" + json.dumps({"fps": FPS, "totalFrames": n, "frames": frames}, separators=(",", ":")) + ";")
