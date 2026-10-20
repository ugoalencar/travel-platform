"""Serie 2 revisada (4 partes de 30 s): diferenciais do Travel Plataforma.

Area segura (1920x1080): x 100..1820, y 80..1000. Fundos ocupam o quadro inteiro;
textos, logos e telas ficam dentro da area segura em todas as entradas/saidas.

Uso: python build.py   (a partir de brag-output/serie-2-revisada)
"""
import json, os, re, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SHARED = os.path.join(HERE, "shared")
sys.path.insert(0, HERE)
CUES = os.path.expanduser(
    "~/.claude/skills/brag/assets/music/cues/happy-beats-business-moves-vol-1-by-ende-dot-app.music-cues.json"
)
BEATS = [b["time"] for b in json.load(open(CUES))["beats"]]
DUR = 30.0


def sfx_len(name):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", os.path.join(SHARED, "sfx", name + ".ogg")],
        capture_output=True, text=True,
    ).stdout.strip()
    return max(0.05, round(float(out), 2))


CSS = """
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
.eyebrow{position:absolute;margin:0;font-weight:600;font-size:30px;line-height:1;letter-spacing:.18em;text-transform:uppercase;color:#1554d1}
.eyebrow.c{color:#06b6d4}
.glow{position:absolute;width:1200px;height:1200px;border-radius:50%;background:radial-gradient(circle,rgba(6,182,212,.45) 0%,rgba(6,182,212,0) 65%)}
.card{position:absolute;background:#fff;border:2px solid #e2e6ea;border-radius:4px}
.btn{position:absolute;background:#1554d1;color:#fff;font-weight:600;border-radius:4px;display:flex;align-items:center;justify-content:center}
.num{font-family:'Fraunces',serif;color:#1554d1;margin:0}
.wm{position:absolute;left:100px;top:80px;height:60px}
.tr span,.th span{position:absolute;display:flex;align-items:center}
.tr{position:absolute;border-top:2px solid #e2e6ea}
.th{position:absolute}
"""


class Part:
    def __init__(self, n, off):
        self.n, self.off = n, off
        self.beats = [b - off for b in BEATS if off - 0.5 <= b <= off + DUR + 0.5]
        self.clips, self.js, self.audio = [], [], []
        self.track, self.sid = 11, 0

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
<style>{CSS}</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-width="1920" data-height="1080" data-duration="{DUR:g}">
{chr(10).join(self.clips)}
<audio id="bgm" data-start="0" data-duration="{DUR:g}" data-media-start="{self.off:g}" data-track-index="10" data-volume="0.33" src="assets/music/music.mp3" data-automation='{auto}'></audio>
{chr(10).join(self.audio)}
</div>
<script>
var tl = gsap.timeline({{ paused: true }});
var E = "power3.out";
function show(sel, at, d, y) {{ tl.fromTo(sel, {{ y: y === undefined ? 40 : y, opacity: 0 }}, {{ y: 0, opacity: 1, duration: d || 0.7, ease: E }}, at); }}
function slide(sel, at, d, x) {{ tl.fromTo(sel, {{ x: x === undefined ? 50 : x, opacity: 0 }}, {{ x: 0, opacity: 1, duration: d || 0.6, ease: E }}, at); }}
/* corte por wipe horizontal: a cena nova revela da direita para a esquerda, sem dissolver (sem tela cinza) */
function wipe(id, at, d) {{ tl.fromTo(id, {{ clipPath: "inset(0 0 0 100%)" }}, {{ clipPath: "inset(0 0 0 0%)", duration: d || 0.8, ease: "power3.inOut" }}, at); }}
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
        import audio_data30
        audio_data30.write(os.path.join(d, "assets", "audio-data.js"), os.path.join(d, "assets", "music", "music.mp3"), self.off)
        open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(self.render(music_points))


def logo(left, top, h, dark=False, ident="", cls="abs"):
    src = "logo-completa-escura.svg" if dark else "logo-completa.svg"
    idattr = f' id="{ident}"' if ident else ""
    return f'<img{idattr} class="{cls}" src="assets/{src}" style="left:{left}px;top:{top}px;height:{h}px" alt="Travel Plataforma">'


def glow(ident):
    return f'<div id="{ident}" data-layout-allow-overflow class="glow" style="left:1100px;top:-500px"></div>'


# ---------- abertura/ganchos ----------
def hook_scene(p, sid, start, dur, hook_html, eyebrow, title_html):
    """Abertura navy da parte: repete o gancho da anterior e troca por sobreposicao (sem tela vazia)."""
    p.scene(sid, start, dur, "navy",
            glow(sid + "glow")
            + logo(100, 80, 60, dark=True)
            + f'<h2 id="{sid}a" class="serif abs" style="left:160px;right:160px;top:420px;text-align:center;font-size:100px;color:#fff;line-height:1.12;text-wrap:balance">{hook_html}</h2>'
            + f'<div id="{sid}u" class="abs" style="left:760px;top:580px;width:400px;height:6px;background:#06b6d4"></div>'
            + f'<p id="{sid}e" class="eyebrow c" style="left:160px;right:160px;top:330px;text-align:center">{eyebrow}</p>'
            + f'<h2 id="{sid}b" class="serif abs" style="left:160px;right:160px;top:400px;text-align:center;font-size:104px;color:#fff;line-height:1.14;text-wrap:balance">{title_html}</h2>')


def hook_js(sid, swap_at):
    # gancho antigo sai enquanto o novo entra (0.2 s de sobreposicao)
    return f"""
tl.fromTo("#{sid}a", {{ scale: 1 }}, {{ scale: 1.03, duration: {swap_at}, ease: "none" }}, 0);
tl.to(["#{sid}a", "#{sid}u"], {{ opacity: 0, y: -40, duration: 0.35, ease: "power2.in" }}, {swap_at});
show("#{sid}e", {swap_at + 0.3}, 0.7, 24);
show("#{sid}b", {swap_at + 0.36}, 0.9, 40);
"""


