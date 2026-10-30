"""Gera as 3 composicoes Hyperframes (parte-1..3) da serie Travel Plataforma.

Uso: python build.py   (a partir de brag-output/serie)
"""
import json, os, re, shutil, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
SHARED = os.path.join(HERE, "shared")
CUES = os.path.expanduser(
    "~/.claude/skills/brag/assets/music/cues/happy-beats-business-moves-vol-9-by-ende-dot-app.music-cues.json"
)
BEATS = [b["time"] for b in json.load(open(CUES))["beats"]]
DUR = 20.0


def sfx_len(name):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", os.path.join(SHARED, "sfx", name + ".ogg")],
        capture_output=True, text=True,
    ).stdout.strip()
    return max(0.05, round(float(out), 2))


COMMON_CSS = """
@font-face{font-family:'Fraunces';src:url(assets/fonts/Fraunces-400.woff2) format('woff2');font-weight:100 900;}
@font-face{font-family:'Inter';src:url(assets/fonts/Inter-400.woff2) format('woff2');font-weight:100 900;}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:#0f2a4a;font-family:'Inter',sans-serif}
#root{position:relative;width:100%;height:100%;overflow:hidden}
.clip{position:absolute;inset:0}
.scene{position:absolute;inset:0;overflow:hidden}
.paper{background:#fff}.deep{background:#f3f4f6}.navy{background:#0f2a4a}
.abs{position:absolute}
.serif{font-family:'Fraunces',serif;font-weight:400;letter-spacing:-0.02em;margin:0}
.eyebrow{position:absolute;margin:0;font-weight:600;font-size:28px;line-height:1;letter-spacing:.18em;text-transform:uppercase;color:#1554d1}
.eyebrow.c{color:#06b6d4}
.glow{position:absolute;width:1200px;height:1200px;border-radius:50%;background:radial-gradient(circle,rgba(6,182,212,.45) 0%,rgba(6,182,212,0) 65%)}
.card{position:absolute;background:#fff;border:2px solid #e2e6ea;border-radius:4px}
.shot{position:absolute;background:#fff;border:2px solid #e2e6ea;border-radius:4px;box-shadow:0 30px 70px rgba(15,42,74,.25);color:#1a1d21}
.btn{position:absolute;background:#1554d1;color:#fff;font-weight:600;border-radius:4px;display:flex;align-items:center;justify-content:center}
.num{font-family:'Fraunces',serif;color:#1554d1;margin:0}
.th,.tr{position:absolute;left:0;right:0}
.th span,.tr span{position:absolute;display:flex;align-items:center}
.tr{border-top:2px solid #e2e6ea}
.nav{position:absolute;left:20px;width:260px;height:64px;padding:0 20px;display:flex;align-items:center;font-size:30px;border-radius:4px;color:#1a1d21}
.nav.on{background:#e6eeff;color:#1043a8;font-weight:800}
.panel{position:absolute;top:130px;height:640px;background:#fff;border:2px solid #e2e6ea;border-radius:4px;width:408px}
.panel .lbl{position:absolute;left:28px;top:24px;font-size:36px;font-weight:800;color:#1554d1}
"""

ROUTE_SVG = """<svg data-layout-allow-overflow viewBox="0 0 400 520" preserveAspectRatio="xMidYMid slice" width="100%" height="100%"><rect width="400" height="520" fill="#0f2a4a"/><g fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="1.5"><ellipse cx="300" cy="150" rx="40" ry="28"/><ellipse cx="300" cy="150" rx="90" ry="62"/><ellipse cx="300" cy="150" rx="150" ry="104"/><ellipse cx="300" cy="150" rx="215" ry="148"/><ellipse cx="300" cy="150" rx="285" ry="196"/><ellipse cx="80" cy="440" rx="60" ry="40"/><ellipse cx="80" cy="440" rx="125" ry="84"/><ellipse cx="80" cy="440" rx="200" ry="134"/></g><path d="M70 440 C 140 330, 90 250, 190 210 S 330 170, 305 148" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="2 12" stroke-linecap="round"/><circle cx="70" cy="440" r="9" fill="#fff"/><circle cx="305" cy="148" r="11" fill="#06b6d4"/><circle cx="305" cy="148" r="22" fill="none" stroke="#06b6d4" stroke-opacity=".5" stroke-width="2"/></svg>"""


