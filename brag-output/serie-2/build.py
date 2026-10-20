"""Serie 2 (4 partes de 30 s): diferenciais do Travel Plataforma.

Uso: python build.py   (a partir de brag-output/serie-2)
"""
import json, os, re, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SHARED = os.path.join(HERE, "shared")
sys.path.insert(0, os.path.join(HERE, "..", "serie"))
import build as base  # reutiliza CSS comum, rota e logo da serie 1

CUES = os.path.expanduser(
    "~/.claude/skills/brag/assets/music/cues/happy-beats-business-moves-vol-1-by-ende-dot-app.music-cues.json"
)
BEATS = [b["time"] for b in json.load(open(CUES))["beats"]]
DUR = 30.0
base.SHARED = SHARED  # sfx_len le daqui


class Part:
    def __init__(self, n, off):
        self.n, self.off = n, off
        self.beats = [b - off for b in BEATS if off - 0.5 <= b <= off + DUR + 0.5]
        self.clips, self.js, self.audio = [], [], []
        self.track, self.sid = 11, 0
        self.music_vol = 0.33

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
        ln = base.sfx_len(name)
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
<style>{base.COMMON_CSS}</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-width="1920" data-height="1080" data-duration="{DUR:g}">
{chr(10).join(self.clips)}
<audio id="bgm" data-start="0" data-duration="{DUR:g}" data-media-start="{self.off:g}" data-track-index="10" data-volume="{self.music_vol}" src="assets/music/music.mp3" data-automation='{auto}'></audio>
{chr(10).join(self.audio)}
</div>
<script>
var tl = gsap.timeline({{ paused: true }});
var E = "power3.out";
function show(sel, at, d, y) {{ tl.fromTo(sel, {{ y: y === undefined ? 40 : y, opacity: 0 }}, {{ y: 0, opacity: 1, duration: d || 0.7, ease: E }}, at); }}
function fadeScene(id, at) {{ tl.fromTo(id, {{ opacity: 0 }}, {{ opacity: 1, duration: 0.5, ease: "power2.out" }}, at); }}
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


GLOW = '<div id="{i}" data-layout-allow-overflow class="glow" style="left:1100px;top:-500px"></div>'


def hook_scene(p, sid, start, dur, hook_html, eyebrow, title_html, carry=True):
    """Abertura navy: repete o gancho da parte anterior e troca pelo tema da parte."""
    inner = (GLOW.format(i=sid + "glow")
             + (f'<h2 id="{sid}a" class="serif abs" style="left:0;right:0;top:420px;text-align:center;font-size:130px;color:#fff;line-height:1.1">{hook_html}</h2>' if carry else "")
             + f'<p id="{sid}e" class="eyebrow c" style="left:0;right:0;top:300px;text-align:center">{eyebrow}</p>'
             + f'<h2 id="{sid}b" class="serif abs" style="left:160px;right:160px;top:370px;text-align:center;font-size:118px;color:#fff;line-height:1.12">{title_html}</h2>')
    p.scene(sid, start, dur, "navy", inner)


def hook_js(sid, swap_at):
    return f"""
tl.to("#{sid}a", {{ opacity: 0, y: -40, duration: 0.5, ease: "power2.in" }}, {swap_at - 0.5});
show("#{sid}e", {swap_at + 0.2}, 0.7, 20);
show("#{sid}b", {swap_at + 0.5}, 0.8);
"""


def end_hook(p, sid, start, dur, html):
    p.scene(sid, start, dur, "navy", GLOW.format(i=sid + "glow")
            + f'<h2 id="{sid}h" class="serif abs" style="left:0;right:0;top:400px;text-align:center;font-size:136px;color:#fff;line-height:1.12">{html}</h2>')


def hook_start(p, sid, start, dur, html):
    pass