def end_hook(p, sid, start, dur, html):
    p.scene(sid, start, dur, "navy",
            glow(sid + "glow") + logo(100, 80, 60, dark=True)
            + f'<h2 id="{sid}h" class="serif abs" style="left:160px;right:160px;top:420px;text-align:center;font-size:100px;color:#fff;line-height:1.12;text-wrap:balance">{html}</h2>'
            + f'<div id="{sid}u" class="abs" style="left:760px;top:580px;width:400px;height:6px;background:#06b6d4"></div>')


# ====================== PARTE 1 : VISAO ======================
def parte1():
    p = Part(1, 0)
    rows = [("Cliente", "confirmar com o cliente"), ("Parcela 2", "???"), ("Pago?", "?"), ("Valor", "R$ ??"), ("Comissão", "ver com a vendedora"), ("Vendedor", "?")]
    srows = "".join(
        f'<div id="x{i}" class="abs" style="left:0;top:{80 + i * 88}px;width:720px;height:88px;border-top:2px solid #c5ccd6;display:flex;align-items:center">'
        f'<span style="width:60px;font-size:26px;color:#6b7280;text-align:center">{i + 1}</span>'
        f'<span style="width:230px;font-size:32px;color:#1a1d21;font-weight:600;padding-left:20px;border-left:2px solid #c5ccd6;height:88px;display:flex;align-items:center">{a}</span>'
        f'<span style="flex:1;font-size:34px;color:#8a4b00;padding-left:20px;border-left:2px solid #c5ccd6;height:88px;display:flex;align-items:center">{b}</span></div>'
        for i, (a, b) in enumerate(rows))
    sheet = ('<div id="sheet" class="abs" style="left:1100px;top:230px;width:720px;height:620px;background:#fff;border:2px solid #c5ccd6;border-radius:4px;box-shadow:0 24px 60px rgba(15,42,74,.12)">'
             '<div class="abs" style="left:0;top:0;width:720px;height:80px;background:#e9edf2;border-bottom:2px solid #c5ccd6"><span class="abs" style="left:60px;top:22px;font-size:28px;color:#5b6370;font-weight:700;padding-left:20px">A</span><span class="abs" style="left:310px;top:22px;font-size:28px;color:#5b6370;font-weight:700;padding-left:20px">B</span></div>'
             f'{srows}</div>')
    p.scene("s1", 0, 5.4, "deep",
            f"""{logo(100, 80, 60, ident="s1logo")}
<h1 class="serif abs" style="left:100px;top:300px;font-size:100px;line-height:1.16;width:940px"><span id="s1a" style="display:block">Sua agência ainda</span><span id="s1b" style="display:block">vive de <span style="color:#1554d1">planilha?</span></span></h1>
<p id="s1c" class="abs" style="left:100px;top:600px;margin:0;font-size:38px;line-height:1.35;color:#5b6370;width:900px">Valores, parcelas e comissões espalhados em abas e mensagens.</p>
{sheet}""")
    p.scene("s2", 4.8, 7.4, "paper",
            f"""<p id="s2e" class="eyebrow" style="left:100px;top:190px">Para agências de viagem</p>
{logo(100, 250, 150, ident="s2logo")}
<h2 id="s2h" class="serif abs" style="left:100px;top:470px;width:880px;font-size:66px;line-height:1.14">Um único produto para o time comercial, operacional, financeiro — e para o seu cliente.</h2>
<div id="s2frame" class="abs" style="left:1100px;top:120px;width:720px;height:840px;background:#0f2a4a;overflow:hidden">{ROUTE_SVG}</div>""")
    pillars = [("01", "Pipeline comercial", "Do primeiro contato à venda, com etapas configuráveis por agência."),
               ("02", "App do cliente", "Seus clientes acompanham viagens, documentos e ofertas direto do celular."),
               ("03", "Equipe e acessos", "Papéis, permissões e convites para sua equipe comercial e operacional.")]
    cols = "".join(
        f'<div id="s3c{i}" class="abs" style="left:{100 + i * 600}px;top:470px;width:520px;height:480px;border-top:3px solid #1554d1;padding-top:30px">'
        f'<span class="num" style="font-size:48px">{n}</span>'
        f'<div class="serif" style="font-size:58px;line-height:1.08;margin-top:14px">{t}</div>'
        f'<div style="font-size:34px;line-height:1.4;color:#5b6370;margin-top:22px">{d}</div></div>'
        for i, (n, t, d) in enumerate(pillars))
    p.scene("s3", 11.6, 13.4, "paper",
            f"""{logo(100, 80, 60)}<p class="eyebrow" style="left:100px;top:190px">No dia a dia</p>
<h2 id="s3h" class="serif abs" style="left:100px;top:245px;width:1400px;font-size:76px;line-height:1.1">O que sustenta a operação da sua agência</h2>{cols}""")
    p.scene("s4", 24.4, 3.4, "deep",
            f"""{logo(100, 80, 60)}<h2 id="s4h" class="serif abs" style="left:100px;top:380px;font-size:100px;line-height:1.05">Financeiro completo</h2>
<p id="s4d" class="abs" style="left:100px;top:540px;width:1300px;margin:0;font-size:42px;line-height:1.35;color:#5b6370">Contas a receber, a pagar, fluxo de caixa e margem em tempo real.</p>""")
    end_hook(p, "s5", 27.4, 2.6, 'Tudo começa no <span style="color:#06b6d4">primeiro contato.</span>')
    p.code("""
tl.fromTo("#s1logo", { opacity: 0 }, { opacity: 1, duration: 0.5 }, 0.05);
show("#s1a", 0.15, 0.7); show("#s1b", 0.5, 0.7); show("#s1c", 1.2, 0.7, 20);
tl.fromTo("#sheet", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: E }, 0.25);
tl.fromTo("[id^=x]", { opacity: 0, x: 30 }, { opacity: 1, x: 0, duration: 0.45, stagger: 0.18, ease: E }, 0.7);
wipe("#s2-scene", 4.8);
show("#s2e", 5.1, 0.7, 20); show("#s2logo", 5.3, 0.8);
show("#s2h", 5.9, 0.9);
tl.fromTo("#s2frame", { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.9, ease: E }, §6.9§);
wipe("#s3-scene", 11.6);
show("#s3h", 11.9, 0.8);
tl.fromTo("#s3c0", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: E }, §13.5§);
tl.fromTo("#s3c1", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: E }, §17.0§);
tl.fromTo("#s3c2", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: E }, §20.5§);
wipe("#s4-scene", 24.4);
show("#s4h", 24.7, 0.8); show("#s4d", 25.3, 0.8);
wipe("#s5-scene", 27.4);
show("#s5h", 27.7, 0.9);
tl.fromTo("#s5u", { scaleX: 0 }, { scaleX: 1, duration: 0.9, ease: E }, 28.5);
""")
    p.sfx("drop_001", 0.5, 0.5)
    for t in (1.2, 1.6, 2.0): p.sfx("drop_002", t, 0.4)
    p.sfx("impactSoft_medium_001", 6.0, 0.7); p.sfx("card-place-1", 7.5, 0.6)
    for t in (13.5, 17.0, 20.5): p.sfx("card-place-1", t, 0.6)
    p.sfx("drop_002", 24.7, 0.5); p.sfx("impactSoft_medium_001", 27.7, 0.7)
    return p, [{"t": 0, "v": 0.7}, {"t": 4.8, "v": 0.7}, {"t": 6.6, "v": 1}]


