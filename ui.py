"""Quota Floater — cache-first always-on-top strip. English UI. No secrets."""
from __future__ import annotations

import ctypes
import json
import os
import subprocess
import sys
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import tkinter as tk
from tkinter import font as tkfont

ROOT = Path(__file__).resolve().parent
SNAPSHOT = ROOT / "snapshot.json"
SETTINGS = ROOT / "settings.json"
COLLECT = ROOT / "collect.js"
LOG = ROOT / "floater.log"
REFRESH_SEC = 60

BG = "#0a0a0a"
BG2 = "#111111"
FG = "#ffffff"
DIM = "#f5f5f5"
OK = "#7dffb3"
WARN = "#ffe066"
LOW = "#ff8585"
LINE = "#3a3a3a"


def read_json(path: Path):
    try:
        raw = path.read_bytes()
        if raw.startswith(b"\xef\xbb\xbf"):
            raw = raw[3:]
        return json.loads(raw.decode("utf-8"))
    except Exception:
        return None


def write_json(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, indent=2) + "\n", encoding="utf-8")


EDGE = 6
MIN_W = 220
MIN_H = 32
MIN_EXPANDED_H = 160
CLICK_SLOP = 6
DIAG_SLOP = 4
FONT_BASE = 10
FONT_MIN = 9
FONT_MAX = 14
FONT_FAMILY = "Segoe UI"
FONT_FAMILY_CJK = "Microsoft YaHei UI"
# tk pack pady is int-only. Adjacent cards add bottom+top.
# 9.3px gap → 5+4 = 9 (closer than 8 or 10)
CARD_PADY = (5, 4)

# Official DeepSeek API peak/off-peak. Fetched 2026-08-24 (static; do not scrape at runtime).
# ZH https://api-docs.deepseek.com/zh-cn/quick_start/pricing/
#   「高峰时段为北京时间周一至周五 9:00 - 12:00、14:00 - 18:00（其余为空闲时段）。」
# EN https://api-docs.deepseek.com/quick_start/pricing/
#   "Peak hours are 01:00 - 04:00 and 06:00 - 10:00 UTC, Monday through Friday (all other hours are off-peak)."
# In effect since 2026-08-17 00:00 CST: https://api-docs.deepseek.com/zh-cn/updates
# Sat–Sun (Beijing) are all-day off-peak — official "其余为空闲时段" / "all other hours".
_DS_TZ = timezone(timedelta(hours=8))  # Beijing CST, no DST
_DS_PEAK_CST = ((9, 0, 12, 0), (14, 0, 18, 0))  # Mon–Fri only
_DS_SWITCH_HM = ((9, 0), (12, 0), (14, 0), (18, 0))


def _enable_dpi_awareness() -> None:
    if sys.platform != "win32":
        return
    try:
        ctypes.windll.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
        return
    except Exception:
        pass
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
        return
    except Exception:
        pass
    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass


_enable_dpi_awareness()


def _int_or(value, default=None):
    try:
        n = int(value)
    except (TypeError, ValueError):
        return default
    return n if n > 0 else default


def _collapsed_h(value, default=None):
    n = _int_or(value)
    if not n or n >= MIN_EXPANDED_H:
        return default
    return n


def _font_px(value, default=FONT_BASE):
    try:
        n = int(round(float(value)))
    except (TypeError, ValueError):
        n = default
    return max(FONT_MIN, min(FONT_MAX, n))


def _id_list(value):
    if not isinstance(value, list):
        return []
    out = []
    for item in value:
        sid = str(item).strip()
        if sid and sid not in out:
            out.append(sid)
    return out


def load_settings() -> dict:
    data = read_json(SETTINGS) or {}
    return {
        "alwaysOnTop": bool(data.get("alwaysOnTop", True)),
        "collapsed": bool(data.get("collapsed", False)),
        "x": data.get("x"),
        "y": data.get("y"),
        "width": _int_or(data.get("width")),
        "height": _int_or(data.get("height")),
        "collapsedWidth": _int_or(data.get("collapsedWidth")),
        "collapsedHeight": _collapsed_h(data.get("collapsedHeight")),
        "providerOrder": _id_list(data.get("providerOrder")),
        "headerProvider": str(data.get("headerProvider") or "").strip(),
        "fontPx": _font_px(data.get("fontPx"), FONT_BASE),
    }


