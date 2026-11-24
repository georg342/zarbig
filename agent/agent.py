#!/usr/bin/env python3
"""zarbig-yt-agent: local download helper for the zarbig extractor page.

Serves a tiny JSON api on 127.0.0.1 so the static page can ask yt-dlp to save
the audio of youtube links. Stdlib only: the binaries it runs (yt-dlp, deno,
ffmpeg) are fetched by start.bat into the bin folder next to this file.
"""

import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

VERSION = "1.1.0"
AGENT_NAME = "zarbig-yt-agent"
HOST = "127.0.0.1"
PORT = 8787
MAX_ITEMS = 200
MAX_BODY = 64 * 1024
SESSION_ORIGIN = "https://georg342.github.io"
ALLOWED_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
}
DEFAULT_TIMEOUT = 300
DEFAULT_FOLDER = Path.home() / "Downloads" / "zarbig"
CREATE_NO_WINDOW = 0x08000000 if os.name == "nt" else 0
VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
PROGRESS = re.compile(r"\[download\]\s+(\d+(?:\.\d+)?)%")

BASE_DIR = Path(__file__).resolve().parent
BIN_DIR = BASE_DIR / "bin"
TOKEN = ""
JOB = None


# ==========================================
# VALIDATION
# ==========================================
def origin_allowed(origin):
    """Exact origin match for the pages site, any loopback port for local dev."""
    if not origin:
        return False
    if origin == SESSION_ORIGIN:
        return True
    return re.match(r"^http://(localhost|127\.0\.0\.1)(:\d+)?$", origin) is not None


def validate_url(raw):
    """Only youtube watch links leave this server; playlists are never sent."""
    if not isinstance(raw, str) or len(raw) > 300:
        return None
    try:
        parsed = urlparse(raw.strip())
    except ValueError:
        return None
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
        return None
    host = parsed.hostname
    if host == "youtu.be":
        video_id = parsed.path.lstrip("/")
    else:
        video_id = (parse_qs(parsed.query).get("v") or [""])[0]
    if not VIDEO_ID.match(video_id):
        return None
    return f"https://www.youtube.com/watch?v={video_id}"


def validate_folder(raw):
    """Absolute, writable, not a drive root, created on demand."""
    if not isinstance(raw, str) or not raw.strip() or len(raw) > 240:
        return None
    try:
        folder = Path(raw.strip()).expanduser()
    except (OSError, ValueError):
        return None
    if not folder.is_absolute():
        return None
    if folder.parent == folder:
        return None
    try:
        folder.mkdir(parents=True, exist_ok=True)
        probe = folder / ".zarbig-write-test"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
    except OSError:
        return None
    return folder


# ==========================================
# SMALL HELPERS
# ==========================================
def make_token():
    return secrets.token_urlsafe(24)


def copy_to_clipboard(text):
    """Best effort: clip.exe on windows, pbcopy/xclip elsewhere."""
    commands = []
    if os.name == "nt":
        commands.append(["clip"])
    else:
        commands.append(["pbcopy"])
        commands.append(["wl-copy"])
        commands.append(["xclip", "-selection", "clipboard"])
    for command in commands:
        if shutil.which(command[0]) is None:
            continue
        try:
            proc = subprocess.run(command, input=text, text=True, timeout=5,
                                  creationflags=CREATE_NO_WINDOW)
            if proc.returncode == 0:
                return True
        except (OSError, subprocess.SubprocessError):
            continue
    return False


def bin_path(name):
    local = BIN_DIR / name
    if local.exists():
        return str(local)
    return shutil.which(name.replace(".exe", "")) or name


def preflight():
    """Presence report used by /health and by the startup banner."""
    deps = {
        "ytdlp": (BIN_DIR / "yt-dlp.exe").exists() or shutil.which("yt-dlp") is not None,
        "deno": (BIN_DIR / "deno.exe").exists() or shutil.which("deno") is not None,
        "ffmpeg": (BIN_DIR / "ffmpeg.exe").exists() or shutil.which("ffmpeg") is not None,
    }
    return deps