ROUTE_SVG = """<svg data-layout-allow-overflow viewBox="0 0 400 470" preserveAspectRatio="xMidYMid slice" width="100%" height="100%"><rect width="400" height="470" fill="#0f2a4a"/><g fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="1.5"><ellipse cx="300" cy="140" rx="40" ry="28"/><ellipse cx="300" cy="140" rx="90" ry="62"/><ellipse cx="300" cy="140" rx="150" ry="104"/><ellipse cx="300" cy="140" rx="215" ry="148"/><ellipse cx="300" cy="140" rx="285" ry="196"/><ellipse cx="80" cy="400" rx="60" ry="40"/><ellipse cx="80" cy="400" rx="125" ry="84"/><ellipse cx="80" cy="400" rx="200" ry="134"/></g><path d="M70 400 C 140 300, 90 230, 190 195 S 330 160, 305 138" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="2 12" stroke-linecap="round"/><circle cx="70" cy="400" r="9" fill="#fff"/><circle cx="305" cy="138" r="11" fill="#06b6d4"/><circle cx="305" cy="138" r="22" fill="none" stroke="#06b6d4" stroke-opacity=".5" stroke-width="2"/></svg>"""


# ====================== PARTE 2 : PIPELINE ======================
STAGES = ["Prospecção", "Interesse", "Orçamento", "Proposta enviada", "Aguardando cliente", "Negociação", "Ganho"]
STAGE_DOT = ["#6b7280", "#1554d1", "#9a6700", "#1554d1", "#9a6700", "#7c3aed", "#157347"]
COL_STEP, COL_W, BOARD_PAD = 572, 548, 14
CARDS = [  # id, nome, destino, valor, coluna, linha
    ("k0", "Carlos M.", "Gramado", "R$ 6.800", 0, 0), ("k1", "Helena R.", "Lisboa", "R$ 14.200", 0, 1),
    ("k2", "Grupo Lima", "Maragogi", "R$ 38.000", 1, 0),
    ("hero", "Família Souza", "Cancún", "R$ 12.600", 2, 0), ("k3", "Paulo T.", "Orlando", "R$ 21.500", 2, 1),
    ("k4", "Júlia A.", "Bariloche", "R$ 9.300", 3, 0),
    ("k5", "Renata C.", "Salvador", "R$ 7.400", 5, 0),
    ("k6", "Marcos S.", "Foz do Iguaçu", "R$ 5.900", 6, 0),
]
VP_X, VP_Y, VP_W, VP_H = 100, 370, 1720, 590   # viewport do quadro (area segura)
CARD_H, CARD_GAP, HEAD_H = 200, 18, 80


def card_xy(col, row):
    return BOARD_PAD + col * COL_STEP + 16, HEAD_H + 16 + row * (CARD_H + CARD_GAP)