# ====================== PARTE 1 : VISAO ======================
def parte1():
    p = Part(1, 0)
    cells = [("pago?", 1300, 130), ("confirmar com o cliente", 1180, 260), ("parcela 2 ???", 1420, 420), ("R$ ??", 1260, 560),
             ("ver comissão", 1360, 700), ("vendedor?", 1220, 840)]
    cell_html = "".join(
        f'<div class="abs cell" style="left:{x}px;top:{y}px;background:#fff;border:2px solid #c5ccd6;color:#5b6370;font-size:32px;padding:10px 22px;white-space:nowrap">{t}</div>'
        for t, x, y in cells)
    p.scene("s1", 0, 4.6, "deep",
            f"""<div class="abs" style="inset:0;background-image:linear-gradient(#e0e4ea 2px,transparent 2px),linear-gradient(90deg,#e0e4ea 2px,transparent 2px);background-size:240px 72px"></div>{cell_html}
<h1 class="serif abs" style="left:120px;top:330px;font-size:132px;line-height:1.08;width:1100px"><span id="s1a" style="display:block">Sua agência ainda</span><span id="s1b" style="display:block">vive de <span style="color:#1554d1">planilha?</span></span></h1>""")
    p.scene("s2", 4.2, 7.6, "paper",
            f"""<p id="s2e" class="eyebrow" style="left:120px;top:150px">Para agências de viagem</p>
{base.logo_img(120, 205, 130, ident="s2logo")}
<h2 id="s2h" class="serif abs" style="left:120px;top:420px;width:920px;font-size:70px;line-height:1.12">Um único produto para o time comercial, operacional, financeiro — e para o seu cliente.</h2>
<div id="s2frame" class="abs" style="left:1180px;top:110px;width:620px;height:800px;background:#0f2a4a">{base.ROUTE_SVG}</div>""")
    pillars = [("01", "Pipeline comercial", "Do primeiro contato à venda, com etapas configuráveis por agência."),
               ("02", "App do cliente", "Seus clientes acompanham viagens, documentos e ofertas direto do celular."),
               ("03", "Equipe e acessos", "Papéis, permissões e convites para sua equipe comercial e operacional.")]
    cols = "".join(
        f'<div id="s3c{i}" class="abs" style="left:{120 + i * 580}px;top:430px;width:520px;height:520px;border-top:3px solid #1554d1;padding-top:30px">'
        f'<span class="num" style="font-size:48px">{n}</span>'
        f'<div class="serif" style="font-size:60px;line-height:1.08;margin-top:14px">{t}</div>'
        f'<div style="font-size:32px;line-height:1.38;color:#5b6370;margin-top:22px">{d}</div></div>'
        for i, (n, t, d) in enumerate(pillars))
    p.scene("s3", 11.4, 13.2, "paper",
            f"""<p class="eyebrow" style="left:120px;top:120px">No dia a dia</p>
<h2 id="s3h" class="serif abs" style="left:120px;top:180px;width:1200px;font-size:84px;line-height:1.08">O que sustenta a operação da sua agência</h2>{cols}""")
    p.scene("s4", 24.2, 3.4, "deep",
            """<h2 id="s4h" class="serif abs" style="left:120px;top:330px;font-size:100px;line-height:1.05">Financeiro completo</h2>
<p id="s4d" class="abs" style="left:120px;top:490px;width:1300px;margin:0;font-size:40px;line-height:1.35;color:#5b6370">Contas a receber, a pagar, fluxo de caixa e margem em tempo real.</p>""")
    end_hook(p, "s5", 27.2, 2.8, 'Tudo começa no <span style="color:#06b6d4">primeiro contato.</span>')
    p.code("""
fadeScene("#s2-scene", 4.2);
show("#s1a", 0.6, 0.8); show("#s1b", 1.3, 0.8);
tl.fromTo(".cell", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.2, ease: E }, 0.3);
show("#s2e", 4.9, 0.7); show("#s2logo", §5.5§, 0.8);
show("#s2h", 6.4, 0.9);
tl.fromTo("#s2frame", { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.9, ease: E }, §7.5§);
fadeScene("#s3-scene", 11.4);
show("#s3h", 11.9, 0.8);
tl.fromTo("#s3c0", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: E }, §13.0§);
tl.fromTo("#s3c1", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: E }, §16.6§);
tl.fromTo("#s3c2", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: E }, §20.2§);
fadeScene("#s4-scene", 24.2);
show("#s4h", 24.7, 0.8); show("#s4d", 25.3, 0.8);
fadeScene("#s5-scene", 27.2);
show("#s5h", 27.7, 0.9);
""")
    p.sfx("drop_001", 0.6, 0.5); p.sfx("drop_001", 1.3, 0.5)
    p.sfx("impactSoft_medium_001", 5.5, 0.7); p.sfx("card-place-1", 7.5, 0.6)
    for t in (13.0, 16.6, 20.2): p.sfx("card-place-1", t, 0.6)
    p.sfx("drop_002", 24.7, 0.5); p.sfx("impactSoft_medium_001", 27.7, 0.7)
    return p, [{"t": 0, "v": 0.55}, {"t": 4.2, "v": 0.55}, {"t": 6, "v": 1}]


