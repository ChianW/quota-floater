"""Read local kimi-auth. Prints one JSON line. Never logs the token."""
from __future__ import annotations

import base64
import json
import os
import shutil
import sqlite3
import sys
import tempfile
import time

HOST_LIKE = "%kimi.com%"
NAME = "kimi-auth"


def emit(ok, source="", token="", reason=""):
    out = {"ok": bool(ok), "source": source}
    if ok:
        out["token"] = token
    else:
        out["reason"] = reason
    sys.stdout.write(json.dumps(out, ensure_ascii=True) + "\n")


def jwt_ok(token: str) -> bool:
    raw = (token or "").strip()
    if len(raw) < 16:
        return False
    parts = raw.split(".")
    if len(parts) != 3:
        return True
    try:
        pad = "=" * (-len(parts[1]) % 4)
        payload = json.loads(base64.urlsafe_b64decode(parts[1] + pad))
    except Exception:
        return False
    scope = str(payload.get("scope") or payload.get("scp") or "").strip()
    if scope == "kimi-code" or scope.startswith("kimi-code "):
        return False
    exp = payload.get("exp")
    if exp and time.time() >= float(exp):
        return False
    return True


def copy_db(src: str) -> str | None:
    if not src or not os.path.exists(src):
        return None
    td = tempfile.mkdtemp(prefix="qf-kimi-")
    dst = os.path.join(td, "Cookies")
    try:
        shutil.copy2(src, dst)
        return dst
    except Exception:
        pass
    try:
        import ctypes

        GENERIC_READ = 0x80000000
        FILE_SHARE_ALL = 0x7
        OPEN_EXISTING = 3
        FILE_ATTRIBUTE_NORMAL = 0x80
        CreateFileW = ctypes.windll.kernel32.CreateFileW
        CreateFileW.argtypes = [
            ctypes.c_wchar_p,
            ctypes.c_uint32,
            ctypes.c_uint32,
            ctypes.c_void_p,
            ctypes.c_uint32,
            ctypes.c_uint32,
            ctypes.c_void_p,
        ]
        CreateFileW.restype = ctypes.c_void_p
        handle = CreateFileW(src, GENERIC_READ, FILE_SHARE_ALL, None, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, None)
        if handle in (None, ctypes.c_void_p(-1).value):
            shutil.rmtree(td, ignore_errors=True)
            return None
        try:
            size = ctypes.c_longlong()
            if not ctypes.windll.kernel32.GetFileSizeEx(handle, ctypes.byref(size)):
                return None
            buf = ctypes.create_string_buffer(size.value)
            read = ctypes.c_uint32()
            if not ctypes.windll.kernel32.ReadFile(handle, buf, size.value, ctypes.byref(read), None):
                return None
            with open(dst, "wb") as f:
                f.write(buf.raw[: read.value])
            return dst
        finally:
            ctypes.windll.kernel32.CloseHandle(handle)
    except Exception:
        shutil.rmtree(td, ignore_errors=True)
        return None


def read_rows(db_path: str):
    con = sqlite3.connect(db_path)
    try:
        return con.execute(
            "SELECT value, encrypted_value, last_access_utc FROM cookies "
            "WHERE name=? AND host_key LIKE ? "
            "ORDER BY last_access_utc DESC",
            (NAME, HOST_LIKE),
        ).fetchall()
    finally:
        con.close()


def dpapi_unprotect(blob: bytes) -> bytes:
    import ctypes
    import ctypes.wintypes as w

    class DATA_BLOB(ctypes.Structure):
        _fields_ = [("cbData", w.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

    blob_in = DATA_BLOB(len(blob), ctypes.create_string_buffer(blob, len(blob)))
    blob_out = DATA_BLOB()
    if not ctypes.windll.crypt32.CryptUnprotectData(
        ctypes.byref(blob_in), None, None, None, None, 0, ctypes.byref(blob_out)
    ):
        raise OSError("dpapi")
    try:
        return ctypes.string_at(blob_out.pbData, blob_out.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(blob_out.pbData)


def browser_key(local_state: str) -> bytes | None:
    try:
        with open(local_state, encoding="utf-8") as f:
            data = json.load(f)
        enc = base64.b64decode((data.get("os_crypt") or {}).get("encrypted_key") or "")
        if enc.startswith(b"DPAPI"):
            enc = enc[5:]
        if not enc:
            return None
        return dpapi_unprotect(enc)
    except Exception:
        return None


def decrypt_v10(enc: bytes, key: bytes) -> str:
    if not enc or enc[:3] not in (b"v10", b"v11"):
        return ""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    return AESGCM(key).decrypt(enc[3:15], enc[15:], None).decode("utf-8")


def pick_from_store(cookies: str, local_state: str | None = None) -> str:
    dst = copy_db(cookies)
    if not dst:
        return ""
    td = os.path.dirname(dst)
    try:
        rows = read_rows(dst)
    except Exception:
        shutil.rmtree(td, ignore_errors=True)
        return ""
    key = browser_key(local_state) if local_state else None
    token = ""
    for value, enc, _ts in rows:
        raw = (value or "").strip()
        if jwt_ok(raw):
            token = raw
            break
        if key and enc:
            try:
                dec = decrypt_v10(enc, key).strip()
            except Exception:
                dec = ""
            if jwt_ok(dec):
                token = dec
                break
    shutil.rmtree(td, ignore_errors=True)
    return token


def main():
    appdata = os.environ.get("APPDATA") or ""
    local = os.environ.get("LOCALAPPDATA") or ""
    stores = [
        ("kimi-desktop", os.path.join(appdata, "kimi-desktop", "Network", "Cookies"), None),
        (
            "chrome",
            os.path.join(local, "Google", "Chrome", "User Data", "Default", "Network", "Cookies"),
            os.path.join(local, "Google", "Chrome", "User Data", "Local State"),
        ),
        (
            "edge",
            os.path.join(local, "Microsoft", "Edge", "User Data", "Default", "Network", "Cookies"),
            os.path.join(local, "Microsoft", "Edge", "User Data", "Local State"),
        ),
    ]
    last_reason = "not_found"
    for source, cookies, state in stores:
        if not os.path.exists(cookies):
            continue
        try:
            token = pick_from_store(cookies, state)
        except Exception:
            last_reason = "read_fail"
            continue
        if token:
            emit(True, source=source, token=token)
            return
        last_reason = f"{source}_unusable"
    emit(False, reason=last_reason)


if __name__ == "__main__":
    main()