def parte2():
    p = Part(2, 30)
    hook_scene(p, "s1", 0, 5.0, 'Tudo começa no <span style="color:#06b6d4">primeiro contato.</span>', "Pipeline comercial", "Do primeiro contato à venda.")
    rail = "".join(
        f'<div id="rl{i}" style="display:flex;align-items:center;gap:12px;font-size:28px;font-weight:600;color:#6b7280"><span style="display:inline-block;width:16px;height:16px;background:{STAGE_DOT[i]}"></span>{n}</div>'
        for i, n in enumerate(STAGES))
    cols_html = "".join(
        f'<div id="col{i}" class="abs" style="left:{BOARD_PAD + i * COL_STEP}px;top:0;width:{COL_W}px;height:{VP_H - 40}px;background:#fff;border:2px solid #e2e6ea;border-radius:4px">'
        f'<div id="colh{i}" class="abs" style="left:0;top:0;right:0;height:{HEAD_H}px;border-bottom:2px solid #e2e6ea;padding:0 22px;display:flex;align-items:center;font-size:34px;font-weight:800;color:#1a1d21"><span style="display:inline-block;width:18px;height:18px;background:{STAGE_DOT[i]};margin-right:14px"></span>{n}</div></div>'
        for i, n in enumerate(STAGES))
    cards_html = ""
    for cid, nm, dest, val, col, row in CARDS:
        x, y = card_xy(col, row)
        cards_html += (f'<div id="{cid}" class="abs kcard" style="left:{x}px;top:{y}px;width:{COL_W - 32}px;height:{CARD_H}px;background:#fff;border:2px solid #cfd6df;border-radius:4px;padding:22px 26px">'
                       f'<div style="font-size:38px;font-weight:800;color:#1a1d21">{nm}</div><div style="font-size:30px;color:#5b6370;margin-top:8px">{dest}</div><div style="font-size:34px;font-weight:700;color:#1554d1;margin-top:16px">{val}</div></div>')
    hx, hy = card_xy(2, 0)
    cur_x, cur_y = hx + 340, hy + 120
    p.scene("s2", 4.6, 17.4, "deep",
            f"""{logo(100, 80, 60)}
<h2 id="s2t" class="serif abs" style="left:100px;top:170px;font-size:72px;line-height:1">Pipeline</h2>
<div id="s2sel" class="abs" style="left:100px;top:262px;font-size:30px;color:#5b6370">Pipeline de vendas</div>
<div id="s2cap" class="serif abs" style="left:900px;right:100px;top:190px;text-align:right;font-size:44px;color:#0f2a4a;height:60px">Arraste o cartão entre as etapas.</div>
<div id="wonbadge" class="abs" style="right:100px;top:182px;padding:12px 28px;background:#157347;color:#fff;font-size:34px;font-weight:800;border-radius:4px">Família Souza · Ganho</div>
<div id="rail" class="abs" style="left:100px;top:300px;width:1720px;height:50px;display:flex;justify-content:space-between;align-items:center">{rail}</div>
<div id="vp" class="abs" style="left:{VP_X}px;top:{VP_Y}px;width:{VP_W}px;height:{VP_H}px;overflow:hidden;background:#f3f4f6">
<div id="board" class="abs" style="left:0;top:0;width:{BOARD_PAD * 2 + 7 * COL_STEP}px;height:{VP_H}px">{cols_html}{cards_html}
<svg id="cur2" class="abs" style="left:{cur_x}px;top:{cur_y}px;width:72px;height:72px" viewBox="0 0 24 24"><path d="M4 2 L4 19 L8.6 14.8 L11.6 21.6 L14.2 20.5 L11.2 13.8 L17.5 13.8 Z" fill="#1a1d21" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg></div></div>""")
    chips = [("Prospecção", "Azul", "#1554d1"), ("Proposta", "Amarelo", "#9a6700"), ("Fechado", "Verde", "#157347")]
    chips_html = "".join(
        f'<div id="ch{i}" class="abs" style="left:{40 + i * 250}px;top:330px;width:230px;height:180px;border:2px solid #e2e6ea;border-radius:4px;padding:22px 24px"><div style="width:24px;height:24px;background:{c}"></div><div style="font-size:34px;font-weight:800;color:#1a1d21;margin-top:16px">{n}</div><div style="font-size:28px;color:#5b6370;margin-top:6px">{cor}</div></div>'
        for i, (n, cor, c) in enumerate(chips))
    p.scene("s3", 21.2, 6.0, "paper",
            f"""{logo(100, 80, 60)}<p class="eyebrow" style="left:100px;top:290px">Pipeline</p>
<h2 id="s3h" class="serif abs" style="left:100px;top:345px;width:760px;font-size:88px;line-height:1.1">Etapas configuráveis por agência.</h2>
<div id="s3card" class="card" style="left:1000px;top:230px;width:820px;height:600px;box-shadow:0 30px 70px rgba(15,42,74,.16)">
<div class="abs" style="left:40px;top:36px;font-size:28px;color:#5b6370;font-weight:600">Novo pipeline</div>
<div class="abs" style="left:40px;top:84px;width:740px;height:84px;border:2px solid #1554d1;border-radius:4px;padding:20px 24px;font-size:38px;color:#1a1d21"><span id="typed"></span></div>
<div class="abs" style="left:40px;top:260px;font-size:28px;color:#5b6370;font-weight:600">Etapas</div>{chips_html}
<div class="abs" style="left:40px;top:540px;font-size:28px;color:#5b6370">Cada etapa tem nome e cor.</div></div>""")
    end_hook(p, "s4", 26.8, 3.2, 'E depois que o cliente <span style="color:#06b6d4">diz sim?</span>')
    s = COL_STEP
    p.code(hook_js("s1", 1.0) + f"""
wipe("#s2-scene", 4.6);
show(["#s2t", "#s2sel"], 4.9, 0.6, 20);
tl.fromTo("#rail", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.6 }}, 5.2);
tl.fromTo("#vp", {{ opacity: 0, y: 40 }}, {{ opacity: 1, y: 0, duration: 0.7, ease: E }}, 5.5);
tl.fromTo(".kcard", {{ opacity: 0, y: 24 }}, {{ opacity: 1, y: 0, duration: 0.5, stagger: 0.14, ease: E }}, 7.2);
show("#s2cap", 8.4, 0.7, 16);
tl.set("#wonbadge", {{ opacity: 0 }}, 0);
function railTo(i) {{ tl.to("[id^=rl]", {{ color: "#6b7280", fontWeight: 600, duration: 0.2 }}, i.t - 0.01); tl.to("#rl" + i.n, {{ color: "#1554d1", fontWeight: 800, duration: 0.3 }}, i.t); }}
railTo({{ n: 2, t: 7.9 }});
// camera 1: mostra colunas 1-3
tl.to("#board", {{ x: -{s}, duration: 0.9, ease: "power2.inOut" }}, 9.0);
tl.fromTo("#cur2", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.4 }}, 9.6);
tl.to("#hero", {{ scale: 1.04, borderColor: "#1554d1", duration: 0.2 }}, §10.2§);
tl.to(["#hero", "#cur2"], {{ x: "+={s}", y: "+=218", duration: 1.1, ease: "power2.inOut" }}, §10.2§);
tl.to("#hero", {{ scale: 1, duration: 0.2 }}, §11.4§);
railTo({{ n: 3, t: 11.5 }});
// camera 2: colunas 3-5
tl.to("#board", {{ x: -{3 * s}, duration: 1.0, ease: "power2.inOut" }}, 12.6);
tl.to("#hero", {{ scale: 1.04, duration: 0.2 }}, §13.8§);
tl.to(["#hero", "#cur2"], {{ x: "+={2 * s}", duration: 1.4, ease: "power2.inOut" }}, §13.8§);
tl.to("#hero", {{ scale: 1, duration: 0.2 }}, §15.4§);
railTo({{ n: 5, t: 15.5 }});
// camera 3: colunas 4-6
tl.to("#board", {{ x: -{4 * s}, duration: 1.0, ease: "power2.inOut" }}, 16.6);
tl.to("#hero", {{ scale: 1.04, duration: 0.2 }}, §17.8§);
tl.to(["#hero", "#cur2"], {{ x: "+={s}", duration: 1.1, ease: "power2.inOut" }}, §17.8§);
tl.to("#hero", {{ scale: 1, borderColor: "#157347", duration: 0.3 }}, §19.0§);
tl.to("#colh6", {{ backgroundColor: "#e5f4ec", duration: 0.5 }}, §19.0§);
railTo({{ n: 6, t: 19.1 }});
tl.to("#cur2", {{ opacity: 0, duration: 0.5 }}, 19.6);
tl.to("#s2cap", {{ opacity: 0, duration: 0.4 }}, 19.3);
tl.fromTo("#wonbadge", {{ opacity: 0, y: -16 }}, {{ opacity: 1, y: 0, duration: 0.6, ease: E }}, 19.7);
wipe("#s3-scene", 21.2);
show("#s3h", 21.5, 0.9);
tl.fromTo("#s3card", {{ y: 50, opacity: 0 }}, {{ y: 0, opacity: 1, duration: 0.8, ease: E }}, §22.5§);
var tx = {{ n: 0 }}, name2 = "Pacotes internacionais";
tl.to(tx, {{ n: name2.length, duration: 1.5, ease: "none", onUpdate: function () {{ document.getElementById("typed").textContent = name2.slice(0, Math.round(tx.n)); }} }}, §23.5§);
tl.fromTo("#ch0", {{ y: 30, opacity: 0 }}, {{ y: 0, opacity: 1, duration: 0.6, ease: E }}, §24.5§);
tl.fromTo("#ch1", {{ y: 30, opacity: 0 }}, {{ y: 0, opacity: 1, duration: 0.6, ease: E }}, §25.0§);
tl.fromTo("#ch2", {{ y: 30, opacity: 0 }}, {{ y: 0, opacity: 1, duration: 0.6, ease: E }}, §25.5§);
wipe("#s4-scene", 26.8);
show("#s4h", 27.1, 0.9);
tl.fromTo("#s4u", {{ scaleX: 0 }}, {{ scaleX: 1, duration: 0.9, ease: E }}, 28.0);
""")
    p.sfx("impactSoft_medium_001", 1.4, 0.6)
    p.sfx("drop_001", 5.5, 0.5); p.sfx("drop_002", 7.2, 0.4)
    for t in (10.2, 13.8, 17.8): p.sfx("click_002", t, 0.8)
    for t in (11.4, 15.4): p.sfx("card-place-1", t, 0.5)
    p.sfx("chips-stack-1", 19.0, 0.7)
    p.sfx("card-place-1", 22.5, 0.6)
    for t in (24.5, 25.0, 25.5): p.sfx("drop_001", t, 0.5)
    p.sfx("impactSoft_medium_001", 27.1, 0.7)
    return p, [{"t": 0, "v": 1}]


