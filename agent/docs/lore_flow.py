"""Lore's agent architecture, in the agent-flowchart house style.
YOU (green) | ON YOUR PHONE | LORE'S BACKEND | OUTSIDE MODELS (dashed). Every model is named on its node."""
import json, sys
N, E = [], []
def n(id, kind, x, y, w, h, name, **k): N.append(dict(id=id, kind=kind, x=x, y=y, w=w, h=h, name=name, **k))
def e(a, b, style="main", **k): E.append(dict(to=b, style=style, **{"from": a}, **k))
def mat(id, x, y, icons, name): n(id, "material", x + 25, y, 100, 58, name, icons=icons)
Y, P, B, O = 55, 330, 670, 1040          # left edge of the nodes in each lane

# while you talk: Apple's recogniser on the phone; each finished stretch is tidied by the backend
n("talk", "human", Y, 150, 230, 80, "Talk, add photos", what="tap or hold · camera · album")
n("live", "step", P, 140, 290, 100, "Show the words as you talk", n=1, tools="Apple speech recognition",
  what=["on the phone; it also", "saves the recording"])
n("tlive", "step", B, 140, 320, 100, "Tidy each finished stretch", n=2, tools="/tidy · DeepSeek V4 Flash", what=["at each pause, so the ums drop", "out while you are still talking"])
n("x_tg", "ext", O, 154, 240, 72, "Together AI", what="DeepSeek V4 Flash")
# when you stop: the whole recording, three backend nodes
n("stop", "human", Y, 278, 230, 76, "Stop", what="tap again, or let go")
mat("m_wav", 400, 300, ["mic"], "the recording")
n("stt", "step", B, 274, 320, 84, "Transcribe the recording", n=3, tools="OpenAI gpt-transcribe", what="the final words come from here")
n("x_oa", "ext", O, 284, 240, 64, "OpenAI", what="gpt-transcribe")
mat("m_raw", 755, 392, ["doc"], "raw words")
n("tidy", "step", B, 470, 320, 100, "Take out the stutter", n=4, tools="DeepSeek V4.1 Flash · code checks",
  what=["fillers, stutters, false starts", "check fails: Haiku 5.5, then rules"])
n("x_tg2", "ext", O, 470, 240, 260, "Together AI", what=["DeepSeek V4.1 Flash", "DeepSeek V4 Flash"])
n("fix", "step", B, 612, 320, 118, "Fix misheard words, grammar", n=5, tools="DeepSeek V4.1 Flash · code checks",
  what=["grammar: on unless you turn it off", "off: V4 Flash, misheard words only", "check fails: Haiku 5.5, then keep"])
mat("m_final", 400, 770, ["doc", "check"], "your words, saved here")
n("read", "human", Y, 766, 230, 80, "Read it, tap to edit", what="kept on this phone")
# when you lay out
n("lay", "human", Y, 900, 230, 76, "Tap Lay out", what="when you choose")
n("match", "step", P, 892, 290, 92, "Match photos to the words", n=6, tools="code · picture one · 照片一", what="where a sentence or clause starts")
n("tier", "decision", 395, 1026, 160, 64, "premium?")
n("free", "step", P, 1142, 290, 84, "Lay out the page", n=7, tools="code: words flow around photos")
n("dir", "step", B, 1136, 320, 96, "Direct the layout", n=8, tools="Claude Haiku 5.5 · code checks", what="title, quote, hero photo")
n("x_an2", "ext", O, 1144, 240, 88, "Anthropic", what=["Claude Haiku 5.5, also the", "fallback for 04 and 05"])
mat("m_page", 400, 1266, ["page", "image"], "today's page")
n("drag", "human", Y, 1258, 230, 88, "Drag photos in, edit", what=["or talk again; the", "words make room"])

e("talk", "live", "human", fs="r", ts="l")
e("live", "tlive", fs="r", ts="l")
e("tlive", "x_tg", "data", fs="r", ts="l")
e("tlive", "live", "data", fs="b", ts="b", pts=[[830, 256], [475, 256]], label="words without the ums", lx=560, ly=274)
e("stop", "m_wav", "human", fs="r", ts="l")
e("m_wav", "stt", fs="r", ts="l", label="WAV, 16 kHz", lx=548, ly=306)
e("stt", "x_oa", "data", fs="r", ts="l")
e("stt", "m_raw"); e("m_raw", "tidy"); e("tidy", "fix")
e("tidy", "x_tg2", "data", fs="r", ts="l", tdy=-80)
e("fix", "x_tg2", "data", fs="r", ts="l", tdy=71)
e("fix", "m_final", fs="l", ts="r", pts=[[600, 671], [600, 786]])
e("m_final", "read", "human", fs="l", ts="r")
e("read", "lay", "human")
e("lay", "match", "human", fs="r", ts="l")
e("match", "tier")
e("tier", "free", fs="b", ts="t", label="free", lx=484, ly=1116)
e("tier", "dir", fs="r", ts="t", label="premium", lx=600, ly=1048)
e("dir", "free", "data", fs="l", ts="r", label="spec", lx=636, ly=1176)
e("dir", "x_an2", "data", fs="r", ts="l")
e("free", "m_page")
e("m_page", "drag", "human", fs="l", ts="r")
e("drag", "talk", "learn", fs="l", ts="l", pts=[[46, 1302], [46, 186]], label="next recording", lx=54, ly=1230)

spec = {"template": "graph", "title": "Lore · how a day becomes a page",
        "subtitle": "Green is you. Numbered steps run on your phone or on Lore's backend; dashed boxes are outside models. "
                    "Five minutes of talk a day costs about $0.031 (free) or $0.032 (premium); three quarters of that is transcription.",
        "size": [1310, 1430], "groups": [
          {"x": 40, "y": 105, "w": 260, "h": 1260, "label": "YOU", "fill": "#F1F6F1"},
          {"x": 310, "y": 105, "w": 330, "h": 1260, "label": "ON YOUR PHONE", "fill": "#F7F5F0"},
          {"x": 650, "y": 105, "w": 360, "h": 1260, "label": "LORE'S BACKEND", "fill": "#F4F1EA"},
          {"x": 1020, "y": 105, "w": 280, "h": 1260, "label": "OUTSIDE MODELS", "fill": "#F3EEE3"}],
        "nodes": N, "edges": E}
json.dump(spec, open(sys.argv[1], "w"), ensure_ascii=False, indent=1)