# ====================== PARTE 2 : PIPELINE ======================
STAGES = ["Prospecção", "Interesse", "Orçamento", "Proposta enviada", "Aguardando cliente", "Negociação", "Ganho"]
STAGE_DOT = ["#6b7280", "#1554d1", "#9a6700", "#1554d1", "#9a6700", "#7c3aed", "#157347"]
COL_X0, COL_STEP, COL_W = 80, 244, 232
CARDS = [  # (id, nome, destino, valor, coluna, linha)
    ("k0", "Carlos M.", "Gramado", "R$ 6.800", 0, 0), ("k1", "Helena R.", "Lisboa", "R$ 14.200", 0, 1),
    ("k2", "Grupo Lima", "Maragogi", "R$ 38.000", 1, 0),
    ("hero", "Família Souza", "Cancún", "R$ 12.600", 2, 0), ("k3", "Paulo T.", "Orlando", "R$ 21.500", 2, 1),
    ("k4", "Júlia A.", "Bariloche", "R$ 9.300", 3, 0),
    ("k5", "Renata C.", "Salvador", "R$ 7.400", 5, 0),
    ("k6", "Marcos S.", "Foz do Iguaçu", "R$ 5.900", 6, 0),
]


def parte2():
    p = Part(2, 30)
    hook_scene(p, "s1", 0, 5.0, 'Tudo começa no <span style="color:#06b6d4">primeiro contato.</span>', "Pipeline comercial", "Do primeiro contato à venda.")
    cols_html = ""
    for i, name in enumerate(STAGES):
        x = COL_X0 + i * COL_STEP
        n = sum(1 for c in CARDS if c[4] == i)
        cols_html += (f'<div id="col{i}" class="abs" style="left:{x}px;top:200px;width:{COL_W}px;height:760px;background:#fff;border:2px solid #e2e6ea;border-radius:4px">'
                      f'<div id="colh{i}" class="abs" style="left:0;top:0;right:0;height:84px;border-bottom:2px solid #e2e6ea;padding:16px 16px"><div style="font-size:26px;font-weight:800;color:#1a1d21;line-height:1.15"><span style="display:inline-block;width:12px;height:12px;background:{STAGE_DOT[i]};margin-right:10px"></span>{name}</div></div></div>')
    cards_html = ""
    for cid, nm, dest, val, col, row in CARDS:
        x = COL_X0 + col * COL_STEP + 12
        y = 304 + row * 184
        cards_html += (f'<div id="{cid}" class="abs kcard" style="left:{x}px;top:{y}px;width:208px;height:168px;background:#fff;border:2px solid #cfd6df;border-radius:4px;padding:16px 18px">'
                       f'<div style="font-size:28px;font-weight:800;color:#1a1d21">{nm}</div><div style="font-size:24px;color:#5b6370;margin-top:6px">{dest}</div><div style="font-size:26px;font-weight:700;color:#1554d1;margin-top:12px">{val}</div></div>')
    p.scene("s2", 4.6, 17.0, "deep",
            f"""<h2 id="s2t" class="abs" style="left:80px;top:60px;margin:0;font-size:64px;font-weight:800;color:#1a1d21">Pipeline</h2>
<div id="s2sel" class="abs" style="left:80px;top:140px;font-size:28px;color:#5b6370">Pipeline de vendas</div>
<div id="s2cap" class="serif abs" style="left:700px;top:78px;font-size:46px;color:#0f2a4a">Arraste o cartão entre as etapas.</div>
{cols_html}{cards_html}
<div id="wonbadge" class="abs" style="left:1500px;top:100px;padding:12px 26px;background:#157347;color:#fff;font-size:32px;font-weight:800;border-radius:4px">Família Souza · Ganho</div>
<svg id="cur2" class="abs" style="left:0;top:0;width:64px;height:64px" viewBox="0 0 24 24"><path d="M4 2 L4 19 L8.6 14.8 L11.6 21.6 L14.2 20.5 L11.2 13.8 L17.5 13.8 Z" fill="#1a1d21" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>""")
    chips = [("Prospecção", "Azul", "#1554d1"), ("Proposta", "Amarelo", "#9a6700"), ("Fechado", "Verde", "#157347")]
    chips_html = "".join(
        f'<div id="ch{i}" class="abs" style="left:{40 + i * 230}px;top:340px;width:210px;height:150px;border:2px solid #e2e6ea;border-radius:4px;padding:18px 20px"><div style="width:20px;height:20px;background:{c}"></div><div style="font-size:30px;font-weight:800;color:#1a1d21;margin-top:14px">{n}</div><div style="font-size:24px;color:#5b6370;margin-top:6px">{cor}</div></div>'
        for i, (n, cor, c) in enumerate(chips))
    p.scene("s3", 21.0, 6.0, "paper",
            f"""<p class="eyebrow" style="left:120px;top:250px">Pipeline</p>
<h2 id="s3h" class="serif abs" style="left:120px;top:310px;width:760px;font-size:88px;line-height:1.08">Etapas configuráveis por agência.</h2>
<div id="s3card" class="card" style="left:1000px;top:240px;width:760px;height:560px;box-shadow:0 30px 70px rgba(15,42,74,.18)">
<div class="abs" style="left:40px;top:34px;font-size:26px;color:#5b6370;font-weight:600">Novo pipeline</div>
<div class="abs" style="left:40px;top:80px;width:680px;height:78px;border:2px solid #1554d1;border-radius:4px;padding:18px 22px;font-size:36px;color:#1a1d21"><span id="typed"></span></div>
<div class="abs" style="left:40px;top:260px;font-size:26px;color:#5b6370;font-weight:600">Etapas</div>{chips_html}
<div class="abs" style="left:40px;top:520px;font-size:24px;color:#5b6370">Cada etapa tem nome e cor.</div></div>""")
    end_hook(p, "s4", 26.6, 3.4, 'E depois que o cliente <span style="color:#06b6d4">diz sim?</span>')
    p.code("""
show("#s1a", 0.2, 0.01, 0);
""" + hook_js("s1", 2.0) + """
fadeScene("#s2-scene", 4.6);
show(["#s2t", "#s2sel"], 5.0, 0.6, 20);
tl.fromTo("[id^=col]:not([id^=colh])", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.25, ease: E }, 5.5);
tl.fromTo(".kcard", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.15, ease: E }, 8.0);
show("#s2cap", 9.0, 0.8, 20);
tl.set("#wonbadge", { opacity: 0 }, 0);
// cursor: segue o cartao "hero" (centro inicial 684,379)
tl.fromTo("#cur2", { x: 1000, y: 800, opacity: 0 }, { x: 684, y: 388, opacity: 1, duration: 0.9, ease: "power2.inOut" }, §9.5§);
tl.to("#hero", { scale: 1.05, boxShadow: "0 18px 36px rgba(15,42,74,.35)", borderColor: "#1554d1", duration: 0.2 }, §10.5§);
tl.to(["#hero", "#cur2"], { x: "+=244", y: "+=184", duration: 1.1, ease: "power2.inOut" }, §10.5§);
tl.to("#hero", { scale: 1, duration: 0.2 }, §11.8§);
tl.to("#hero", { scale: 1.05, duration: 0.2 }, §13.5§);
tl.to(["#hero", "#cur2"], { x: "+=488", duration: 1.3, ease: "power2.inOut" }, §13.5§);
tl.to("#hero", { scale: 1, duration: 0.2 }, §15.0§);
tl.to("#hero", { scale: 1.05, duration: 0.2 }, §16.0§);
tl.to(["#hero", "#cur2"], { x: "+=244", duration: 1.1, ease: "power2.inOut" }, §16.0§);
tl.to("#hero", { scale: 1, borderColor: "#157347", duration: 0.3 }, §17.2§);
tl.to("#colh6", { backgroundColor: "#e5f4ec", duration: 0.5 }, §17.2§);
tl.fromTo("#wonbadge", { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.6, ease: E }, §17.5§);
tl.to("#cur2", { opacity: 0, duration: 0.5 }, 18.4);
fadeScene("#s3-scene", 21.0);
show("#s3h", 21.5, 0.9);
tl.fromTo("#s3card", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: E }, §22.0§);
var tx = { n: 0 }, name2 = "Pacotes internacionais";
tl.to(tx, { n: name2.length, duration: 1.5, ease: "none", onUpdate: function () { document.getElementById("typed").textContent = name2.slice(0, Math.round(tx.n)); } }, §23.0§);
tl.fromTo("#ch0", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: E }, §24.0§);
tl.fromTo("#ch1", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: E }, §24.5§);
tl.fromTo("#ch2", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: E }, §25.0§);
fadeScene("#s4-scene", 26.6);
show("#s4h", 27.1, 0.9);
""")
    p.sfx("impactSoft_medium_001", 2.5, 0.6)
    p.sfx("drop_001", 5.5, 0.5); p.sfx("drop_002", 8.0, 0.4)
    for t in (10.5, 13.5, 16.0): p.sfx("click_002", t, 0.8)
    for t in (11.8, 15.0): p.sfx("card-place-1", t, 0.5)
    p.sfx("chips-stack-1", 17.2, 0.7)
    p.sfx("card-place-1", 22.0, 0.6)
    for t in (24.0, 24.5, 25.0): p.sfx("drop_001", t, 0.5)
    p.sfx("impactSoft_medium_001", 27.1, 0.7)
    return p, [{"t": 0, "v": 1}]