def parse_progress(line):
    match = PROGRESS.search(line)
    if not match:
        return None
    try:
        return max(0.0, min(100.0, float(match.group(1))))
    except ValueError:
        return None


def is_archive_skip(line):
    low = line.lower()
    return "has already been recorded in the archive" in low or "has already been downloaded" in low


def read_print_file(path):
    """Last non empty line of --print-to-file after_move:filepath."""
    try:
        lines = [line.strip() for line in path.read_text(encoding="utf-8", errors="replace").splitlines()]
    except OSError:
        return None
    lines = [line for line in lines if line]
    return lines[-1] if lines else None


def cleanup_partial(folder):
    for pattern in ("*.part", "*.ytdl", "*.part-Frag*"):
        for item in folder.glob(pattern):
            try:
                item.unlink()
            except OSError:
                pass


# ==========================================
# YT-DLP
# ==========================================
def build_track_cmd(url, folder, cfg, print_file):
    """One process per track: mapping state/timeout/format to the ui stays trivial.

    --audio-format best keeps the source codec: opus when youtube serves opus,
    m4a when only aac exists, so nothing is reencoded without need.
    --print-to-file needs --no-simulate, otherwise yt-dlp only simulates.
    """
    cmd = [
        bin_path("yt-dlp.exe"),
        "--no-playlist",
        "-f", "bestaudio/best",
        "-x", "--audio-format", "best", "--audio-quality", "0",
        "--embed-metadata",
        "--embed-thumbnail",
        "--newline",
        "--no-mtime",
        "-P", str(folder),
        "-o", "%(artist,uploader)s - %(title)s.%(ext)s",
        "--windows-filenames",
        "--trim-filenames", "120",
        "--download-archive", str(folder / "archive.txt"),
        "--no-simulate",
        "--print-to-file", "after_move:filepath", str(print_file),
    ]
    if (BIN_DIR / "deno.exe").exists():
        cmd += ["--js-runtimes", f"deno:{BIN_DIR}"]
    if cfg.get("useCookies"):
        cmd += ["--cookies-from-browser", str(cfg.get("cookieBrowser") or "chrome")]
    cmd.append(url)
    return cmd


def download_track(index, item, folder, cfg, print_file):
    """Runs one yt-dlp process and returns the item result for the page."""
    try:
        print_file.unlink()
    except OSError:
        pass

    timeout = int(cfg.get("timeout") or DEFAULT_TIMEOUT)
    cmd = build_track_cmd(item["url"], folder, cfg, print_file)
    state = {"timeout": False}

    try:
        proc = subprocess.Popen(
            cmd,
            cwd=str(BASE_DIR),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            creationflags=CREATE_NO_WINDOW,
        )
    except OSError as exc:
        return {"state": "error", "error": f"could not start yt-dlp: {exc}"}

    def kill():
        state["timeout"] = True
        try:
            proc.kill()
        except OSError:
            pass

    JOB.set_proc(proc)
    timer = threading.Timer(timeout, kill)
    timer.daemon = True
    timer.start()

    errors = []
    skipped = False
    try:
        for raw in proc.stdout or []:
            line = raw.rstrip()
            if not line:
                continue
            percent = parse_progress(line)
            if percent is not None:
                JOB.progress(index, percent)
            if is_archive_skip(line):
                skipped = True
            if "error" in line.lower():
                errors.append(line[:300])
                if len(errors) > 5:
                    errors.pop(0)
    finally:
        timer.cancel()
        code = proc.wait()
        JOB.set_proc(None)

    filepath = read_print_file(print_file)
    if filepath and Path(filepath).is_file() and Path(filepath).stat().st_size > 1024:
        # the audio exists: a failed metadata/cover embed stays a warning
        return {"state": "done", "file": filepath,
                "ext": Path(filepath).suffix.lstrip(".").lower(), "error": None}

    if skipped:
        return {"state": "skipped", "file": None, "ext": None, "error": None}

    cleanup_partial(folder)
    if state["timeout"]:
        return {"state": "error", "error": f"timeout after {timeout}s"}
    return {"state": "error", "error": errors[-1] if errors else f"yt-dlp exit {code}"}