class Part:
    def __init__(self, n, off):
        self.n, self.off = n, off
        self.beats = [b - off for b in BEATS if off - 0.5 <= b <= off + DUR + 0.5]
        self.clips, self.js, self.audio = [], [], []
        self.track = 11
        self.sid = 0

    def snap(self, t, tol=0.17):
        best = min(self.beats, key=lambda b: abs(b - t))
        return round(best, 2) if abs(best - t) <= tol else t

    def scene(self, sid, start, dur, cls, inner):
        self.clips.append(
            f'<section id="{sid}" class="clip" data-start="{start}" data-duration="{dur}" data-track-index="{len(self.clips) + 1}">'
            f'<div id="{sid}-scene" class="scene {cls}">{inner}</div></section>'
        )

    def sfx(self, name, t, vol=0.6):
        self.sid += 1
        ln = sfx_len(name)
        t = max(0, round(t - 0.02, 2))
        ln = min(ln, round(DUR - t, 2))
        self.audio.append(
            f'<audio id="sx{self.sid}" data-start="{t}" data-duration="{ln}" data-track-index="{self.track}" '
            f'data-volume="{vol}" src="assets/sfx/{name}.ogg"></audio>'
        )
        self.track += 1

    def code(self, js):
        self.js.append(js)

    def render(self, music_points):
        js = "\n".join(self.js)
        js = re.sub(r"§([\d.]+)§", lambda m: str(self.snap(float(m.group(1)))), js)
        auto = json.dumps({"version": 1, "lanes": [{"target": "volume", "points": music_points}]}, separators=(",", ":"))
        return f"""<!doctype html>
<html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=1920, height=1080">
<title>Travel Plataforma - parte {self.n}</title>
<script src="assets/gsap.min.js"></script><script src="assets/audio-data.js"></script>
<style>{COMMON_CSS}</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-width="1920" data-height="1080" data-duration="{DUR:g}">
{chr(10).join(self.clips)}
<audio id="bgm" data-start="0" data-duration="{DUR:g}" data-media-start="{self.off:g}" data-track-index="10" data-volume="0.35" src="assets/music/music.mp3" data-automation='{auto}'></audio>
{chr(10).join(self.audio)}
</div>
<script>
var tl = gsap.timeline({{ paused: true }});
var E = "power3.out";
function show(sel, at, d, y) {{ tl.fromTo(sel, {{ y: y === undefined ? 40 : y, opacity: 0 }}, {{ y: 0, opacity: 1, duration: d || 0.5, ease: E }}, at); }}
function fadeScene(id, at) {{ tl.fromTo(id, {{ opacity: 0 }}, {{ opacity: 1, duration: 0.35, ease: "power2.out" }}, at); }}
{js}
for (var f = 0; f < AUDIO_DATA.totalFrames; f++) {{
  tl.call((function (fr) {{ return function () {{
    gsap.set(".glow", {{ scale: 0.94 + fr.bands[0] * 0.14, opacity: 0.55 + fr.bands[1] * 0.35 }});
  }}; }})(AUDIO_DATA.frames[f]), [], f / AUDIO_DATA.fps);
}}
window.__timelines["main"] = tl;
</script></body></html>
"""

    def write(self, music_points):
        d = os.path.join(HERE, f"parte-{self.n}")
        os.makedirs(os.path.join(d, "assets"), exist_ok=True)
        for sub in ("fonts", "sfx", "music"):
            shutil.copytree(os.path.join(SHARED, sub), os.path.join(d, "assets", sub), dirs_exist_ok=True)
        for f in ("gsap.min.js", "icone.svg", "logo-completa.svg", "logo-completa-escura.svg"):
            shutil.copy(os.path.join(SHARED, f), os.path.join(d, "assets", f))
        # dados de audio reativo do trecho
        import audio_data
        audio_data.write(os.path.join(d, "assets", "audio-data.js"), os.path.join(d, "assets", "music", "music.mp3"), self.off)
        open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(self.render(music_points))


# ---------- blocos reutilizaveis ----------
def sales_shot(left, top, w, ids):
    return f"""<div id="{ids}" class="shot" style="left:{left}px;top:{top}px;width:{w}px;height:430px;padding:30px 34px">
<div style="font-size:22px;color:#5b6370;font-weight:600">Vendas</div>
<div class="serif" style="font-size:36px;margin-top:6px">Família Souza · Cancún</div>
<div class="btn" style="position:relative;margin-top:18px;height:60px;font-size:26px">Registrar venda</div>
<div style="position:relative;margin-top:22px;height:200px;font-size:26px">
<div class="th" style="top:0;height:44px;font-size:20px;color:#5b6370;font-weight:600"><span style="left:0;height:44px">Parcela</span><span style="left:130px;height:44px">Vencimento</span><span style="right:0;height:44px">Valor</span></div>
<div class="tr" style="top:48px;height:50px"><span style="left:0;height:50px">1/3</span><span style="left:130px;height:50px">10/12</span><span style="right:0;height:50px">R$ 4.200</span></div>
<div class="tr" style="top:98px;height:50px"><span style="left:0;height:50px">2/3</span><span style="left:130px;height:50px">10/01</span><span style="right:0;height:50px">R$ 4.200</span></div>
<div class="tr" style="top:148px;height:50px"><span style="left:0;height:50px">3/3</span><span style="left:130px;height:50px">10/02</span><span style="right:0;height:50px">R$ 4.200</span></div>
</div></div>"""


