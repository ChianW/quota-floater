# Capture README/social assets for the floater: a PNG screenshot, an animated
# GIF, and an MP4 demo. Only the floater rectangle is ever recorded; a solid
# backdrop window sits behind it so the semi-transparent UI composites onto a
# clean dark surface. The floater is temporarily moved to the primary monitor
# and expanded; the user's settings.json is restored afterwards.
# Demo choreography: hold expanded -> drag a card to reorder -> collapse ->
# expand. MP4 needs ffmpeg on PATH.
# Usage: python scripts/capture-floater.py [--no-gif] [--no-mp4]
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


def drag_card(x, y, dy, steps=16, step_time=0.04, on_step=None):
    # Press on a card, slide it down/up by dy pixels, release. Tk reads the
    # motion events, so the cursor path must move in increments.
    ctypes.windll.user32.SetCursorPos(x, y)
    ctypes.windll.user32.mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
    time.sleep(0.2)
    for i in range(1, steps + 1):
        ctypes.windll.user32.SetCursorPos(x, y + int(dy * i / steps))
        time.sleep(step_time)
        if on_step:
            on_step()
    time.sleep(0.2)
    ctypes.windll.user32.mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)


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
    want_mp4 = "--no-mp4" not in sys.argv and bool(shutil.which("ffmpeg"))
    if "--no-mp4" not in sys.argv and not want_mp4:
        print("capture-floater: ffmpeg not on PATH, skipping mp4")
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

        if not (want_gif or want_mp4):
            return
        canvas_w, canvas_h = img.size
        # 631x1407 are both odd; yuv420p needs even dimensions.
        mp4 = os.path.join(out_dir, "floater.mp4")
        ffmpeg = None
        if want_mp4:
            ffmpeg = subprocess.Popen([
                "ffmpeg", "-y", "-loglevel", "error",
                "-f", "rawvideo", "-pix_fmt", "rgb24",
                "-s", f"{canvas_w}x{canvas_h}", "-r", "8", "-i", "pipe:0",
                "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
                "-pix_fmt", "yuv420p", mp4], stdin=subprocess.PIPE)

        stamped = []  # (seconds since t0, canvas)

        def stamp():
            r = wt.RECT()
            user32.GetWindowRect(hwnd, ctypes.byref(r))
            shot = grab((r.left, r.top, r.right, r.bottom))
            canvas = Image.new("RGB", (canvas_w, canvas_h), "#101216")
            canvas.paste(shot, (0, 0))
            stamped.append((time.time() - t0, canvas))

        t0 = time.time()
        dragged = False
        collapsed_once = False
        restored = False
        try:
            while time.time() - t0 < 10.5:
                stamp()
                r = wt.RECT()
                user32.GetWindowRect(hwnd, ctypes.byref(r))
                x1, y1w, w_cur = r.left, r.top, r.right - r.left
                elapsed = time.time() - t0
                if not dragged and elapsed > 1.5:
                    # Drag the first card down by roughly two card heights.
                    drag_card(x1 + int(w_cur * 0.25), y1w + 95, 330,
                              on_step=stamp)
                    dragged = True
                elif dragged and not collapsed_once and elapsed > 4.2:
                    collapsed_once = toggle_collapse(hwnd, x1, y1w, w_cur)
                elif collapsed_once and not restored and elapsed > 6.8:
                    # The collapsed strip lays its empty area out differently
                    # than the expanded title row; probe several spots.
                    for frac in (0.45, 0.55, 0.35, 0.65):
                        double_click(x1 + int(w_cur * frac), y1w + 8)
                        time.sleep(0.5)
                        rr = wt.RECT()
                        user32.GetWindowRect(hwnd, ctypes.byref(rr))
                        if rr.bottom - rr.top > 200:
                            restored = True
                            break
                    time.sleep(0.3)
                time.sleep(0.1)
        finally:
            if ffmpeg:
                # Hold-last resample onto a strict 8 fps timeline: blocking
                # interactions pause the capture, and each pause reads as the
                # screen holding still, which is what happened live.
                total = stamped[-1][0]
                idx = 0
                slot = 0.0
                while slot <= total:
                    while idx + 1 < len(stamped) and stamped[idx + 1][0] <= slot:
                        idx += 1
                    ffmpeg.stdin.write(stamped[idx][1].tobytes())
                    slot += 0.125
                ffmpeg.stdin.close()
                ffmpeg.wait(timeout=30)
        if want_gif:
            frames = [c for _, c in stamped]
            gif = os.path.join(out_dir, "floater.gif")
            frames[0].save(gif, save_all=True, append_images=frames[1:],
                           duration=380, loop=0)
            print("wrote", gif, len(frames), "frames")
        if want_mp4:
            print("wrote", mp4)
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