# ==========================================
# JOB (one download batch at a time)
# ==========================================
class Job:
    def __init__(self):
        self.lock = threading.Lock()
        self.job_id = None
        self.state = "idle"
        self.total = 0
        self.done = 0
        self.items = []
        self.cancel = False
        self.folder = None
        self.cfg = {}
        self.proc = None

    def start(self, entries, folder, cfg):
        with self.lock:
            if self.state == "running":
                return False
            self.job_id = uuid.uuid4().hex[:12]
            self.state = "running"
            self.total = len(entries)
            self.done = 0
            self.cancel = False
            self.folder = folder
            self.cfg = cfg
            self.items = [dict(entry, state="queued", ext=None, file=None,
                               error=None, progress=0) for entry in entries]
        threading.Thread(target=self._run, daemon=True).start()
        return True

    def _run(self):
        tmp = BASE_DIR / "print.txt"
        for index, item in enumerate(list(self.items)):
            if self.cancel:
                break
            self.mark(index, {"state": "downloading"})
            result = download_track(index, item, self.folder, self.cfg, tmp)
            self.mark(index, result)
            with self.lock:
                self.done += 1
        with self.lock:
            self.state = "cancelled" if self.cancel else "done"

    def mark(self, index, changes):
        with self.lock:
            if 0 <= index < len(self.items):
                self.items[index].update(changes)

    def progress(self, index, percent):
        with self.lock:
            if 0 <= index < len(self.items):
                self.items[index]["progress"] = round(percent, 1)

    def set_proc(self, proc):
        with self.lock:
            self.proc = proc

    def cancel_job(self):
        with self.lock:
            self.cancel = True
            proc = self.proc
        if proc is not None:
            try:
                proc.kill()
            except OSError:
                pass

    def snapshot(self):
        with self.lock:
            return {
                "jobId": self.job_id,
                "state": self.state,
                "done": self.done,
                "total": self.total,
                "items": [dict(item) for item in self.items],
            }


def clamp_int(value, low, high, fallback):
    try:
        number = int(value)
    except (TypeError, ValueError):
        return fallback
    return max(low, min(high, number))