def lite_window(prefix):
    navs = ["Dashboard", "Vendas", "Financeiro", "Importações", "Clientes", "Vendedores", "Comissões", "Relatórios"]
    nav_html = "".join(
        f'<div class="nav{" on" if n == "Vendas" else ""}" style="top:{110 + i * 72}px">{n}</div>' for i, n in enumerate(navs)
    )
    return f"""<div id="{prefix}chip" class="abs" style="left:140px;top:70px;height:78px;padding:0 40px;display:flex;align-items:center;background:#fff;color:#1043a8;font-size:40px;font-weight:800;border-radius:4px">Módulo Travel Lite</div>
<div id="{prefix}win" class="abs" style="left:140px;top:170px;width:1640px;height:820px;background:#f3f4f6;border-radius:4px;overflow:hidden;box-shadow:0 40px 120px rgba(0,0,0,.45)">
<div class="abs" style="left:0;top:0;width:300px;height:820px;background:#fff;border-right:2px solid #e2e6ea"><div class="abs" style="left:36px;top:30px;font-size:38px;font-weight:800;color:#1554d1">Travel Lite</div>{nav_html}</div>
<h2 id="{prefix}ttl" class="abs" style="left:340px;top:36px;margin:0;font-size:52px;font-weight:800;color:#1a1d21">Vendas</h2>
<div id="{prefix}p1" class="panel" style="left:340px"><div class="lbl">Cliente</div>
<div class="abs" style="left:28px;top:110px;width:96px;height:96px;border-radius:4px;background:#e6eeff;color:#1043a8;font-size:38px;font-weight:800;display:flex;align-items:center;justify-content:center">FS</div>
<div class="abs" style="left:28px;top:230px;font-size:40px;font-weight:700;color:#1a1d21">Família Souza</div>
<div class="abs" style="left:28px;top:292px;font-size:30px;color:#5b6370">Destino: Cancún</div></div>
<div id="{prefix}p2" class="panel" style="left:770px"><div class="lbl">Venda</div>
<div id="{prefix}btn" class="btn" style="left:28px;top:100px;width:352px;height:72px;font-size:32px;font-weight:800">Registrar venda</div>
<div id="{prefix}th" class="th" style="left:28px;right:28px;top:210px;height:64px;font-size:24px;color:#5b6370;font-weight:700"><span style="left:0;height:64px">Parcela</span><span style="left:100px;height:64px">Vencimento</span><span style="right:0;height:64px">Valor</span></div>
<div id="{prefix}r1" class="tr" style="left:28px;right:28px;top:274px;height:64px;font-size:28px;color:#1a1d21"><span style="left:0;height:64px">1/3</span><span style="left:100px;height:64px">10/12</span><span style="right:0;height:64px">R$ 4.200</span></div>
<div id="{prefix}r2" class="tr" style="left:28px;right:28px;top:338px;height:64px;font-size:28px;color:#1a1d21"><span style="left:0;height:64px">2/3</span><span style="left:100px;height:64px">10/01</span><span style="right:0;height:64px">R$ 4.200</span></div>
<div id="{prefix}r3" class="tr" style="left:28px;right:28px;top:402px;height:64px;font-size:28px;color:#1a1d21"><span style="left:0;height:64px">3/3</span><span style="left:100px;height:64px">10/02</span><span style="right:0;height:64px">R$ 4.200</span></div>
<div id="{prefix}r4" class="tr" style="left:28px;right:28px;top:486px;height:64px;border-top:2px solid #1a1d21;font-size:30px;font-weight:800;color:#1a1d21"><span style="left:0;height:64px">Total</span><span style="right:0;height:64px">R$ 12.600</span></div></div>
<div id="{prefix}p3" class="panel" style="left:1200px"><div class="lbl">Comissão</div>
<div class="abs" style="left:28px;top:110px;font-size:32px;color:#5b6370">Vendedora</div>
<div class="abs" style="left:28px;top:156px;font-size:44px;font-weight:800;color:#1a1d21">Ana</div>
<div id="{prefix}p3v" class="abs" style="left:28px;top:270px;font-size:64px;font-weight:800;color:#157347">R$ 1.260</div></div></div>
<svg id="{prefix}cur" class="abs" style="left:0;top:0;width:60px;height:60px" viewBox="0 0 24 24"><path d="M4 2 L4 19 L8.6 14.8 L11.6 21.6 L14.2 20.5 L11.2 13.8 L17.5 13.8 Z" fill="#1a1d21" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>"""


def logo_img(left, top, h, dark=False, ident=""):
    src = "logo-completa-escura.svg" if dark else "logo-completa.svg"
    return f'<img id="{ident}" class="abs" src="assets/{src}" style="left:{left}px;top:{top}px;height:{h}px" alt="Travel Plataforma">'