# ====================== PARTE 3 : APP DO CLIENTE ======================
def parte3():
    p = Part(3, 60)
    p.music_vol = 0.55  # trecho 60-90 s da faixa e mais suave; compensa o nivel
    hook_scene(p, "s1", 0, 5.0, 'E depois que o cliente <span style="color:#06b6d4">diz sim?</span>', "App do cliente", "Seu cliente acompanha tudo no celular.")
    nav = "".join(f'<div class="abs" style="left:{16 + i * 78}px;bottom:14px;width:78px;text-align:center;font-size:17px;color:{"#1554d1" if i == 0 else "#5b6370"};font-weight:{800 if i == 0 else 600}">{n}</div>'
                  for i, n in enumerate(["Início", "Viagens", "Ofertas", "Suporte", "Perfil"]))
    phone = f"""<div id="phone" class="abs" style="left:300px;top:70px;width:470px;height:940px;background:#0f2a4a;border-radius:20px;padding:14px">
<div class="abs" style="left:14px;top:14px;right:14px;bottom:14px;background:#f3f4f6;border-radius:10px;overflow:hidden">
<div class="abs" style="left:22px;top:26px;font-family:'Fraunces',serif;font-size:40px;color:#0f2a4a">Olá, Marina!</div>
<div id="m1" class="card" style="left:20px;top:100px;width:200px;height:110px"><div class="abs" style="left:16px;top:14px;font-size:20px;color:#5b6370;font-weight:700">Reservas ativas</div><div class="abs" style="left:16px;top:50px;font-size:44px;font-weight:800;color:#1554d1">1</div></div>
<div id="m1b" class="card" style="left:236px;top:100px;width:200px;height:110px"><div class="abs" style="left:16px;top:14px;font-size:20px;color:#5b6370;font-weight:700">Propostas</div><div class="abs" style="left:16px;top:50px;font-size:44px;font-weight:800;color:#1554d1">2</div></div>
<div id="m2" class="card" style="left:20px;top:230px;width:416px;height:250px"><div class="abs" style="left:20px;top:16px;font-size:20px;color:#5b6370;font-weight:700">Próxima viagem</div><div class="abs" style="left:20px;top:46px;font-family:'Fraunces',serif;font-size:42px;color:#0f2a4a">Cancún</div>
<div class="abs" style="left:20px;top:108px;font-size:26px;font-weight:800;color:#157347">Viagem confirmada!</div>
<div id="m2c1" class="abs" style="left:20px;top:168px;padding:10px 18px;border:2px solid #1554d1;color:#1554d1;font-size:22px;font-weight:800;border-radius:4px">Documentos</div><div id="m2c2" class="abs" style="left:182px;top:168px;padding:10px 18px;border:2px solid #1554d1;color:#1554d1;font-size:22px;font-weight:800;border-radius:4px">Pagamentos</div></div>
<div id="m3" class="card" style="left:20px;top:500px;width:416px;height:140px"><div class="abs" style="left:20px;top:16px;font-size:22px;font-weight:800;color:#1a1d21">Comunicados da agência</div><div class="abs" style="left:20px;top:56px;font-size:22px;color:#5b6370;line-height:1.3;width:380px">Nenhum aviso novo. Assim que houver novidade, ela aparece aqui.</div></div>
<div id="m4" class="card" style="left:20px;top:660px;width:416px;height:120px"><div class="abs" style="left:20px;top:16px;font-size:22px;font-weight:800;color:#1a1d21">Ofertas da sua agência</div><div class="abs" style="left:20px;top:56px;font-size:22px;color:#5b6370">Pacotes selecionados para você</div></div>
<div class="abs" style="left:0;right:0;bottom:0;height:78px;background:#fff;border-top:2px solid #e2e6ea">{nav}</div></div></div>"""
    side = [("01", "Viagens e reservas", "s2l1"), ("02", "Documentos e pagamentos", "s2l2"), ("03", "Comunicados e ofertas da agência", "s2l3")]
    lines = "".join(
        f'<div id="{ident}" class="abs" style="left:900px;top:{250 + i * 220}px;width:900px;border-top:3px solid #1554d1;padding-top:28px;display:flex;gap:36px"><span class="num" style="font-size:44px">{n}</span><span class="serif" style="font-size:64px;line-height:1.1;width:780px">{t}</span></div>'
        for i, (n, t, ident) in enumerate(side))
    p.scene("s2", 4.6, 12.6, "paper", f'{phone}<p class="eyebrow" style="left:900px;top:150px">Na palma da mão</p>{lines}')
    p.scene("s3", 16.8, 9.6, "deep",
            """<p class="eyebrow" style="left:120px;top:250px">Instalação</p>
<h2 id="s3h" class="serif abs" style="left:120px;top:310px;width:880px;font-size:92px;line-height:1.08">Instala como app, direto do navegador.</h2>
<div id="s3phone" class="abs" style="left:1190px;top:110px;width:430px;height:860px;background:#0f2a4a;border-radius:20px;padding:14px"><div class="abs" style="left:14px;top:14px;right:14px;bottom:14px;background:#fff;border-radius:10px;overflow:hidden">
<div id="banner" class="abs" style="left:18px;top:30px;right:18px;height:210px;background:#e6eeff;border:2px solid #1554d1;border-radius:4px;padding:20px 22px"><div style="font-size:26px;line-height:1.3;color:#1a1d21;font-weight:600">Instale o app <b>Minha Viagem</b> na tela inicial para acesso rápido.</div><div class="btn" style="position:absolute;left:22px;bottom:18px;width:150px;height:50px;font-size:24px">Instalar</div></div>
<img id="appicon" class="abs" src="assets/icone.svg" style="left:130px;top:360px;width:150px;height:150px" alt="">
<div id="appname" class="abs" style="left:0;right:0;top:530px;text-align:center;font-size:30px;font-weight:800;color:#0f2a4a">Minha Viagem</div></div></div>""")
    end_hook(p, "s4", 26.0, 4.0, 'E quem cuida de tudo <span style="color:#06b6d4">isso?</span>')
    p.code("""
""" + hook_js("s1", 2.0) + """
fadeScene("#s2-scene", 4.6);
tl.fromTo("#phone", { y: 120, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, ease: E }, 5.0);
tl.set(["#m1", "#m1b", "#m2", "#m3", "#m4", "#s2l1", "#s2l2", "#s2l3"], { opacity: 0 }, 0);
tl.fromTo(["#m1", "#m1b"], { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, stagger: 0.15, ease: E }, §6.5§);
tl.fromTo("#m2", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: E }, §7.5§);
show("#s2l1", §7.5§, 0.8);
tl.to(["#m2c1", "#m2c2"], { backgroundColor: "#e6eeff", duration: 0.4, stagger: 0.1 }, §10.5§);
show("#s2l2", §10.5§, 0.8);
tl.fromTo(["#m3", "#m4"], { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, stagger: 0.2, ease: E }, §13.5§);
show("#s2l3", §13.5§, 0.8);
fadeScene("#s3-scene", 16.8);
show("#s3h", 17.3, 0.9);
tl.fromTo("#s3phone", { y: 100, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: E }, §19.0§);
tl.fromTo("#banner", { y: -30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: E }, §20.5§);
tl.to("#banner", { opacity: 0, duration: 0.5 }, §22.5§);
tl.fromTo("#appicon", { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.7, ease: "back.out(1.7)" }, §22.5§);
tl.fromTo("#appname", { opacity: 0 }, { opacity: 1, duration: 0.5 }, §23.0§);
fadeScene("#s4-scene", 26.0);
show("#s4h", 26.5, 0.9);
""")
    p.sfx("impactSoft_medium_001", 2.5, 0.6)
    p.sfx("card-place-1", 5.0, 0.6); p.sfx("drop_001", 6.5, 0.5)
    for t in (7.5, 10.5, 13.5): p.sfx("card-place-1", t, 0.55)
    p.sfx("drop_001", 17.3, 0.5); p.sfx("card-place-1", 19.0, 0.6)
    p.sfx("click_002", 21.5, 0.8); p.sfx("chips-stack-1", 22.5, 0.7)
    p.sfx("impactSoft_medium_001", 26.5, 0.7)
    return p, [{"t": 0, "v": 1}]