# ====================== PARTE 3 : APP DO CLIENTE ======================
def tiles(s):
    return (f'<div class="abs" style="left:0;top:0;width:{158*s}px;height:{104*s}px;background:#fff;border:2px solid #dbeafe;border-radius:{10*s}px"><div class="abs" style="left:{14*s}px;top:{12*s}px;font-size:{18*s}px;color:#5b6370;font-weight:700">Reservas ativas</div><div class="abs" style="left:{14*s}px;top:{42*s}px;font-size:{48*s}px;font-weight:800;color:#1554d1">1</div></div>'
            f'<div class="abs" style="left:{174*s}px;top:0;width:{158*s}px;height:{104*s}px;background:#fff;border:2px solid #dbeafe;border-radius:{10*s}px"><div class="abs" style="left:{14*s}px;top:{12*s}px;font-size:{18*s}px;color:#5b6370;font-weight:700">Propostas</div><div class="abs" style="left:{14*s}px;top:{42*s}px;font-size:{48*s}px;font-weight:800;color:#1554d1">2</div></div>')


def trip(s):
    return (f'<div class="abs" style="left:0;top:0;width:{332*s}px;height:{214*s}px;background:#fff;border:2px solid #dbeafe;border-radius:{10*s}px">'
            f'<div class="abs" style="left:{18*s}px;top:{14*s}px;font-size:{18*s}px;color:#5b6370;font-weight:700">Próxima viagem</div>'
            f'<div class="abs serif" style="left:{18*s}px;top:{40*s}px;font-size:{44*s}px;color:#0f2a4a">Cancún</div>'
            f'<div class="abs" style="left:{18*s}px;top:{98*s}px;font-size:{24*s}px;font-weight:800;color:#157347">Viagem confirmada!</div>'
            f'<div class="abs" style="left:{18*s}px;top:{146*s}px;display:flex;gap:{10*s}px">'
            f'<div style="padding:{8*s}px {12*s}px;border:2px solid #1554d1;color:#1554d1;font-size:{18*s}px;font-weight:800;border-radius:{6*s}px">Documentos</div>'
            f'<div style="padding:{8*s}px {12*s}px;border:2px solid #1554d1;color:#1554d1;font-size:{18*s}px;font-weight:800;border-radius:{6*s}px">Pagamentos</div></div></div>')


def comms(s):
    return (f'<div class="abs" style="left:0;top:0;width:{332*s}px;height:{116*s}px;background:#fff;border:2px solid #dbeafe;border-radius:{10*s}px"><div class="abs" style="left:{18*s}px;top:{14*s}px;font-size:{22*s}px;font-weight:800;color:#1a1d21">Comunicados da agência</div><div class="abs" style="left:{18*s}px;top:{50*s}px;width:{296*s}px;font-size:{22*s}px;line-height:1.3;color:#5b6370">Nenhum aviso no momento.</div></div>'
            f'<div class="abs" style="left:0;top:{132*s}px;width:{332*s}px;height:{96*s}px;background:#fff;border:2px solid #dbeafe;border-radius:{10*s}px"><div class="abs" style="left:{18*s}px;top:{14*s}px;font-size:{22*s}px;font-weight:800;color:#1a1d21">Ofertas da sua agência</div><div class="abs" style="left:{18*s}px;top:{50*s}px;font-size:{20*s}px;color:#5b6370">Pacotes selecionados para você</div></div>')


PH_X, PH_Y, PH_W, PH_H = 140, 170, 400, 810