# ====================== PARTE 1 ======================
def parte1():
    p = Part(1, 0)
    cells = [("pago?", 1300, 130), ("confirmar com o cliente", 1180, 260), ("parcela 2 ???", 1420, 420), ("R$ ??", 1260, 560),
             ("ver comissão", 1360, 700), ("vendedor?", 1220, 840)]
    cell_html = "".join(
        f'<div class="abs cell" style="left:{x}px;top:{y}px;background:#fff;border:2px solid #c5ccd6;color:#5b6370;font-size:32px;padding:10px 22px;white-space:nowrap">{t}</div>'
        for t, x, y in cells
    )
    p.scene("s1", 0, 3.4, "deep",
            f"""<div class="abs" style="inset:0;background-image:linear-gradient(#e0e4ea 2px,transparent 2px),linear-gradient(90deg,#e0e4ea 2px,transparent 2px);background-size:240px 72px"></div>{cell_html}
<h1 class="serif abs" style="left:120px;top:330px;font-size:132px;line-height:1.08;width:1100px"><span id="s1a" style="display:block">Sua agência ainda</span><span id="s1b" style="display:block">vive de <span style="color:#1554d1">planilha?</span></span></h1>""")
    p.scene("s2", 3.0, 6.6, "paper",
            f"""<p id="s2e" class="eyebrow" style="left:120px;top:150px">Para agências de viagem</p>
{logo_img(120, 205, 130, ident="s2logo")}
<h2 id="s2h" class="serif abs" style="left:120px;top:420px;width:900px;font-size:74px;line-height:1.1">Transforme sua agência em uma operação mais inteligente.</h2>
<div id="s2frame" class="abs" style="left:1180px;top:110px;width:620px;height:800px;background:#0f2a4a">{ROUTE_SVG}</div>
{sales_shot(960, 600, 540, "s2shot")}""")
    areas = ["CRM / Cliente 360", "Pipeline comercial", "Viagens e operação", "Financeiro", "Equipe", "Portal do cliente"]
    rows = "".join(
        f'<div id="s3r{i}" class="abs" style="left:900px;top:{150 + i * 130}px;width:900px;height:130px;border-top:2px solid rgba(15,42,74,.2);display:flex;align-items:center;gap:40px"><span class="num" style="font-size:44px;width:70px">0{i + 1}</span><span class="serif" style="font-size:52px">{a}</span></div>'
        for i, a in enumerate(areas)
    )
    p.scene("s3", 9.4, 6.2, "paper",
            f"""<p class="eyebrow" style="left:120px;top:190px">O produto</p>
<h2 id="s3h" data-layout-allow-overlap class="serif abs" style="left:120px;top:250px;width:680px;font-size:96px;line-height:1.08">Tudo que a sua agência precisa</h2>{rows}
<div class="abs" style="left:900px;top:930px;width:900px;border-top:2px solid rgba(15,42,74,.2)"></div>""")
    sec = [("Isolamento por agência", "Cada agência opera em seu próprio espaço de dados."),
           ("Controle de acesso por papel", "Permissões para donos, gerentes, agentes e operação."),
           ("Trilha de auditoria", "Ações relevantes ficam registradas para consulta.")]
    srows = "".join(
        f'<div id="s4r{i}" class="abs" style="left:980px;top:{250 + i * 170}px;width:820px;height:170px;border-top:2px solid rgba(255,255,255,.25)"><span class="num" style="position:absolute;left:0;top:34px;font-size:40px;color:#06b6d4">0{i + 1}</span><span class="serif" style="position:absolute;left:80px;top:26px;font-size:46px;color:#fff;width:740px">{t}</span><span style="position:absolute;left:80px;top:96px;font-size:26px;color:#bfe9f2;width:740px">{d}</span></div>'
        for i, (t, d) in enumerate(sec)
    )
    p.scene("s4", 15.0, 5.0, "navy",
            f"""<div id="s4glow" data-layout-allow-overflow class="glow" style="left:1100px;top:-500px"></div>
<div id="s4c"><p class="eyebrow c" style="left:120px;top:290px">Confiança</p>
<h2 id="s4h" class="serif abs" style="left:120px;top:350px;width:760px;font-size:100px;line-height:1.06;color:#fff">Segurança por padrão</h2>{srows}</div>
<h2 id="s4hook" class="serif abs" style="left:0;right:0;top:400px;text-align:center;font-size:132px;color:#fff;line-height:1.1">Mas por onde <span style="color:#06b6d4">começar?</span></h2>""")
    p.code("""
fadeScene("#s2-scene", 3.0);
show("#s1a", 0.3, 0.5); show("#s1b", 0.7, 0.5);
tl.fromTo(".cell", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.12, ease: E }, 0.2);
show("#s2e", 3.6, 0.5); show("#s2logo", §3.7§, 0.6);
show("#s2h", 4.4, 0.6);
tl.fromTo("#s2frame", { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.7, ease: E }, §5.28§);
show("#s2shot", §6.34§, 0.6, 50);
fadeScene("#s3-scene", 9.4);
show("#s3h", 9.8, 0.6);
tl.fromTo(["#s3r0", "#s3r1"], { x: 50, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, stagger: 0.1, ease: E }, §10.54§);
tl.fromTo(["#s3r2", "#s3r3"], { x: 50, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, stagger: 0.1, ease: E }, §11.6§);
tl.fromTo(["#s3r4", "#s3r5"], { x: 50, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, stagger: 0.1, ease: E }, §12.65§);
fadeScene("#s4-scene", 15.0);
show("#s4h", 15.4, 0.6);
tl.fromTo("#s4r0", { x: 50, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: E }, §15.81§);
tl.fromTo("#s4r1", { x: 50, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: E }, §16.34§);
tl.fromTo("#s4r2", { x: 50, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: E }, §16.86§);
tl.to("#s4c", { opacity: 0, y: -30, duration: 0.4, ease: "power2.in" }, 18.0);
tl.set("#s4hook", { opacity: 0 }, 0);
tl.fromTo("#s4hook", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: E }, 18.4);
""")
    p.sfx("drop_001", 3.7, 0.5); p.sfx("impactSoft_medium_001", 3.7, 0.7)
    p.sfx("card-place-1", 6.34, 0.6)
    for t in (10.54, 11.6, 12.65): p.sfx("drop_001", t, 0.55)
    for t in (15.81, 16.34, 16.86): p.sfx("drop_002", t, 0.55)
    p.sfx("impactSoft_medium_001", 18.4, 0.7)
    return p, [{"t": 0, "v": 0.55}, {"t": 3, "v": 0.55}, {"t": 4, "v": 1}]