def save_settings(s: dict) -> None:
    write_json(SETTINGS, {
        "alwaysOnTop": bool(s.get("alwaysOnTop", True)),
        "collapsed": bool(s.get("collapsed", False)),
        "x": s.get("x"),
        "y": s.get("y"),
        "width": s.get("width"),
        "height": s.get("height"),
        "collapsedWidth": s.get("collapsedWidth"),
        "collapsedHeight": s.get("collapsedHeight"),
        "providerOrder": _id_list(s.get("providerOrder")),
        "headerProvider": str(s.get("headerProvider") or "").strip(),
        "fontPx": _font_px(s.get("fontPx"), FONT_BASE),
    })


def _pool_name(provider, window) -> str:
    pid = provider.get("id") or ""
    label = str(window.get("label") or "")
    if pid == "antigravity":
        if "Claude" in label or "GPT" in label:
            return "Claude/GPT"
        if "Gemini" in label:
            return "Gemini"
        return "Antigravity"
    if pid == "zai":
        return "GLM"
    return provider.get("name") or pid or "?"


def _window_tag(kind) -> str:
    if kind == "session":
        return "5h"
    if kind == "weekly":
        return "week"
    if kind in ("billing", "monthly"):
        return "month"
    return str(kind or "quota")


def pct_color(n):
    if n is None:
        return DIM
    if n <= 15:
        return LOW
    if n <= 35:
        return WARN
    return OK


def fmt_pct(n) -> str:
    if n is None:
        return "--"
    x = round(float(n), 1)
    if abs(x - round(x)) < 0.05:
        return f"{int(round(x))}%"
    return f"{x:.1f}%"


def window_remain(window):
    if not isinstance(window, dict):
        return None
    pct = window.get("remainPct")
    if isinstance(pct, (int, float)):
        return pct
    used, limit = window.get("used"), window.get("limit")
    if isinstance(used, (int, float)) and isinstance(limit, (int, float)) and limit > 0:
        return max(0.0, 100.0 - (used / limit) * 100.0)
    return None


def log(msg: str) -> None:
    try:
        with LOG.open("a", encoding="utf-8") as f:
            f.write(time.strftime("%Y-%m-%dT%H:%M:%S") + " " + msg + "\n")
    except Exception:
        pass


def snapshot_age_s():
    snap = read_json(SNAPSHOT) or {}
    ts = snap.get("updatedAt")
    if not isinstance(ts, str):
        return None
    try:
        # 2026-08-23T16:35:05.733Z
        raw = ts.replace("Z", "+00:00")
        dt = datetime.fromisoformat(raw)
        return max(0.0, time.time() - dt.timestamp())
    except Exception:
        return None


def fmt_reset(iso):
    if not iso:
        return ""
    try:
        raw = str(iso).replace("Z", "+00:00")
        dt = datetime.fromisoformat(raw)
        if dt.tzinfo is None:
            return ""
        local = dt.astimezone()
        return f"rst {local.strftime('%m-%d %H:%M')}"
    except Exception:
        return ""


def shows_deepseek_hint(provider) -> bool:
    pid = str((provider or {}).get("id") or "").strip().lower()
    name = str((provider or {}).get("name") or "").strip().lower()
    if pid in ("opencode", "deepseek"):
        return True
    return "deepseek" in pid or "deepseek" in name


def _ds_now(now=None):
    now = now or datetime.now().astimezone()
    if now.tzinfo is None:
        now = now.replace(tzinfo=_DS_TZ)
    return now.astimezone(_DS_TZ)


def deepseek_is_peak(now=None) -> bool:
    bj = _ds_now(now)
    if bj.weekday() >= 5:
        return False
    minutes = bj.hour * 60 + bj.minute
    for sh, sm, eh, em in _DS_PEAK_CST:
        if sh * 60 + sm <= minutes < eh * 60 + em:
            return True
    return False