def phone_ui():
    nav = "".join(f'<div class="abs" style="left:{i * 74}px;bottom:16px;width:74px;text-align:center;font-size:17px;color:{"#1554d1" if i == 0 else "#5b6370"};font-weight:{800 if i == 0 else 600}">{n}</div>'
                  for i, n in enumerate(["Início", "Viagens", "Ofertas", "Suporte", "Perfil"]))
    return f"""<div id="phone" class="abs" style="left:{PH_X}px;top:{PH_Y}px;width:{PH_W}px;height:{PH_H}px;background:#0f2a4a;border-radius:44px;padding:14px;box-shadow:0 30px 60px rgba(15,42,74,.3)">
<div class="abs" style="left:14px;top:14px;right:14px;bottom:14px;background:#f3f4f6;border-radius:32px;overflow:hidden">
<div class="abs" style="left:0;top:0;right:0;height:100px;background:linear-gradient(135deg,#0f2a4a,#1e3a5f 60%,#0e5b7a);padding:34px 22px 0"><div class="abs serif" style="left:22px;top:34px;font-size:36px;color:#fff;letter-spacing:-0.01em">Olá, Marina!</div></div>
<div id="m1" class="abs" style="left:20px;top:114px;width:332px;height:104px">{tiles(1)}</div>
<div id="m2" class="abs" style="left:20px;top:234px;width:332px;height:214px">{trip(1)}</div>
<div id="m3" class="abs" style="left:20px;top:464px;width:332px;height:228px">{comms(1)}</div>
<div id="o1" class="abs" style="left:14px;top:108px;width:344px;height:116px;border:4px solid #1554d1;border-radius:14px"></div>
<div id="o2" class="abs" style="left:14px;top:228px;width:344px;height:226px;border:4px solid #1554d1;border-radius:14px"></div>
<div id="o3" class="abs" style="left:14px;top:458px;width:344px;height:240px;border:4px solid #1554d1;border-radius:14px"></div>
<div class="abs" style="left:0;right:0;bottom:0;height:78px;background:#fff;border-top:2px solid #e2e6ea">{nav}</div></div></div>"""


def parte3():
    p = Part(3, 60)
    hook_scene(p, "s1", 0, 5.0, 'E depois que o cliente <span style="color:#06b6d4">diz sim?</span>', "App do cliente", "Seu cliente acompanha tudo no celular.")
    ZX = 760  # painel de zoom (x 760..1820)
    zs = 2.0
    panels = (
        f'<div id="z1" class="abs" style="left:{ZX}px;top:330px;width:1060px;height:600px"><div class="num" style="font-size:44px">01</div><div class="serif" style="font-size:76px;line-height:1.05;margin-top:8px">Viagens e reservas</div><div class="abs" style="left:0;top:200px;width:{332*zs}px;height:{104*zs}px">{tiles(zs)}</div></div>'
        f'<div id="z2" class="abs" style="left:{ZX}px;top:330px;width:1060px;height:600px"><div class="num" style="font-size:44px">02</div><div class="serif" style="font-size:76px;line-height:1.05;margin-top:8px">Documentos e pagamentos</div><div class="abs" style="left:0;top:200px;width:{332*zs}px;height:{214*zs}px">{trip(zs)}</div></div>'
        f'<div id="z3" class="abs" style="left:{ZX}px;top:330px;width:1060px;height:600px"><div class="num" style="font-size:44px">03</div><div class="serif" style="font-size:76px;line-height:1.05;margin-top:8px">Comunicados e ofertas</div><div class="abs" style="left:0;top:230px;width:{332*1.8}px;height:{228*1.8}px">{comms(1.8)}</div></div>')
    p.scene("s2", 4.6, 12.8, "paper", f'{logo(100, 80, 60)}<p class="eyebrow" style="left:{ZX}px;top:230px">Na palma da mão</p>{phone_ui()}{panels}')
    # instalacao
    grid = "".join(
        f'<div class="abs" style="left:{22 + (i % 3) * 112}px;top:{360 + (i // 3) * 132}px;width:84px;height:84px;background:rgba(255,255,255,.18);border-radius:20px"></div>' for i in range(9) if i != 4)
    p.scene("s3", 16.6, 9.8, "deep",
            f"""{logo(100, 80, 60)}<p class="eyebrow" style="left:100px;top:300px">Instalação</p>
<h2 id="s3h" class="serif abs" style="left:100px;top:360px;width:900px;font-size:92px;line-height:1.1">Instala como app, direto do navegador.</h2>
<div id="s3phone" class="abs" style="left:1280px;top:130px;width:{PH_W}px;height:{PH_H}px;background:#0f2a4a;border-radius:44px;padding:14px;box-shadow:0 30px 60px rgba(15,42,74,.3)">
<div class="abs" style="left:14px;top:14px;right:14px;bottom:14px;border-radius:32px;overflow:hidden;background:#f3f4f6">
<div id="pg" class="abs" style="inset:0;background:#f3f4f6">
<div class="abs" style="left:0;top:0;right:0;height:112px;background:linear-gradient(135deg,#0f2a4a,#1e3a5f 60%,#0e5b7a)"><div class="abs serif" style="left:22px;top:44px;font-size:36px;color:#fff">Minha Viagem</div></div>
<div class="abs" style="left:20px;top:140px;width:332px;height:110px;background:#fff;border:2px solid #dbeafe;border-radius:10px"></div>
<div class="abs" style="left:20px;top:268px;width:332px;height:180px;background:#fff;border:2px solid #dbeafe;border-radius:10px"></div>
<div id="banner" class="abs" style="left:14px;top:126px;width:344px;height:236px;background:#e6eeff;border:3px solid #1554d1;border-radius:12px;padding:22px 24px;box-shadow:0 14px 30px rgba(15,42,74,.25)"><div style="font-size:26px;line-height:1.32;color:#1a1d21;font-weight:600">Instale o app <b>Minha Viagem</b> na tela inicial para acesso rápido.</div><div id="instbtn" class="btn" style="left:24px;bottom:20px;width:170px;height:56px;font-size:26px;border-radius:8px">Instalar</div></div></div>
<div id="home" class="abs" style="inset:0;background:linear-gradient(160deg,#0f2a4a,#0e5b7a)">{grid}
<img id="appicon" class="abs" src="assets/icone.svg" style="left:134px;top:492px;width:84px;height:84px;border-radius:20px" alt="">
<div id="appname" class="abs" style="left:100px;top:588px;width:150px;text-align:center;font-size:20px;font-weight:700;color:#fff">Minha Viagem</div></div></div></div>""")
    end_hook(p, "s4", 26.2, 3.8, 'E quem cuida de tudo <span style="color:#06b6d4">isso?</span>')
    p.code(hook_js("s1", 1.0) + """
wipe("#s2-scene", 4.6);
tl.fromTo("#phone", { scale: 0.94, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.9, ease: E }, 4.9);
tl.set(["#m1", "#m2", "#m3", "#o1", "#o2", "#o3", "#z1", "#z2", "#z3"], { opacity: 0 }, 0);
tl.fromTo("#m1", { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: E }, 6.4);
tl.fromTo("#m2", { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: E }, 6.9);
tl.fromTo("#m3", { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: E }, 7.4);
// zoom 1
tl.to("#o1", { opacity: 1, duration: 0.3 }, §8.5§);
show("#z1", §8.5§, 0.8, 30);
tl.to("#z1", { opacity: 0, y: -30, duration: 0.5, ease: "power2.in" }, 11.2);
tl.to("#o1", { opacity: 0, duration: 0.3 }, 11.2);
// zoom 2
tl.to("#o2", { opacity: 1, duration: 0.3 }, §11.5§);
show("#z2", §11.7§, 0.8, 30);
tl.to("#z2", { opacity: 0, y: -30, duration: 0.5, ease: "power2.in" }, 14.4);
tl.to("#o2", { opacity: 0, duration: 0.3 }, 14.4);
// zoom 3
tl.to("#o3", { opacity: 1, duration: 0.3 }, §14.7§);
show("#z3", §14.9§, 0.8, 30);
wipe("#s3-scene", 16.6);
show("#s3h", 16.9, 0.9);
tl.fromTo("#s3phone", { scale: 0.94, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.8, ease: E }, §18.5§);
tl.fromTo("#banner", { y: -40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: E }, §20.0§);
tl.to("#instbtn", { scale: 0.92, duration: 0.12, yoyo: true, repeat: 1 }, §21.5§);
tl.set("#home", { opacity: 0 }, 0);
tl.to("#home", { opacity: 1, duration: 0.6 }, §22.5§);
tl.fromTo("#appicon", { scale: 0.6 }, { scale: 1, duration: 0.7, ease: "back.out(1.7)" }, §22.7§);
wipe("#s4-scene", 26.2);
show("#s4h", 26.5, 0.9);
tl.fromTo("#s4u", { scaleX: 0 }, { scaleX: 1, duration: 0.9, ease: E }, 27.4);
""")
    p.sfx("impactSoft_medium_001", 1.4, 0.6)
    p.sfx("card-place-1", 4.9, 0.6)
    for t in (6.4, 6.9, 7.4): p.sfx("drop_001", t, 0.45)
    for t in (8.5, 11.7, 14.9): p.sfx("card-place-1", t, 0.55)
    p.sfx("drop_001", 16.9, 0.5); p.sfx("card-place-1", 18.5, 0.6)
    p.sfx("click_002", 21.5, 0.8); p.sfx("chips-stack-1", 22.7, 0.7)
    p.sfx("impactSoft_medium_001", 26.5, 0.7)
    return p, [{"t": 0, "v": 1}]