# ====================== PARTE 2 ======================
def parte2():
    p = Part(2, 20)
    p.scene("s1", 0, 2.4, "navy",
            """<div id="s1glow" data-layout-allow-overflow class="glow" style="left:1100px;top:-500px"></div>
<h2 id="s1a" class="serif abs" style="left:0;right:0;top:400px;text-align:center;font-size:132px;color:#fff;line-height:1.1">Mas por onde <span style="color:#06b6d4">começar?</span></h2>
<h2 id="s1b" class="serif abs" style="left:0;right:0;top:390px;text-align:center;font-size:160px;color:#fff;line-height:1.1">Pelo <span style="color:#06b6d4">Travel Lite.</span></h2>""")
    p.scene("s2", 2.0, 7.6, "navy", lite_window("w"))
    imp = """<p class="eyebrow" style="left:120px;top:250px">Importações</p>
<h2 id="s3h" data-layout-allow-overlap class="serif abs" style="left:120px;top:310px;width:800px;font-size:92px;line-height:1.08">Traga a planilha que você já tem.</h2>
<div id="s3card" class="card" style="left:1000px;top:250px;width:760px;height:540px;box-shadow:0 30px 70px rgba(15,42,74,.18)">
<div id="s3file" class="abs" style="left:40px;top:44px;width:82px;height:104px;background:#1554d1;color:#fff;font-size:24px;font-weight:800;display:flex;align-items:flex-end;justify-content:center;padding-bottom:14px;border-radius:4px">XLSX</div>
<div class="abs" style="left:150px;top:52px;font-size:36px;font-weight:600;color:#1a1d21">clientes-da-agencia.xlsx</div>
<div class="abs" style="left:150px;top:106px;font-size:26px;color:#5b6370">Importação de planilhas</div>
<div class="abs" style="left:40px;top:200px;width:680px;height:18px;background:#e2e6ea;border-radius:2px"></div>
<div id="s3bar" class="abs" style="left:40px;top:200px;width:680px;height:18px;background:#1554d1;border-radius:2px;transform-origin:0 50%"></div>
<div id="s3cnt" class="serif abs" style="left:40px;top:260px;font-size:84px;color:#0f2a4a">0 clientes</div>
<div class="abs" style="left:40px;top:370px;font-size:30px;color:#5b6370">importados</div>
<div id="s3c1" class="abs" style="left:40px;top:440px;padding:10px 26px;border:2px solid #1554d1;color:#1554d1;font-size:28px;font-weight:800;border-radius:4px">CSV</div>
<div id="s3c2" class="abs" style="left:170px;top:440px;padding:10px 26px;border:2px solid #1554d1;color:#1554d1;font-size:28px;font-weight:800;border-radius:4px">XLSX</div></div>"""
    p.scene("s3", 9.4, 5.9, "paper", imp)
    items = ["Dashboard", "Vendas", "Financeiro", "Importações", "Clientes", "Vendedores", "Comissões", "Relatórios"]
    grid = ""
    for i, it in enumerate(items):
        col, row = i // 2, i % 2
        grid += (f'<div id="s4i{i}" class="card" style="left:{120 + col * 420}px;top:{330 + row * 250}px;width:380px;height:220px">'
                 f'<span class="num" style="position:absolute;left:30px;top:26px;font-size:40px">0{i + 1}</span>'
                 f'<span class="serif" style="position:absolute;left:30px;top:120px;font-size:48px">{it}</span></div>')
    p.scene("s4", 15.0, 5.0, "deep",
            f"""<div id="s4c"><p class="eyebrow" style="left:120px;top:150px">No menu do Travel Lite</p>
<h2 id="s4h" class="serif abs" style="left:120px;top:200px;font-size:84px;line-height:1">Tudo no mesmo lugar</h2>{grid}</div>
<div id="s4wipe" class="abs navy" style="left:0;top:0;right:0;bottom:0;overflow:hidden"><div id="s4glow" data-layout-allow-overflow class="glow" style="left:1100px;top:-500px"></div></div>
<h2 id="s4hook" class="serif abs" style="left:0;right:0;top:400px;text-align:center;font-size:150px;color:#fff;line-height:1.1">E no fim do <span style="color:#06b6d4">mês?</span></h2>""")
    p.code("""
tl.to("#s1a", { opacity: 0, y: -40, duration: 0.3, ease: "power2.in" }, 0.6);
tl.fromTo("#s1b", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: E }, 0.85);
fadeScene("#s2-scene", 2.0);
tl.fromTo("#wwin", { y: 200, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: E }, 2.1);
tl.fromTo("#wchip", { y: -30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: E }, 2.5);
tl.fromTo(".nav", { x: -30, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, stagger: 0.05, ease: E }, 2.5);
tl.fromTo("#wttl", { opacity: 0 }, { opacity: 1, duration: 0.4 }, 2.6);
tl.fromTo("#wp1", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: E }, §3.18§);
tl.fromTo("#wp2", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: E }, 3.5);
tl.set(["#wr1", "#wr2", "#wr3", "#wr4", "#wth", "#wp3"], { opacity: 0 }, 0);
tl.fromTo("#wcur", { x: 1500, y: 800, opacity: 0 }, { x: 1085, y: 405, opacity: 1, duration: 0.7, ease: "power2.inOut" }, 3.25);
tl.to("#wcur", { scale: 0.85, duration: 0.07, ease: "power1.in" }, 3.98);
tl.to("#wcur", { scale: 1, duration: 0.12, ease: "power1.out" }, 4.06);
tl.to("#wbtn", { scale: 0.96, duration: 0.07, ease: "power1.in" }, 3.98);
tl.to("#wbtn", { scale: 1, duration: 0.15, ease: "power1.out" }, 4.06);
tl.to("#wcur", { x: 1500, y: 880, opacity: 0, duration: 0.6, ease: "power2.in" }, 4.4);
tl.fromTo("#wth", { opacity: 0 }, { opacity: 1, duration: 0.3 }, 4.5);
tl.fromTo("#wr1", { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, ease: E }, §4.75§);
tl.fromTo("#wr2", { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, ease: E }, §5.28§);
tl.fromTo("#wr3", { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, ease: E }, §5.8§);
tl.fromTo("#wr4", { opacity: 0 }, { opacity: 1, duration: 0.4 }, §6.34§);
tl.fromTo("#wp3", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: E }, §6.86§);
tl.fromTo("#wp3v", { scale: 0.85, transformOrigin: "0% 50%" }, { scale: 1, duration: 0.5, ease: "back.out(1.6)" }, 7.1);
fadeScene("#s3-scene", 9.4);
show("#s3h", 9.8, 0.6);
tl.fromTo("#s3card", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: E }, §10.54§);
tl.fromTo("#s3file", { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(1.6)" }, 11.0);
tl.fromTo("#s3bar", { scaleX: 0 }, { scaleX: 1, duration: 1.3, ease: "power2.inOut" }, §11.6§);
var ic = { n: 0 };
tl.to(ic, { n: 128, duration: 1.3, ease: "power2.inOut", onUpdate: function () { document.getElementById("s3cnt").textContent = Math.round(ic.n) + " clientes"; } }, §11.6§);
tl.fromTo(["#s3c1", "#s3c2"], { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.12, ease: E }, §13.18§);
fadeScene("#s4-scene", 15.0);
tl.set("#s4hook", { opacity: 0 }, 0);
show("#s4h", 15.3, 0.5, 20);
tl.fromTo(["#s4i0", "#s4i1"], { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, stagger: 0.08, ease: E }, §15.81§);
tl.fromTo(["#s4i2", "#s4i3"], { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, stagger: 0.08, ease: E }, §16.34§);
tl.fromTo(["#s4i4", "#s4i5"], { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, stagger: 0.08, ease: E }, §16.86§);
tl.fromTo(["#s4i6", "#s4i7"], { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, stagger: 0.08, ease: E }, §17.38§);
tl.set("#s4wipe", { opacity: 0 }, 0);
tl.to("#s4c", { opacity: 0, duration: 0.1 }, 18.7);
tl.fromTo("#s4wipe", { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "power2.in" }, 18.3);
tl.fromTo("#s4hook", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: E }, 18.5);
""")
    p.sfx("impactSoft_medium_001", 0.85, 0.7)
    p.sfx("card-place-1", 3.18, 0.6)
    p.sfx("click_002", 4.0, 0.8)
    for t in (4.75, 5.28, 5.8): p.sfx("drop_002", t, 0.55)
    p.sfx("chips-stack-1", 6.86, 0.7)
    p.sfx("card-place-1", 10.54, 0.6)
    for t in (15.81, 16.34, 16.86, 17.38): p.sfx("drop_001", t, 0.5)
    p.sfx("impactSoft_medium_001", 18.5, 0.7)
    return p, [{"t": 0, "v": 1}]