def deepseek_next_switch(now=None):
    bj = _ds_now(now)
    cur = deepseek_is_peak(bj)
    for day_off in range(0, 8):
        day = bj + timedelta(days=day_off)
        if day.weekday() >= 5:
            continue
        for hour, minute in _DS_SWITCH_HM:
            t = day.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if t > bj and deepseek_is_peak(t) != cur:
                return t
    return None


def fmt_remain(seconds) -> str:
    if seconds is None or seconds < 60:
        return "<1m"
    minutes = int(seconds // 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours}h {minutes}m"
    return f"{minutes}m"


def deepseek_hint_line(now=None):
    now = now or datetime.now().astimezone()
    peak = deepseek_is_peak(now)
    label = "peak" if peak else "off-peak"
    nxt = deepseek_next_switch(now)
    if nxt:
        text = f"{label}  rst {fmt_remain((nxt - _ds_now(now)).total_seconds())}"
    else:
        text = label
    return text, (WARN if peak else OK)


class Floater:
    def __init__(self) -> None:
        self.settings = load_settings()
        self.snapshot = read_json(SNAPSHOT) or {"providers": [], "updatedAt": None}
        self.busy = False
        self._drag = None
        self._did_drag = False
        self._row_drag = None
        self._row_grab = False
        self._hdr_name = None
        self._hdr_tag = None
        self._hdr_pct = None
        self._hdr_rst = None
        self._hdr_sig = None

        self.root = tk.Tk()
        self.root.title("Quota Floater")
        self.root.configure(bg=BG)
        self.root.overrideredirect(True)
        self.root.attributes("-topmost", self.settings["alwaysOnTop"])
        self.root.attributes("-alpha", 0.77)
        names = set(tkfont.families(self.root))
        self._font_family = FONT_FAMILY if FONT_FAMILY in names else (
            FONT_FAMILY_CJK if FONT_FAMILY_CJK in names else FONT_FAMILY
        )

        self.wrap = tk.Frame(self.root, bg=BG, padx=8, pady=6)
        self.wrap.pack(fill="both", expand=True)
        self.body = tk.Frame(self.wrap, bg=BG)
        self.body.pack(fill="both", expand=True)

        self._place()
        self.render()
        self.root.after(80, self.refresh_bg)
        self.root.after(REFRESH_SEC * 1000, self._tick)

        for w in (self.root, self.wrap, self.body):
            w.bind("<ButtonPress-1>", self._start_drag)
            w.bind("<B1-Motion>", self._on_drag)
            w.bind("<ButtonRelease-1>", self._end_drag)
            w.bind("<Motion>", self._hover)
        self.root.bind_all("<Double-1>", self._on_double)

    def _usable_expanded_h(self, content_h: int) -> int:
        saved = self.settings.get("height")
        collapsed_h = self.settings.get("collapsedHeight") or MIN_H
        if not saved or saved < MIN_EXPANDED_H or abs(int(saved) - int(collapsed_h)) <= 8:
            return max(content_h, MIN_EXPANDED_H)
        return max(int(saved), MIN_EXPANDED_H)

    def _place(self) -> None:
        self.root.update_idletasks()
        if self.settings.get("collapsed"):
            w = self.settings.get("collapsedWidth") or 360
            h = self.settings.get("collapsedHeight") or 40
        else:
            w = self.settings.get("width") or 360
            h = self._usable_expanded_h(MIN_EXPANDED_H)
        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        x = self.settings.get("x")
        y = self.settings.get("y")
        if not isinstance(x, int) or x < 0 or x > sw - 40:
            x = sw - w - 24
        if not isinstance(y, int) or y < 0 or y > sh - 40:
            y = 24
        self.root.geometry(f"{int(w)}x{int(h)}+{int(x)}+{int(y)}")

    def _zone(self, e):
        x = e.x_root - self.root.winfo_rootx()
        y = e.y_root - self.root.winfo_rooty()
        w = self.root.winfo_width()
        h = self.root.winfo_height()
        left, right = x <= EDGE, x >= w - EDGE
        top, bottom = y <= EDGE, y >= h - EDGE
        if not (left or right or top or bottom):
            return None
        return (("n" if top else "s" if bottom else "") + ("w" if left else "e" if right else "")) or None

    def _hover(self, e):
        if self._drag:
            return
        zone = self._zone(e)
        cursors = {
            "n": "sb_v_double_arrow", "s": "sb_v_double_arrow",
            "e": "sb_h_double_arrow", "w": "sb_h_double_arrow",
            "ne": "size_ne_sw", "sw": "size_ne_sw",
            "nw": "size_nw_se", "se": "size_nw_se",
        }
        self.root.configure(cursor=cursors.get(zone, "arrow"))

    def _start_drag(self, e):
        self._did_drag = False
        self._drag = {
            "zone": self._zone(e),
            "x": e.x_root,
            "y": e.y_root,
            "ox": self.root.winfo_x(),
            "oy": self.root.winfo_y(),
            "ow": self.root.winfo_width(),
            "oh": self.root.winfo_height(),
            "font0": _font_px(self.settings.get("fontPx"), FONT_BASE),
        }

    def _on_drag(self, e):
        d = self._drag
        if not d:
            return
        dx, dy = e.x_root - d["x"], e.y_root - d["y"]
        if abs(dx) > CLICK_SLOP or abs(dy) > CLICK_SLOP:
            self._did_drag = True
        zone = d["zone"]
        if not zone:
            if self._did_drag:
                self.root.geometry(f"+{d['ox'] + dx}+{d['oy'] + dy}")
            return
        x, y, w, h = d["ox"], d["oy"], d["ow"], d["oh"]
        min_h = MIN_H if self.settings["collapsed"] else MIN_EXPANDED_H
        if "e" in zone:
            w = max(MIN_W, d["ow"] + dx)
        if "s" in zone:
            h = max(min_h, d["oh"] + dy)
        if "w" in zone:
            w = max(MIN_W, d["ow"] - dx)
            x = d["ox"] + d["ow"] - w
        if "n" in zone:
            h = max(min_h, d["oh"] - dy)
            y = d["oy"] + d["oh"] - h
        self.root.geometry(f"{w}x{h}+{x}+{y}")
        self._scale_font_if_diag(w, h, d)

    def _font(self, role="body", bold=False):
        px = _font_px(self.settings.get("fontPx"), FONT_BASE)
        extra = {"body": 0, "title": 1, "pct": 2}.get(role, 0)
        size = int(max(FONT_MIN, min(FONT_MAX, px + extra)))
        family = getattr(self, "_font_family", FONT_FAMILY)
        return (family, size, "bold")

    def _scale_font_if_diag(self, w, h, d):
        if not d or not d.get("zone"):
            return
        dw, dh = abs(int(w) - int(d["ow"])), abs(int(h) - int(d["oh"]))
        if dw <= DIAG_SLOP or dh <= DIAG_SLOP:
            return
        ow, oh = int(d["ow"]), int(d["oh"])
        if ow < 1 or oh < 1:
            return
        nxt = _font_px(d["font0"] * ((w / ow) * (h / oh)) ** 0.5)
        if nxt == self.settings.get("fontPx"):
            return
        self.settings["fontPx"] = nxt
        self.render(apply_size=False)

    def _card_boxes(self):
        return [c for c in self.body.pack_slaves() if getattr(c, "_qf_pid", None)]

    def _arm_row_grab(self):
        if self._row_grab:
            return
        self._row_grab = True
        self.root.bind_all("<B1-Motion>", self._on_row, add="+")
        self.root.bind_all("<ButtonRelease-1>", self._end_row, add="+")

    def _disarm_row_grab(self):
        if not self._row_grab:
            return
        self._row_grab = False
        self.root.unbind_all("<B1-Motion>")
        self.root.unbind_all("<ButtonRelease-1>")

    def _row_insert_at(self, box, y_root):
        others = [c for c in self._card_boxes() if c is not box]
        insert_at = len(others)
        for i, c in enumerate(others):
            mid = c.winfo_rooty() + c.winfo_height() / 2
            if y_root < mid:
                insert_at = i
                break
        return insert_at, others

    def _start_row(self, e):
        if self.settings.get("collapsed") or self._zone(e):
            return self._start_drag(e)
        w = e.widget
        box = None
        while w is not None:
            if getattr(w, "_qf_pid", None):
                box = w
                break
            w = getattr(w, "master", None)
        if not box:
            return
        self._drag = None
        self._did_drag = False
        self._row_drag = {
            "box": box,
            "x": e.x_root,
            "y": e.y_root,
            "moved": False,
            "at": None,
        }
        self._arm_row_grab()
        return "break"

    def _on_row(self, e):
        if self._drag:
            return self._on_drag(e)
        d = self._row_drag
        if not d:
            return
        if abs(e.x_root - d["x"]) > CLICK_SLOP or abs(e.y_root - d["y"]) > CLICK_SLOP:
            self._did_drag = True
            d["moved"] = True
        if not d["moved"]:
            return "break"
        insert_at, others = self._row_insert_at(d["box"], e.y_root)
        if d.get("at") == insert_at:
            return "break"
        d["at"] = insert_at
        box = d["box"]
        box.pack_forget()
        if insert_at >= len(others):
            box.pack(fill="x", pady=CARD_PADY)
        else:
            box.pack(fill="x", pady=CARD_PADY, before=others[insert_at])
        return "break"

    def _end_row(self, e):
        self._disarm_row_grab()
        if self._drag:
            return self._end_drag(e)
        d = self._row_drag
        self._row_drag = None
        if not d or not d.get("moved"):
            return "break"
        order = [c._qf_pid for c in self._card_boxes()]
        if order != self.settings.get("providerOrder"):
            self.settings["providerOrder"] = order
            save_settings(self.settings)
        return "break"

    def _end_drag(self, _e):
        d = self._drag
        if d and self._did_drag and d.get("zone"):
            self._scale_font_if_diag(self.root.winfo_width(), self.root.winfo_height(), d)
        self._drag = None
        if not d or not self._did_drag:
            return
        self.settings["x"] = self.root.winfo_x()
        self.settings["y"] = self.root.winfo_y()
        w, h = self.root.winfo_width(), self.root.winfo_height()
        if self.settings["collapsed"]:
            self.settings["collapsedWidth"] = w
            if h < MIN_EXPANDED_H:
                self.settings["collapsedHeight"] = h
        else:
            self.settings["width"] = w
            if h >= MIN_EXPANDED_H:
                self.settings["height"] = h
        save_settings(self.settings)

    def _on_double(self, e):
        if getattr(e.widget, "_qf_btn", False) or getattr(e.widget, "_qf_name", False):
            return "break"
        if self._did_drag:
            return "break"
        self.toggle()
        return "break"

    def providers(self):
        return list((self.snapshot or {}).get("providers") or [])

    def ordered_providers(self):
        rows = [p for p in self.providers() if p.get("id")]
        by_id = {p["id"]: p for p in rows}
        ids = list(by_id)
        saved = [i for i in (self.settings.get("providerOrder") or []) if i in by_id]
        rest = [i for i in ids if i not in saved]
        order = saved + rest
        if order != self.settings.get("providerOrder"):
            self.settings["providerOrder"] = order
            save_settings(self.settings)
        return [by_id[i] for i in order]

    def header_provider(self):
        rows = self.ordered_providers()
        if not rows:
            return None
        by_id = {p["id"]: p for p in rows}
        hid = str(self.settings.get("headerProvider") or "").strip()
        if hid not in by_id:
            hid = rows[0]["id"]
            if self.settings.get("headerProvider") != hid:
                self.settings["headerProvider"] = hid
                save_settings(self.settings)
        return by_id[hid]

    def header_hit(self):
        # Always from the current snapshot windows. headerProvider is an id only.
        p = self.header_provider()
        if not p:
            return None
        windows = list(p.get("windows") or [])
        picked = None
        for kinds in (("weekly",), ("billing", "monthly"), ("session",)):
            for w in windows:
                if w.get("kind") not in kinds:
                    continue
                if window_remain(w) is None:
                    continue
                picked = w
                break
            if picked:
                break
        if not picked:
            return {
                "name": p.get("name") or p.get("id") or "?",
                "tag": "",
                "remainPct": None,
                "resetsAt": None,
                "usage": p.get("usage"),
            }
        return {
            "name": _pool_name(p, picked),
            "tag": _window_tag(picked.get("kind")),
            "remainPct": window_remain(picked),
            "resetsAt": picked.get("resetsAt"),
            "usage": None,
        }

    def select_header(self, pid):
        pid = str(pid or "").strip()
        if not pid or pid == self.settings.get("headerProvider"):
            return
        self.settings["headerProvider"] = pid
        save_settings(self.settings)
        self.render()

    def render(self, apply_size: bool = True) -> None:
        for child in self.body.winfo_children():
            child.destroy()
        if self.settings["collapsed"]:
            self._render_collapsed()
        else:
            self._render_expanded()
        self.root.update_idletasks()
        if apply_size:
            self._apply_size()

    def _apply_size(self) -> None:
        content_w = max(self.body.winfo_reqwidth() + 16, MIN_W)
        content_h = self.body.winfo_reqheight() + 12
        if self.settings["collapsed"]:
            w = self.settings.get("collapsedWidth") or content_w
            bar_h = max(content_h, MIN_H)
            h = _collapsed_h(self.settings.get("collapsedHeight"), bar_h)
            h = max(int(h), MIN_H)
        else:
            w = self.settings.get("width") or max(content_w, 360)
            h = self._usable_expanded_h(content_h)
        x = self.root.winfo_x()
        y = self.root.winfo_y()
        self.root.geometry(f"{int(max(w, MIN_W))}x{int(h)}+{x}+{y}")

    def _bind_tree(self, widget, press, motion, release):
        widget.bind("<ButtonPress-1>", press, add="+")
        widget.bind("<B1-Motion>", motion, add="+")
        widget.bind("<ButtonRelease-1>", release, add="+")
        for child in widget.winfo_children():
            if getattr(child, "_qf_btn", False) or getattr(child, "_qf_name", False):
                continue
            self._bind_tree(child, press, motion, release)

    def _bar(self, parent):
        bar = tk.Frame(parent, bg=BG)
        bar._qf_bar = True
        bar.pack(fill="x")
        left = tk.Frame(bar, bg=BG)
        left.pack(side="left")
        self._hdr_name = tk.Label(left, text="", fg=FG, bg=BG, font=self._font("title", True))
        self._hdr_name.pack(side="left")
        self._hdr_tag = tk.Label(left, text="", fg=DIM, bg=BG, font=self._font())
        self._hdr_tag.pack(side="left", padx=(6, 0))
        self._hdr_pct = tk.Label(left, text="", fg=DIM, bg=BG, font=self._font("pct", True))
        self._hdr_pct.pack(side="left", padx=(6, 0))
        self._hdr_rst = tk.Label(left, text="", fg=DIM, bg=BG, font=self._font())
        self._fill_header()

        right = tk.Frame(bar, bg=BG)
        right._qf_btn = True
        right.pack(side="right")
        self._btn(right, "pin" if not self.settings["alwaysOnTop"] else "unpin", self.toggle_pin)
        self._btn(right, "sync" if not self.busy else "...", lambda: self.refresh_bg(force=True))
        self._btn(right, "min" if not self.settings["collapsed"] else "open", self.toggle)
        self._btn(right, "x", self.root.destroy)
        self._bind_tree(bar, self._start_drag, self._on_drag, self._end_drag)
        return bar

    def _header_alive(self) -> bool:
        w = self._hdr_pct
        try:
            return bool(w is not None and w.winfo_exists())
        except Exception:
            return False

    def _header_sig(self):
        p = self.header_provider()
        hit = self.header_hit()
        pid = (p or {}).get("id")
        if not hit:
            return (pid, None, None, None)
        return (pid, hit.get("tag"), hit.get("remainPct"), hit.get("resetsAt"))

    def _fill_header(self) -> None:
        if not self._header_alive():
            return
        hit = self.header_hit()
        if hit and hit.get("remainPct") is not None:
            fg = pct_color(hit["remainPct"])
            self._hdr_name.configure(text=hit["name"], fg=FG)
            self._hdr_tag.configure(text=hit.get("tag") or "", fg=DIM)
            self._hdr_pct.configure(text=fmt_pct(hit["remainPct"]), fg=fg, font=self._font("pct", True))
            rst = fmt_reset(hit.get("resetsAt"))
            if rst:
                self._hdr_rst.configure(text=rst, fg=fg)
                if not self._hdr_rst.winfo_ismapped():
                    self._hdr_rst.pack(side="left", padx=(6, 0))
            else:
                self._hdr_rst.pack_forget()
                self._hdr_rst.configure(text="")
        elif hit:
            self._hdr_name.configure(text=hit["name"], fg=FG)
            self._hdr_tag.configure(text="")
            self._hdr_pct.configure(text=hit.get("usage") or "no quota", fg=DIM, font=self._font())
            self._hdr_rst.pack_forget()
            self._hdr_rst.configure(text="")
        else:
            self._hdr_name.configure(text="no quota", fg=DIM)
            self._hdr_tag.configure(text="")
            self._hdr_pct.configure(text="")
            self._hdr_rst.pack_forget()
            self._hdr_rst.configure(text="")
        self._hdr_sig = self._header_sig()

    def _force_layered_paint(self) -> None:
        # Tk -alpha makes a WS_EX_LAYERED window. Same-size child updates
        # (collapsed bar) do not composite until alpha or size changes.
        try:
            self.root.update_idletasks()
            alpha = float(self.root.attributes("-alpha"))
        except Exception:
            return
        try:
            dip = 0.002
            nxt = max(0.05, alpha - dip) if alpha > 0.06 else min(1.0, alpha + dip)
            self.root.attributes("-alpha", nxt)
            self.root.update_idletasks()
            self.root.attributes("-alpha", alpha)
        except Exception:
            try:
                self.root.attributes("-alpha", alpha)
            except Exception:
                pass
        if sys.platform != "win32":
            return
        try:
            hwnd = int(self.root.winfo_id())
            parent = ctypes.windll.user32.GetParent(hwnd)
            ctypes.windll.user32.RedrawWindow(
                parent or hwnd,
                None,
                None,
                0x0001 | 0x0004 | 0x0080 | 0x0100,
            )
        except Exception:
            pass

    def _reload_header(self, reason: str, paint: bool) -> None:
        snap = read_json(SNAPSHOT)
        if snap:
            self.snapshot = snap
        sig = self._header_sig()
        changed = sig != self._hdr_sig
        if self.settings.get("collapsed") and self._header_alive():
            self._fill_header()
            if paint or changed:
                self._force_layered_paint()
        else:
            self.render()
            if self.settings.get("collapsed") and (paint or changed):
                self._force_layered_paint()
        if paint or changed:
            hit = self.header_hit()
            pct = "--" if not hit or hit.get("remainPct") is None else f"{hit['remainPct']:.1f}"
            tag = (hit or {}).get("tag") or "-"
            pid = (self.header_provider() or {}).get("id") or "?"
            log(f"header {pid} {tag} {pct} via={reason}")

    def _btn(self, parent, text, cmd):
        b = tk.Label(parent, text=text, fg=DIM, bg=BG, font=self._font(), padx=5, cursor="hand2")
        b._qf_btn = True
        b.pack(side="left")
        b.bind("<Button-1>", lambda e: cmd())
        b.bind("<Double-1>", lambda e: "break")
        return b

    def _render_collapsed(self):
        self._bar(self.body)

    def _render_expanded(self):
        self._bar(self.body)
        rows = self.providers()
        if not rows:
            tk.Label(self.body, text="Loading official quotas…", fg=DIM, bg=BG, font=self._font("title")).pack(anchor="w", pady=(8, 0))
            return
        for p in self.ordered_providers():
            self._row(p)

    def _row(self, p: dict) -> None:
        box = tk.Frame(self.body, bg=BG2, padx=8, pady=6)
        box._qf_pid = p.get("id")
        box.configure(cursor="fleur")
        box.pack(fill="x", pady=CARD_PADY)
        top = tk.Frame(box, bg=BG2)
        top.pack(fill="x")
        title = p.get("name") or p.get("id") or "?"
        plan = p.get("plan") or ""
        name = tk.Label(top, text=title, fg=FG, bg=BG2, font=self._font("title", True), cursor="hand2")
        name._qf_name = True
        name.pack(side="left")
        pid = p.get("id")
        name.bind("<Button-1>", lambda e, hid=pid: self.select_header(hid))
        if plan:
            tk.Label(top, text=plan, fg=DIM, bg=BG2, font=self._font()).pack(side="left", padx=(6, 0))
        low = p.get("lowestPct")
        tk.Label(
            top,
            text="--" if low is None else f"{low:.0f}%",
            fg=pct_color(low),
            bg=BG2,
            font=self._font("title", True),
        ).pack(side="right")

        if shows_deepseek_hint(p):
            hint, hint_fg = deepseek_hint_line()
            tk.Label(box, text=hint, fg=hint_fg, bg=BG2, font=self._font()).pack(anchor="w")

        if p.get("status") == "idle" or p.get("note"):
            tk.Label(box, text=p.get("note") or p.get("status"), fg=DIM, bg=BG2, font=self._font()).pack(anchor="w")

        wins = p.get("windows") or []
        for w in wins:
            pct = window_remain(w)
            line = tk.Frame(box, bg=BG2)
            line.pack(fill="x", pady=(4, 0))
            txt = f"{w.get('label') or w.get('kind')} {('--' if pct is None else f'{pct:.0f}%')}"
            rst = fmt_reset(w.get("resetsAt"))
            if rst:
                txt += f"  {rst}"
            tk.Label(line, text=txt, fg=pct_color(pct), bg=BG2, font=self._font()).pack(anchor="w")
            self._meter(box, pct)
        if p.get("usage"):
            tk.Label(box, text=p["usage"], fg=DIM, bg=BG2, font=self._font()).pack(anchor="w", pady=(2, 0))
        self._bind_tree(box, self._start_row, self._on_row, self._end_row)

    def _meter(self, parent, remain_pct) -> None:
        cv = tk.Canvas(parent, height=7, bg=LINE, highlightthickness=0, bd=0)
        cv.pack(fill="x", pady=(2, 0))

        def draw(_e=None):
            cv.delete("all")
            width = cv.winfo_width()
            if width < 2:
                return
            if remain_pct is None:
                return
            frac = max(0.0, min(100.0, float(remain_pct))) / 100.0
            fill_w = max(2, int(width * frac)) if frac > 0 else 0
            if fill_w:
                cv.create_rectangle(0, 0, fill_w, 7, fill=pct_color(remain_pct), outline="")

        cv.bind("<Configure>", draw)

    def toggle(self) -> None:
        self.settings["collapsed"] = not self.settings["collapsed"]
        save_settings(self.settings)
        log("toggle " + ("collapse" if self.settings["collapsed"] else "expand") + " collect=skip")
        self.render()

    def toggle_pin(self) -> None:
        self.settings["alwaysOnTop"] = not self.settings["alwaysOnTop"]
        self.root.attributes("-topmost", self.settings["alwaysOnTop"])
        save_settings(self.settings)
        self.render()

    def _tick(self) -> None:
        self.refresh_bg()
        self.root.after(REFRESH_SEC * 1000, self._tick)

    def refresh_bg(self, force: bool = False) -> None:
        if self.busy:
            return
        self._reload_header("poll", paint=False)
        age = snapshot_age_s()
        if not force and age is not None and age < REFRESH_SEC:
            log(f"collect skip age={age:.1f}s")
            return
        self.busy = True
        log("collect start" + (" force" if force else ""))

        def work():
            try:
                subprocess.run(
                    ["node", str(COLLECT)],
                    cwd=str(ROOT),
                    capture_output=True,
                    text=True,
                    timeout=45,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                )
            except Exception:
                pass
            snap = read_json(SNAPSHOT)
            self.root.after(0, lambda s=snap: self._apply(s))

        threading.Thread(target=work, daemon=True).start()

    def _apply(self, snap) -> None:
        if snap:
            self.snapshot = snap
        self.busy = False
        self._reload_header("collect", paint=True)

    def run(self) -> None:
        self.root.mainloop()


if __name__ == "__main__":
    Floater().run()