# ====================== PARTE 4 : EQUIPE E ACESSOS ======================
def parte4():
    p = Part(4, 90)
    hook_scene(p, "s1", 0, 4.6, 'E quem cuida de tudo <span style="color:#06b6d4">isso?</span>', "Equipe e acessos", "Cada pessoa vê só o que precisa.")
    emps = [("Ana Souza", "CLT", "Ativo", "#157347"), ("Bruno Lima", "Prestador", "Ativo", "#157347"),
            ("Carla Dias", "Sócia", "Ativo", "#157347"), ("Diego Rocha", "Freelancer", "Afastado", "#9a6700")]
    erows = "".join(
        f'<div id="e{i}" class="tr" style="left:30px;right:30px;top:{150 + i * 96}px;height:96px;font-size:34px"><span style="left:0;height:96px;font-weight:700">{n}</span><span style="left:290px;height:96px">{v}</span><span style="right:0;height:96px;color:{c};font-weight:800">{s}</span></div>'
        for i, (n, v, s, c) in enumerate(emps))
    p.scene("s2", 4.2, 8.0, "paper",
            f"""<p data-layout-allow-overlap class="eyebrow" style="left:120px;top:230px">Pessoal</p>
<h2 id="s2h" class="serif abs" style="left:120px;top:290px;width:760px;font-size:88px;line-height:1.08">Funcionários, comissões e folha.</h2>
<div id="s2card" class="card" style="left:1000px;top:200px;width:780px;height:600px;box-shadow:0 30px 70px rgba(15,42,74,.18)">
<div class="th" style="left:30px;right:30px;top:40px;height:96px;font-size:26px;color:#5b6370;font-weight:700"><span style="left:0;height:96px">Nome</span><span style="left:290px;height:96px">Vínculo</span><span style="right:0;height:96px">Situação</span></div>{erows}
<div id="e5" class="abs" style="left:30px;top:548px;padding:10px 24px;border:2px solid #1554d1;color:#1554d1;font-size:26px;font-weight:800;border-radius:4px">Planos de comissão</div><div id="e6" class="abs" style="left:330px;top:548px;padding:10px 24px;border:2px solid #1554d1;color:#1554d1;font-size:26px;font-weight:800;border-radius:4px">Folha de pagamento</div></div>""")
    roles = [("Dono", "Controle total da agência"), ("Administrador", "Acesso a configurações"), ("Gerente", "Acesso a relatórios e equipe"),
             ("Agente", "Acesso a operações"), ("Visualizador", "Acesso somente leitura")]
    rrows = "".join(
        f'<div id="r{i}" class="abs" style="left:960px;top:{140 + i * 112}px;width:840px;height:112px;border-top:2px solid rgba(15,42,74,.2);display:flex;align-items:center;gap:40px"><span class="serif" style="font-size:50px;width:330px">{n}</span><span style="font-size:30px;color:#5b6370;width:460px">{d}</span></div>'
        for i, (n, d) in enumerate(roles))
    p.scene("s3", 11.8, 9.2, "deep",
            f"""<p data-layout-allow-overlap class="eyebrow" style="left:120px;top:230px">Usuários</p>
<h2 id="s3h" data-layout-allow-overlap class="serif abs" style="left:120px;top:290px;width:700px;font-size:88px;line-height:1.08">Papéis e acessos por pessoa.</h2>{rrows}
<div id="restr" class="abs" style="left:960px;top:730px;width:840px;height:190px;background:#0f2a4a;border-radius:4px;padding:26px 32px"><div class="serif" style="font-size:44px;color:#fff">Restrições só reduzem acesso.</div><div style="margin-top:18px;font-size:28px;color:#bfe9f2">Agente · Financeiro — Visualizar · restrito</div></div>""")
    sec = [("Autenticação em duas etapas", "Proteção adicional de login para contas da equipe."),
           ("Trilha de auditoria", "Ações relevantes ficam registradas para consulta."),
           ("Isolamento por agência", "Cada agência opera em seu próprio espaço de dados.")]
    srows = "".join(
        f'<div id="q{i}" class="abs" style="left:960px;top:{230 + i * 190}px;width:840px;height:190px;border-top:2px solid rgba(255,255,255,.25)"><span class="num" style="position:absolute;left:0;top:36px;font-size:40px;color:#06b6d4">0{i + 1}</span><span class="serif" style="position:absolute;left:84px;top:28px;font-size:48px;color:#fff;width:750px">{t}</span><span style="position:absolute;left:84px;top:104px;font-size:28px;color:#bfe9f2;width:740px">{d}</span></div>'
        for i, (t, d) in enumerate(sec))
    p.scene("s4", 20.4, 5.2, "navy",
            GLOW.format(i="s4glow") + f"""<p data-layout-allow-overlap class="eyebrow c" style="left:120px;top:330px">Confiança</p>
<h2 id="s4h" class="serif abs" style="left:120px;top:390px;width:760px;font-size:100px;line-height:1.06;color:#fff">Segurança por padrão</h2>{srows}""")
    p.scene("s5", 25.0, 5.0, "paper",
            f"""{base.logo_img(465, 240, 190, ident="s5logo")}
<div id="s5cta" class="btn" style="left:700px;top:560px;width:520px;height:100px;font-size:44px">Solicitar acesso</div>
<p id="s5lite" class="abs" style="left:0;right:0;top:730px;margin:0;text-align:center;font-size:36px;color:#5b6370">Quer começar menor? Comece pelo Travel Lite.</p>""")
    p.code("""
""" + hook_js("s1", 2.0) + """
fadeScene("#s2-scene", 4.2);
show("#s2h", 4.7, 0.9);
tl.set(["#e0", "#e1", "#e2", "#e3", "#e5", "#e6"], { opacity: 0 }, 0);
tl.fromTo("#s2card", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: E }, §5.5§);
tl.fromTo("#e0", { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: E }, §6.0§);
tl.fromTo("#e1", { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: E }, §7.0§);
tl.fromTo("#e2", { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: E }, §8.0§);
tl.fromTo("#e3", { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: E }, §9.0§);
tl.fromTo(["#e5", "#e6"], { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, stagger: 0.25, ease: E }, §10.0§);
fadeScene("#s3-scene", 11.8);
show("#s3h", 12.3, 0.9);
tl.set(["#r0", "#r1", "#r2", "#r3", "#r4", "#restr"], { opacity: 0 }, 0);
tl.fromTo("#r0", { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: E }, §13.5§);
tl.fromTo("#r1", { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: E }, §14.5§);
tl.fromTo("#r2", { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: E }, §15.5§);
tl.fromTo("#r3", { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: E }, §16.5§);
tl.fromTo("#r4", { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: E }, §17.5§);
tl.fromTo("#restr", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: E }, §18.5§);
fadeScene("#s4-scene", 20.4);
show("#s4h", 20.9, 0.9);
tl.set(["#q0", "#q1", "#q2"], { opacity: 0 }, 0);
tl.fromTo("#q0", { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: E }, §21.5§);
tl.fromTo("#q1", { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: E }, §22.5§);
tl.fromTo("#q2", { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: E }, §23.5§);
fadeScene("#s5-scene", 25.0);
show("#s5logo", 25.5, 0.9);
tl.fromTo("#s5cta", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: E }, §26.5§);
show("#s5lite", 27.5, 0.7, 20);
""")
    p.sfx("impactSoft_medium_001", 2.5, 0.6)
    p.sfx("card-place-1", 5.5, 0.6)
    for t in (6.0, 7.0, 8.0, 9.0): p.sfx("drop_002", t, 0.5)
    p.sfx("drop_001", 10.0, 0.5)
    for t in (13.5, 14.5, 15.5, 16.5, 17.5): p.sfx("drop_001", t, 0.5)
    p.sfx("card-place-1", 18.5, 0.6)
    for t in (21.5, 22.5, 23.5): p.sfx("drop_002", t, 0.5)
    p.sfx("impactSoft_medium_001", 25.5, 0.7); p.sfx("impactBell_heavy_000", 26.5, 0.7)
    return p, [{"t": 0, "v": 1}, {"t": 27.2, "v": 1}, {"t": 30, "v": 0}]


if __name__ == "__main__":
    for fn in (parte1, parte2, parte3, parte4):
        part, pts = fn()
        part.write(pts)
        print("ok parte", part.n)
