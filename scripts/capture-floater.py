# Capture README assets for the floater: a PNG screenshot and an animated GIF.
# Only the floater rectangle is ever recorded; a solid backdrop window sits
# behind it so the semi-transparent UI composites onto a clean dark surface.
# The floater is temporarily moved to the primary monitor and expanded; the
# user's settings.json is restored afterwards.
# Usage: python scripts/capture-floater.py [--no-gif]
import ctypes
import ctypes.wintypes as wt
import json
import os
import shutil
import subprocess
import sys
import time
import tkinter as tk

user32 = ctypes.windll.user32
user32.SetProcessDPIAware()
SW_SHOW = 5
MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004


def find_window(title, timeout=15.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        hwnd = user32.FindWindowW(None, title)
        if hwnd:
            rect = wt.RECT()
            user32.GetWindowRect(hwnd, ctypes.byref(rect))
            # Skip the pre-geometry Tk root (a ~17x13 phantom at startup).
            if rect.right - rect.left >= 200 and rect.bottom - rect.top >= 40:
                return hwnd, (rect.left, rect.top, rect.right, rect.bottom)
        time.sleep(0.3)
    return None, None


WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, wt.HWND, wt.LPARAM)


def kill_existing(title):
    # Stale floaters from an earlier crashed capture answer FindWindow first
    # and sit at the old geometry; kill them so a fresh instance wins.
    found = []

    def on_window(hwnd, _lparam):
        length = user32.GetWindowTextLengthW(hwnd)
        buf = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buf, length + 1)
        if buf.value == title:
            found.append(hwnd)
        return True

    user32.EnumWindows(WNDENUMPROC(on_window), 0)
    for hwnd in found:
        pid = wt.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if pid.value:
            subprocess.run(["taskkill", "/PID", str(pid.value), "/F"],
                           capture_output=True)
    for _ in range(10):
        if not user32.FindWindowW(None, title):
            return
        time.sleep(0.5)


def double_click(x, y):
    ctypes.windll.user32.SetCursorPos(x, y)
    for _ in range(2):
        ctypes.windll.user32.mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
        ctypes.windll.user32.mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
        time.sleep(0.08)


def toggle_collapse(hwnd, x1, y1, w):
    # Double-click an empty stretch of the title row (between the name label
    # on the left and the min/sync buttons on the right; neither toggles).
    for frac in (0.45, 0.55, 0.35):
        double_click(x1 + int(w * frac), y1 + 8)
        time.sleep(0.5)
        rect = wt.RECT()
        user32.GetWindowRect(hwnd, ctypes.byref(rect))
        if rect.bottom - rect.top < 100:  # collapsed strip
            return True
    return False


def main():
    want_gif = "--no-gif" not in sys.argv
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_dir = os.path.join(root_dir, "docs", "assets")
    os.makedirs(out_dir, exist_ok=True)
    settings_path = os.path.join(root_dir, "settings.json")
    kill_existing("Quota Floater")

    original_settings = None
    if os.path.exists(settings_path):
        with open(settings_path, encoding="utf-8") as fh:
            original_settings = fh.read()
        try:
            doc = json.loads(original_settings)
        except ValueError:
            doc = {}
        doc["collapsed"] = False
        doc["x"] = 80
        doc["y"] = 80
        with open(settings_path, "w", encoding="utf-8") as fh:
            json.dump(doc, fh, ensure_ascii=False)

    vx, vy, vw, vh = (user32.GetSystemMetrics(i) for i in (76, 77, 78, 79))
    backdrop = tk.Tk()
    backdrop.overrideredirect(True)
    backdrop.configure(bg="#101216")
    backdrop.geometry(f"{vw}x{vh}+{vx}+{vy}")
    backdrop.attributes("-topmost", True)
    backdrop.update_idletasks()
    user32.ShowWindow(backdrop.winfo_id(), SW_SHOW)
    backdrop.update()

    pythonw = shutil.which("pythonw") or sys.executable
    floater = subprocess.Popen([pythonw, os.path.join(root_dir, "ui.py")], cwd=root_dir)
    try:
        from PIL import Image, ImageGrab

        hwnd, rect = find_window("Quota Floater")
        if not hwnd:
            raise SystemExit("capture-floater: floater window not found")
        print("floater rect", rect)

        def grab(box):
            # The floater is a Win32 layered window; PIL excludes layered
            # windows from grabs unless asked, which yields a solid backdrop.
            return ImageGrab.grab(bbox=box, all_screens=True,
                                  include_layered_windows=True).convert("RGB")

        # The window exists before Tk paints it; wait for real content.
        img = None
        for _ in range(20):
            time.sleep(0.5)
            shot = grab(rect)
            extrema = shot.convert("L").getextrema()
            if extrema[1] - extrema[0] > 24:
                img = shot
                break
        if img is None:
            raise SystemExit("capture-floater: window never painted content")
        png = os.path.join(out_dir, "floater.png")
        img.save(png)
        print("wrote", png, img.size)

        if not want_gif:
            return
        frames = []
        canvas_w, canvas_h = img.size
        t0 = time.time()
        collapsed_once = False
        restored = False
        while time.time() - t0 < 8.0:
            r = wt.RECT()
            user32.GetWindowRect(hwnd, ctypes.byref(r))
            cur = (r.left, r.top, r.right, r.bottom)
            shot = grab(cur)
            canvas = Image.new("RGB", (canvas_w, canvas_h), "#101216")
            canvas.paste(shot, (0, 0))
            frames.append(canvas)
            elapsed = time.time() - t0
            if not collapsed_once and elapsed > 1.6:
                collapsed_once = toggle_collapse(hwnd, r.left, r.top, r.right - r.left)
            elif collapsed_once and not restored and elapsed > 5.2:
                double_click(r.left + int((r.right - r.left) * 0.45), r.top + 8)
                time.sleep(0.3)
                restored = True
            time.sleep(0.18)
        gif = os.path.join(out_dir, "floater.gif")
        frames[0].save(gif, save_all=True, append_images=frames[1:],
                       duration=380, loop=0)
        print("wrote", gif, len(frames), "frames")
    finally:
        floater.terminate()
        try:
            floater.wait(timeout=5)
        except subprocess.TimeoutExpired:
            floater.kill()
        backdrop.destroy()
        if original_settings is not None:
            with open(settings_path, "w", encoding="utf-8") as fh:
                fh.write(original_settings)


if __name__ == "__main__":
    main()