# ====================== PARTE 4 : EQUIPE E ACESSOS ======================
def parte4():
    p = Part(4, 90)
    hook_scene(p, "s1", 0, 4.6, 'E quem cuida de tudo <span style="color:#06b6d4">isso?</span>', "Equipe e acessos", "Cada pessoa vê só o que precisa.")
    emps = [("Ana Souza", "CLT", "Ativo", "#157347"), ("Bruno Lima", "Prestador", "Ativo", "#157347"),
            ("Carla Dias", "Sócia", "Ativo", "#157347"), ("Diego Rocha", "Freelancer", "Afastado", "#9a6700")]
    erows = "".join(
        f'<div id="e{i}" class="tr" style="left:36px;right:36px;top:{150 + i * 100}px;height:100px;font-size:36px"><span style="left:0;height:100px;font-weight:700">{n}</span><span style="left:320px;height:100px">{v}</span><span style="right:0;height:100px;color:{c};font-weight:800">{s}</span></div>'
        for i, (n, v, s, c) in enumerate(emps))
    p.scene("s2", 4.2, 8.2, "paper",
            f"""{logo(100, 80, 60)}<p class="eyebrow" style="left:100px;top:290px">Pessoal</p>
<h2 id="s2h" class="serif abs" style="left:100px;top:345px;width:760px;font-size:88px;line-height:1.1">Funcionários, comissões e folha.</h2>
<div id="s2card" class="card" style="left:1000px;top:210px;width:820px;height:640px;box-shadow:0 30px 70px rgba(15,42,74,.16)">
<div class="th" style="left:36px;right:36px;top:40px;height:100px;font-size:28px;color:#5b6370;font-weight:700"><span style="left:0;height:100px">Nome</span><span style="left:320px;height:100px">Vínculo</span><span style="right:0;height:100px">Situação</span></div>{erows}
<div id="e5" class="abs" style="left:36px;top:566px;padding:12px 26px;border:2px solid #1554d1;color:#1554d1;font-size:28px;font-weight:800;border-radius:4px">Planos de comissão</div><div id="e6" class="abs" style="left:376px;top:566px;padding:12px 26px;border:2px solid #1554d1;color:#1554d1;font-size:28px;font-weight:800;border-radius:4px">Folha de pagamento</div></div>""")
    roles = [("Dono", "Controle total da agência"), ("Administrador", "Acesso a configurações"), ("Gerente", "Acesso a relatórios e equipe"),
             ("Agente", "Acesso a operações"), ("Visualizador", "Acesso somente leitura")]
    rrows = "".join(
        f'<div id="r{i}" class="abs" style="left:960px;top:{170 + i * 104}px;width:860px;height:104px;border-top:2px solid rgba(15,42,74,.2);display:flex;align-items:center;gap:30px"><span class="serif" style="font-size:50px;width:340px">{n}</span><span style="font-size:32px;color:#5b6370;width:470px">{d}</span></div>'
        for i, (n, d) in enumerate(roles))
    p.scene("s3", 11.8, 9.6, "deep",
            f"""{logo(100, 80, 60)}<p class="eyebrow" style="left:100px;top:290px">Usuários</p>
<h2 id="s3h" class="serif abs" style="left:100px;top:345px;width:760px;font-size:88px;line-height:1.1">Papéis e acessos por pessoa.</h2>{rrows}
<div id="restr" class="abs" style="left:960px;top:742px;width:860px;height:200px;background:#0f2a4a;border-radius:4px;padding:30px 36px"><div class="serif" style="font-size:46px;color:#fff;line-height:1.1">Restrições só reduzem acesso.</div><div style="margin-top:20px;font-size:30px;color:#bfe9f2">Agente · Financeiro — Visualizar · restrito</div></div>""")
    sec = [("Autenticação em duas etapas", "Proteção adicional de login para contas da equipe."),
           ("Trilha de auditoria", "Ações relevantes ficam registradas para consulta."),
           ("Isolamento por agência", "Cada agência opera em seu próprio espaço de dados.")]
    srows = "".join(
        f'<div id="q{i}" class="abs" style="left:960px;top:{220 + i * 200}px;width:860px;height:200px;border-top:2px solid rgba(255,255,255,.25)"><span class="num" style="position:absolute;left:0;top:38px;font-size:42px;color:#06b6d4">0{i + 1}</span><span class="serif" style="position:absolute;left:90px;top:30px;font-size:50px;color:#fff;width:760px">{t}</span><span style="position:absolute;left:90px;top:112px;font-size:32px;color:#bfe9f2;width:760px;line-height:1.3">{d}</span></div>'
        for i, (t, d) in enumerate(sec))
    p.scene("s4", 21.2, 5.0, "navy",
            glow("s4glow") + logo(100, 80, 60, dark=True) + f"""<p data-layout-allow-overlap class="eyebrow c" style="left:100px;top:360px">Confiança</p>
<h2 id="s4h" class="serif abs" style="left:100px;top:420px;width:760px;font-size:100px;line-height:1.06;color:#fff">Segurança por padrão</h2>{srows}""")
    p.scene("s5", 25.6, 4.4, "paper",
            f"""<p id="s5e" class="eyebrow" style="left:100px;right:100px;top:130px;text-align:center">Para agências de viagem</p>
{logo(416, 200, 240, ident="s5logo")}
<div id="s5cta" class="btn" style="left:620px;top:560px;width:680px;height:130px;font-size:56px">Solicitar acesso</div>
<div id="s5lite" class="abs" style="left:360px;right:360px;top:780px;text-align:center"><div style="font-size:32px;color:#5b6370">Quer começar menor?</div><div style="margin-top:10px;font-size:38px;color:#0f2a4a;font-weight:700">O <span style="color:#1554d1">Travel Lite</span> é a edição simplificada.</div></div>""")
    p.code(hook_js("s1", 1.0) + """
wipe("#s2-scene", 4.2);
show("#s2h", 4.5, 0.9);
tl.set(["#e0", "#e1", "#e2", "#e3", "#e5", "#e6"], { opacity: 0 }, 0);
tl.fromTo("#s2card", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: E }, §5.5§);
tl.fromTo("#e0", { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: E }, §6.0§);
tl.fromTo("#e1", { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: E }, §7.0§);
tl.fromTo("#e2", { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: E }, §8.0§);
tl.fromTo("#e3", { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: E }, §9.0§);
tl.fromTo(["#e5", "#e6"], { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, stagger: 0.25, ease: E }, §10.0§);
wipe("#s3-scene", 11.8);
show("#s3h", 12.1, 0.9);
tl.set(["#r0", "#r1", "#r2", "#r3", "#r4", "#restr"], { opacity: 0 }, 0);
tl.fromTo("#r0", { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: E }, §13.5§);
tl.fromTo("#r1", { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: E }, §14.5§);
tl.fromTo("#r2", { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: E }, §15.5§);
tl.fromTo("#r3", { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: E }, §16.5§);
tl.fromTo("#r4", { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: E }, §17.5§);
tl.fromTo("#restr", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: E }, §18.5§);
wipe("#s4-scene", 21.2);
show("#s4h", 21.5, 0.9);
tl.set(["#q0", "#q1", "#q2"], { opacity: 0 }, 0);
tl.fromTo("#q0", { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: E }, §22.5§);
tl.fromTo("#q1", { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: E }, §23.5§);
tl.fromTo("#q2", { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: E }, §24.5§);
wipe("#s5-scene", 25.6);
show("#s5e", 25.9, 0.7, 20);
tl.fromTo("#s5logo", { y: 40, scale: 0.96, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.9, ease: E }, §26.0§);
tl.fromTo("#s5cta", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: E }, §27.3§);
tl.to("#s5cta", { scale: 1.04, duration: 0.5, ease: "sine.inOut", yoyo: true, repeat: 1 }, 28.4);
show("#s5lite", §28.4§, 0.8, 20);
""")
    p.sfx("impactSoft_medium_001", 1.4, 0.6)
    p.sfx("card-place-1", 5.5, 0.6)
    for t in (6.0, 7.0, 8.0, 9.0): p.sfx("drop_002", t, 0.5)
    p.sfx("drop_001", 10.0, 0.5)
    for t in (13.5, 14.5, 15.5, 16.5, 17.5): p.sfx("drop_001", t, 0.5)
    p.sfx("card-place-1", 18.5, 0.6)
    for t in (22.5, 23.5, 24.5): p.sfx("drop_002", t, 0.5)
    p.sfx("impactSoft_medium_001", 26.0, 0.7); p.sfx("impactBell_heavy_000", 27.3, 0.7)
    return p, [{"t": 0, "v": 1}, {"t": 27.6, "v": 1}, {"t": 30, "v": 0}]


if __name__ == "__main__":
    for fn in (parte1, parte2, parte3, parte4):
        part, pts = fn()
        part.write(pts)
        print("ok parte", part.n)