# ==========================================
# HTTP API
# ==========================================
class Handler(BaseHTTPRequestHandler):
    server_version = f"{AGENT_NAME}/{VERSION}"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        return  # quiet: the console keeps the banner and job lines only

    def _cors(self):
        origin = self.headers.get("Origin") or ""
        if origin_allowed(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Headers", "content-type, x-token")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Max-Age", "600")

    def _json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _auth(self):
        provided = self.headers.get("X-Token") or ""
        if provided and secrets.compare_digest(provided, TOKEN):
            return True
        self._json(401, {"error": "invalid token"})
        return False

    def _body(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return None
        if length <= 0 or length > MAX_BODY:
            return None
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return None

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/health":
            return self._json(200, {
                "ok": True,
                "name": AGENT_NAME,
                "version": VERSION,
                "folder": str(DEFAULT_FOLDER),
                "deps": preflight(),
            })
        if path == "/status":
            if not self._auth():
                return None
            return self._json(200, JOB.snapshot())
        return self._json(404, {"error": "not found"})

    def do_POST(self):
        path = urlparse(self.path).path
        if not self._auth():
            return None
        if path == "/cancel":
            JOB.cancel_job()
            return self._json(200, {"cancelled": True})
        if path == "/delete":
            return self._delete()
        if path == "/folder/pick":
            chosen = pick_folder()
            if not chosen:
                return self._json(503, {"error": "dialog unavailable"})
            folder = validate_folder(chosen)
            if folder is None:
                return self._json(400, {"error": "invalid folder"})
            return self._json(200, {"folder": str(folder)})
        if path == "/download":
            return self._download()
        return self._json(404, {"error": "not found"})

    def _delete(self):
        """Retry cleanup: removes a file the agent saved, only inside the folder."""
        payload = self._body()
        if not isinstance(payload, dict):
            return self._json(400, {"error": "invalid json"})

        folder = validate_folder(payload.get("folder"))
        if folder is None:
            return self._json(400, {"error": "invalid folder"})

        raw = payload.get("file")
        if not isinstance(raw, str) or not raw:
            return self._json(400, {"error": "invalid file"})

        try:
            target = Path(raw).resolve()
            target.relative_to(folder.resolve())  # raises when outside the folder
        except (OSError, ValueError):
            return self._json(400, {"error": "file outside folder"})

        try:
            if target.is_file():
                target.unlink()
        except OSError as exc:
            return self._json(500, {"error": f"could not delete: {exc}"})

        print(f"[delete] {target}")
        return self._json(200, {"deleted": str(target)})

    def _download(self):
        payload = self._body()
        if not isinstance(payload, dict):
            return self._json(400, {"error": "invalid json"})

        folder = validate_folder(payload.get("folder"))
        if folder is None:
            return self._json(400, {"error": "invalid folder"})

        raw_items = payload.get("items")
        if not isinstance(raw_items, list) or not raw_items:
            return self._json(400, {"error": "no items"})
        if len(raw_items) > MAX_ITEMS:
            return self._json(400, {"error": "too many items"})

        entries = []
        for raw in raw_items:
            if not isinstance(raw, dict):
                return self._json(400, {"error": "invalid item"})
            url = validate_url(raw.get("url"))
            if url is None:
                return self._json(400, {"error": "invalid url"})
            entries.append({
                "num": int(raw.get("num") or 0),
                "url": url,
                "artist": str(raw.get("artist") or "")[:200],
                "title": str(raw.get("title") or "")[:200],
            })

        raw_cfg = payload.get("cfg") if isinstance(payload.get("cfg"), dict) else {}
        cfg = {
            "timeout": clamp_int(raw_cfg.get("timeout"), 60, 1800, DEFAULT_TIMEOUT),
            "useCookies": bool(raw_cfg.get("useCookies")),
            "cookieBrowser": str(raw_cfg.get("cookieBrowser") or "chrome")[:20],
        }

        if not JOB.start(entries, folder, cfg):
            return self._json(409, {"error": "job running"})

        print(f"[job] {JOB.job_id} started: {len(entries)} track(s) -> {folder}")
        return self._json(202, {"jobId": JOB.job_id, "total": JOB.total})


# ==========================================
# FOLDER DIALOG + STARTUP
# ==========================================
def pick_folder():
    """Native folder picker; empty string when tkinter is unavailable."""
    try:
        import tkinter as tk
        from tkinter import filedialog
    except Exception:
        return ""
    try:
        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        chosen = filedialog.askdirectory(title="zarbig: choose the download folder")
        root.destroy()
        return chosen or ""
    except Exception:
        return ""


def banner(token, deps):
    state = ", ".join(f"{name} {'ok' if ok else 'missing'}" for name, ok in deps.items())
    print("")
    print(f"  {AGENT_NAME} {VERSION}")
    print(f"  token:  {token}")
    print(f"  url:    http://{HOST}:{PORT}")
    print(f"  folder: {DEFAULT_FOLDER}")
    print(f"  deps:   {state}")
    print("  listening... (ctrl+c to stop)")
    print("")


def main():
    global TOKEN, JOB

    TOKEN = os.environ.get("ZARBIG_AGENT_TOKEN") or make_token()
    JOB = Job()
    deps = preflight()
    missing = [name for name, ok in deps.items() if not ok]
    if missing:
        print(f"[warn] missing: {', '.join(missing)} (run start.bat to download them)")

    if "--no-clipboard" not in sys.argv:
        copy_to_clipboard(TOKEN)

    try:
        server = ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError as exc:
        print(f"[error] could not listen on {HOST}:{PORT}: {exc}")
        print("        another agent may already be running.")
        return 1

    server.daemon_threads = True
    banner(TOKEN, deps)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopping...")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())