# ====================== PARTE 3 ======================
def parte3():
    p = Part(3, 40)
    p.scene("s1", 0, 2.4, "navy",
            """<div id="s1glow" data-layout-allow-overflow class="glow" style="left:1100px;top:-500px"></div>
<h2 id="s1a" class="serif abs" style="left:0;right:0;top:400px;text-align:center;font-size:150px;color:#fff;line-height:1.1">E no fim do <span style="color:#06b6d4">mês?</span></h2>
<h2 id="s1b" class="serif abs" style="left:0;right:0;top:390px;text-align:center;font-size:140px;color:#fff;line-height:1.1">O <span style="color:#06b6d4">dashboard</span> responde.</h2>""")
    bars = ""
    ins = [150, 190, 170, 230, 210, 260, 290]
    outs = [110, 140, 150, 160, 170, 190, 200]
    for i in range(7):
        x = 40 + i * 78
        bars += f'<div class="abs bar" style="left:{x}px;bottom:44px;width:34px;height:{int(ins[i] * 1.7)}px;background:#1554d1;transform-origin:50% 100%"></div>'
        bars += f'<div class="abs bar" style="left:{x + 36}px;bottom:44px;width:34px;height:{int(outs[i] * 1.7)}px;background:#9a6700;transform-origin:50% 100%"></div>'
    rank = [("Ana", "14", "R$ 96.400", "R$ 16.100"), ("Bruno", "11", "R$ 78.200", "R$ 12.900"), ("Carla", "9", "R$ 74.300", "R$ 12.300")]
    rrows = "".join(
        f'<div id="rk{i}" class="tr" style="left:36px;right:36px;top:{168 + i * 84}px;height:84px;font-size:34px"><span style="left:0;height:84px;font-weight:700">{a}</span><span style="left:330px;height:84px">{b}</span><span style="left:560px;height:84px">{c}</span><span style="right:0;height:84px;color:#157347;font-weight:700">{d}</span></div>'
        for i, (a, b, c, d) in enumerate(rank)
    )
    p.scene("s2", 2.0, 6.8, "deep",
            f"""<h2 id="s2t" class="abs" style="left:80px;top:56px;margin:0;font-size:68px;font-weight:800;color:#1a1d21">Dashboard</h2>
<p id="s2sub" class="abs" style="left:80px;top:142px;margin:0;font-size:30px;color:#5b6370">Agência Horizonte</p>
<div id="st1" class="card" style="left:80px;top:210px;width:540px;height:220px"><div class="abs" style="left:36px;top:28px;font-size:32px;color:#5b6370;font-weight:700">Vendido</div><div id="v1" class="abs" style="left:36px;top:88px;font-size:80px;font-weight:800;color:#1554d1">R$ 0</div></div>
<div id="st2" class="card" style="left:660px;top:210px;width:540px;height:220px"><div class="abs" style="left:36px;top:28px;font-size:32px;color:#5b6370;font-weight:700">Margem</div><div id="v2" class="abs" style="left:36px;top:88px;font-size:80px;font-weight:800;color:#157347">R$ 0</div></div>
<div id="chart" class="card" style="left:1240px;top:210px;width:600px;height:720px"><div class="abs" style="left:36px;top:28px;font-size:32px;font-weight:800;color:#1a1d21">Entradas × Saídas</div><div class="abs" style="left:36px;top:84px;font-size:26px;color:#5b6370"><span style="color:#1554d1">■</span> Entradas</div><div class="abs" style="left:230px;top:84px;font-size:26px;color:#5b6370"><span style="color:#9a6700">■</span> Saídas</div>{bars}</div>
<div id="rank" class="card" style="left:80px;top:470px;width:1120px;height:460px"><div class="abs" style="left:36px;top:28px;font-size:32px;font-weight:800;color:#1a1d21">Ranking de vendedores</div>
<div class="th" style="left:36px;right:36px;top:84px;height:84px;font-size:26px;color:#5b6370;font-weight:700"><span style="left:0;height:84px">Vendedor</span><span style="left:330px;height:84px">Vendas</span><span style="left:560px;height:84px">Vendido</span><span style="right:0;height:84px">Margem</span></div>{rrows}</div>""")
    p.scene("s3", 8.6, 4.8, "paper",
            """<h2 id="s3a" class="serif abs" style="left:120px;top:330px;width:900px;font-size:104px;line-height:1.08">Funciona no navegador.</h2>
<h2 id="s3b" class="serif abs" style="left:120px;top:560px;width:900px;font-size:104px;line-height:1.08;color:#1554d1">Instala no celular.</h2>
<div id="phone" class="abs" style="left:1180px;top:110px;width:440px;height:840px;background:#0f2a4a;border-radius:20px;padding:16px">
<div class="abs" style="left:16px;top:16px;right:16px;bottom:16px;background:#f3f4f6;border-radius:8px;overflow:hidden">
<div class="abs" style="left:28px;top:34px;font-size:40px;font-weight:800;color:#1a1d21">Dashboard</div>
<div id="m1" class="card" style="left:24px;top:110px;width:344px;height:150px"><div class="abs" style="left:22px;top:18px;font-size:24px;color:#5b6370;font-weight:700">Vendido</div><div class="abs" style="left:22px;top:62px;font-size:48px;font-weight:800;color:#1554d1">R$ 248.900</div></div>
<div id="m2" class="card" style="left:24px;top:280px;width:344px;height:150px"><div class="abs" style="left:22px;top:18px;font-size:24px;color:#5b6370;font-weight:700">Margem</div><div class="abs" style="left:22px;top:62px;font-size:48px;font-weight:800;color:#157347">R$ 41.300</div></div>
<div id="m3" class="card" style="left:24px;top:450px;width:344px;height:280px"><div class="abs" style="left:22px;top:18px;font-size:24px;color:#5b6370;font-weight:700">Entradas × Saídas</div>
<div class="abs mb" style="left:30px;bottom:30px;width:26px;height:120px;background:#1554d1;transform-origin:50% 100%"></div><div class="abs mb" style="left:60px;bottom:30px;width:26px;height:80px;background:#9a6700;transform-origin:50% 100%"></div>
<div class="abs mb" style="left:110px;bottom:30px;width:26px;height:150px;background:#1554d1;transform-origin:50% 100%"></div><div class="abs mb" style="left:140px;bottom:30px;width:26px;height:100px;background:#9a6700;transform-origin:50% 100%"></div>
<div class="abs mb" style="left:190px;bottom:30px;width:26px;height:190px;background:#1554d1;transform-origin:50% 100%"></div><div class="abs mb" style="left:220px;bottom:30px;width:26px;height:120px;background:#9a6700;transform-origin:50% 100%"></div></div>
</div></div>""")
    p.scene("s4", 13.2, 4.2, "navy",
            """<div id="s4glow" data-layout-allow-overflow class="glow" style="left:-300px;top:400px"></div>
<h2 id="s4a" class="serif abs" style="left:0;right:0;top:320px;text-align:center;font-size:118px;color:#fff;line-height:1.1">Comece pelo Travel Lite.</h2>
<h2 id="s4b" class="serif abs" style="left:0;right:0;top:520px;text-align:center;font-size:118px;color:#06b6d4;line-height:1.1">Cresça na Travel Plataforma.</h2>""")
    p.scene("s5", 17.0, 3.0, "paper",
            f"""{logo_img(465, 330, 190, ident="s5logo")}
<div id="s5cta" class="btn" style="left:700px;top:700px;width:520px;height:100px;font-size:44px">Solicitar acesso</div>""")
    p.code("""
tl.to("#s1a", { opacity: 0, y: -40, duration: 0.3, ease: "power2.in" }, 0.6);
tl.fromTo("#s1b", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: E }, 0.85);
fadeScene("#s2-scene", 2.0);
show(["#s2t", "#s2sub"], 2.3, 0.4, 20);
tl.set(["#st1", "#st2", "#chart", "#rank"], { opacity: 0 }, 0);
tl.fromTo("#st1", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: E }, §3.7§);
tl.fromTo("#st2", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: E }, 3.92);
var cnt = { a: 0, b: 0 };
function brl(n) { return "R$ " + Math.round(n).toString().replace(/\\B(?=(\\d{3})+(?!\\d))/g, "."); }
tl.to(cnt, { a: 248900, duration: 0.9, ease: "power2.out", onUpdate: function () { document.getElementById("v1").textContent = brl(cnt.a); } }, 3.8);
tl.to(cnt, { b: 41300, duration: 0.9, ease: "power2.out", onUpdate: function () { document.getElementById("v2").textContent = brl(cnt.b); } }, 4.0);
tl.fromTo("#chart", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: E }, §4.75§);
tl.fromTo("#chart .bar", { scaleY: 0 }, { scaleY: 1, duration: 0.6, stagger: 0.04, ease: E }, 4.9);
tl.fromTo("#rank", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: E }, §5.8§);
tl.fromTo(["#rk0", "#rk1", "#rk2"], { opacity: 0, x: 30 }, { opacity: 1, x: 0, duration: 0.35, stagger: 0.18, ease: E }, 6.05);
fadeScene("#s3-scene", 8.6);
show("#s3a", 9.0, 0.6);
show("#s3b", §9.8§, 0.6);
tl.fromTo("#phone", { y: 120, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: E }, 8.9);
tl.set(["#m1", "#m2", "#m3"], { opacity: 0 }, 0);
tl.fromTo("#m1", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: E }, §9.5§);
tl.fromTo("#m2", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: E }, §10.01§);
tl.fromTo("#m3", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: E }, §10.54§);
tl.fromTo(".mb", { scaleY: 0 }, { scaleY: 1, duration: 0.5, stagger: 0.06, ease: E }, 10.7);
fadeScene("#s4-scene", 13.2);
show("#s4a", 13.6, 0.6);
show("#s4b", §14.76§, 0.6);
fadeScene("#s5-scene", 17.0);
show("#s5logo", 17.3, 0.6);
tl.fromTo("#s5cta", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: E }, §18.44§);
""")
    p.sfx("impactSoft_medium_001", 0.85, 0.7)
    p.sfx("card-place-1", 3.7, 0.6); p.sfx("drop_001", 4.75, 0.55); p.sfx("card-place-1", 5.8, 0.6)
    p.sfx("drop_001", 9.8, 0.5)
    for t in (9.5, 10.01, 10.54): p.sfx("drop_002", t, 0.5)
    p.sfx("impactSoft_medium_001", 13.6, 0.7); p.sfx("impactSoft_medium_001", 14.76, 0.7)
    p.sfx("drop_001", 17.3, 0.6); p.sfx("impactBell_heavy_000", 18.44, 0.7)
    return p, [{"t": 0, "v": 1}, {"t": 17.8, "v": 1}, {"t": 20, "v": 0}]


if __name__ == "__main__":
    import sys
    sys.path.insert(0, HERE)
    for fn in (parte1, parte2, parte3):
        part, pts = fn()
        part.write(pts)
        print("ok parte", part.n)
