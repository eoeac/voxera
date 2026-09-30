"""Access control for the loopback service and its local assets."""
import secrets
from pathlib import Path

from fastapi import HTTPException, Request, Response
from starlette.responses import JSONResponse

SESSION_COOKIE = "voxera_session"
SESSION_TOKEN = secrets.token_urlsafe(32)
TRUSTED_ORIGINS = tuple(
    f"http://{host}:{port}"
    for host in ("127.0.0.1", "localhost")
    for port in (28840, 5173, 4173)
) + ("http://tauri.localhost", "tauri://localhost")


def contained_path(root: Path, value: str) -> Path:
    root = root.resolve()
    target = (root / value).resolve()
    if not target.is_relative_to(root):
        raise HTTPException(403, "Path is outside the application directory")
    return target


async def local_access_control(request: Request, call_next):
    if request.url.hostname not in {"127.0.0.1", "localhost", "::1"}:
        return JSONResponse({"detail": "Untrusted host"}, status_code=403)
    origin = request.headers.get("origin")
    if origin and origin not in TRUSTED_ORIGINS:
        return JSONResponse({"detail": "Untrusted origin"}, status_code=403)
    if request.headers.get("sec-fetch-site") == "cross-site":
        return JSONResponse({"detail": "Cross-site access is not allowed"}, status_code=403)
    protected = request.url.path.startswith(("/api/", "/static/audio"))
    public = request.url.path in {"/api/health", "/api/session"}
    if protected and not public and request.method != "OPTIONS":
        token = request.cookies.get(SESSION_COOKIE, "")
        if not secrets.compare_digest(token, SESSION_TOKEN):
            return JSONResponse({"detail": "Local session expired; reconnect to Voxera"}, status_code=401)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    if protected:
        response.headers["Cache-Control"] = "no-store"
    return response


def create_session(response: Response):
    response.set_cookie(SESSION_COOKIE, SESSION_TOKEN, httponly=True,
                        samesite="strict", path="/")
    return {"status": "connected"}
