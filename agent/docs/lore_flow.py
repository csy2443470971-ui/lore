"""Lore's agent architecture, in the agent-flowchart house style. YOU (green) | AGENT (white) | OUTSIDE (dashed)."""
import json, sys
N, E = [], []
def n(id, kind, x, y, w, h, name, **k): N.append(dict(id=id, kind=kind, x=x, y=y, w=w, h=h, name=name, **k))
def e(a, b, style="main", **k): E.append(dict(to=b, style=style, **{"from": a}, **k))
def mat(id, x, y, icons, name): n(id, "material", x + 25, y, 100, 58, name, icons=icons)
A, Y, O = 455, 70, 960
n("talk", "human", Y, 140, 250, 80, "Talk, add photos", what="tap or hold · camera · album")
mat("m_rec", 515, 142, ["mic", "image"], "voice, photos")
n("stt", "step", 440, 230, 300, 76, "Transcribe the recording", n=1, tools="Worker · gpt-transcribe")
n("x_stt", "ext", O, 236, 210, 64, "OpenAI", what="gpt-transcribe")
mat("m_raw", 515, 326, ["doc"], "raw words")
n("tidy", "step", 440, 410, 300, 76, "Take out the stutter", n=2, tools="DeepSeek V4 Flash")
n("x_ds", "ext", O, 416, 210, 64, "Together AI", what="DeepSeek V4 Flash")
n("ok", "decision", 500, 512, 180, 68, "checks\npass?")
n("retry", "step", 735, 516, 175, 60, "Try another model", tools="Claude Haiku 5.5")
n("x_cl", "ext", O, 600, 210, 64, "Anthropic", what="Claude Haiku 5.5")
n("rules", "end", 800, 640, 110, 40, "rules", tone="fail")
mat("m_tidy", 515, 620, ["doc", "check"], "own words, no ums")
n("read", "human", Y, 700, 250, 76, "Read it on Today", what="no layout until you ask")
n("lay", "human", Y, 820, 250, 76, "Tap Lay out", what="when you choose")
n("match", "step", 430, 820, 320, 76, "Match photos to sentences", n=3, tools="code · 一号是… · no. 1 is…")
n("tier", "decision", 500, 926, 180, 68, "premium?")
n("free", "step", 370, 1040, 255, 76, "Lay out the page", n=4, tools="code, no model")
n("dir", "step", 650, 1040, 260, 76, "Direct the layout", n=5, tools="Haiku 5.5 · code checks")
n("x_cl2", "ext", O, 1046, 210, 64, "Anthropic", what="title · quote · hero")
mat("m_page", 515, 1150, ["page", "image"], "today's page")
n("drag", "human", Y, 1150, 250, 76, "Drag photos, talk again", what="the words make room")
e("talk", "m_rec", fs="r", ts="l"); e("m_rec", "stt"); e("stt", "x_stt", "data", fs="r", ts="l", label="audio")
e("stt", "m_raw"); e("m_raw", "tidy"); e("tidy", "x_ds", "data", fs="r", ts="l", label="text")
e("tidy", "ok")
e("ok", "retry", "retry", fs="r", ts="l", label="no")
e("retry", "x_cl", "data", fs="r", ts="l")
e("retry", "rules", "fail", fs="b", ts="t", fdx=32, label="still no", lx=870, ly=604)
e("retry", "m_tidy", "retry", fs="b", ts="r", fdx=-55, pts=[[767, 649]], label="pass", lx=690, ly=640)
e("ok", "m_tidy", label="yes", lx=600, ly=616)
e("m_tidy", "read", "human", fs="l", ts="r")
e("read", "lay", "human")
e("lay", "match", "human", fs="r", ts="l")
e("match", "tier")
e("tier", "free", fs="l", ts="t", label="free", lx=420, ly=954)
e("tier", "dir", fs="r", ts="t", label="premium", lx=700, ly=954)
e("dir", "x_cl2", "data", fs="r", ts="l")
e("dir", "free", "data", fs="l", ts="r", label="spec", lx=628, ly=1066)
e("free", "m_page", fs="b", ts="t", pts=[[497, 1136], [590, 1136]])
e("m_page", "drag", "human", fs="l", ts="r")
e("drag", "talk", "learn", fs="l", ts="l", pts=[[52, 1188], [52, 180]], label="next recording", lx=60, ly=1110)
spec = {"template": "graph", "title": "Lore · how a day becomes a page",
        "subtitle": "Green is you. White is Lore. Dashed is outside models. A day with 5 minutes of talk costs about $0.024 (free) or $0.025 (premium).",
        "size": [1200, 1270], "groups": [
          {"x": 40, "y": 105, "w": 310, "h": 1145, "label": "YOU", "fill": "#F1F6F1"},
          {"x": 360, "y": 105, "w": 560, "h": 1145, "label": "LORE", "fill": "#F7F5F0"},
          {"x": 930, "y": 105, "w": 250, "h": 1145, "label": "OUTSIDE MODELS", "fill": "#F3EEE3"}],
        "nodes": N, "edges": E}
json.dump(spec, open(sys.argv[1], "w"), ensure_ascii=False, indent=1)
