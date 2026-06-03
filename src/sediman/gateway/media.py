"""Media caching and processing utilities for gateway platform adapters.

Provides file download, caching, and media type detection capabilities.
Adapted from Hermes Agent's platform media handling patterns.
"""
from __future__ import annotations

import hashlib
import magic  # python-magic
import os
import secrets
import struct
import tempfile
from pathlib import Path
from typing import Optional, Tuple

import httpx
import structlog

from sediman.config import DATA_DIR

logger = structlog.get_logger()

# Cache directory for media files
MEDIA_CACHE_DIR = DATA_DIR / "media_cache"
MEDIA_CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Default max file size (50 MB)
DEFAULT_MAX_SIZE_MB = 50

# MIME type mappings
_EXT_TO_MIME: dict[str, str] = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".heic": "image/heic",
    ".tiff": "image/tiff",
    ".ico": "image/x-icon",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".txt": "text/plain",
    ".zip": "application/zip",
    ".tar": "application/x-tar",
    ".gz": "application/gzip",
    ".mp3": "audio/mpeg",
    ".mp4": "video/mp4",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".webm": "video/webm",
    ".m4a": "audio/mp4",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".mkv": "video/x-matroska",
}


# ============ Utility Functions ============


def guess_mime_type(filename: str) -> str:
    """Guess MIME type based on file extension."""
    ext = os.path.splitext(filename)[-1].lower()
    return _EXT_TO_MIME.get(ext, "application/octet-stream")


def is_image(filename: str, mime_type: str = "") -> bool:
    """Check if file is an image type."""
    if mime_type.startswith("image/"):
        return True
    ext = os.path.splitext(filename)[-1].lower()
    return ext in {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".heic", ".tiff", ".ico"}


def is_video(filename: str, mime_type: str = "") -> bool:
    """Check if file is a video type."""
    if mime_type.startswith("video/"):
        return True
    ext = os.path.splitext(filename)[-1].lower()
    return ext in {".mp4", ".webm", ".mov", ".avi", ".mkv"}


def is_audio(filename: str, mime_type: str = "") -> bool:
    """Check if file is an audio type."""
    if mime_type.startswith("audio/"):
        return True
    ext = os.path.splitext(filename)[-1].lower()
    return ext in {".mp3", ".wav", ".ogg", ".m4a", ".flac"}


def md5_hex(data: bytes) -> str:
    """Calculate MD5 hex digest."""
    return hashlib.md5(data).hexdigest()


def generate_file_id() -> str:
    """Generate random file ID (32 hex characters)."""
    return secrets.token_hex(16)


def get_cache_path(file_hash: str, ext: str = "") -> Path:
    """Get cache file path for a given hash and extension."""
    # Use first 2 chars as subdirectory for better performance
    subdir = file_hash[:2]
    cache_dir = MEDIA_CACHE_DIR / subdir
    cache_dir.mkdir(parents=True, exist_ok=True)

    if ext:
        return cache_dir / f"{file_hash}{ext}"
    return cache_dir / file_hash


# ============ Image Size Parsing (Pure Python) ============


def parse_image_size(data: bytes) -> Optional[dict[str, int]]:
    """Parse image dimensions (supports JPEG/PNG/GIF/WebP), no external deps.

    Returns {"width": w, "height": h} or None if unable to parse.
    """
    return (
        _parse_png_size(data)
        or _parse_jpeg_size(data)
        or _parse_gif_size(data)
        or _parse_webp_size(data)
    )


def _parse_png_size(buf: bytes) -> Optional[dict[str, int]]:
    """Parse PNG image dimensions."""
    if len(buf) < 24:
        return None
    if buf[:4] != b"\x89PNG":
        return None
    w = struct.unpack(">I", buf[16:20])[0]
    h = struct.unpack(">I", buf[20:24])[0]
    return {"width": w, "height": h}


def _parse_jpeg_size(buf: bytes) -> Optional[dict[str, int]]:
    """Parse JPEG image dimensions."""
    if len(buf) < 4 or buf[0] != 0xFF or buf[1] != 0xD8:
        return None
    i = 2
    while i < len(buf) - 9:
        if buf[i] != 0xFF:
            i += 1
            continue
        marker = buf[i + 1]
        if marker in {0xC0, 0xC2}:
            h = struct.unpack(">H", buf[i + 5: i + 7])[0]
            w = struct.unpack(">H", buf[i + 7: i + 9])[0]
            return {"width": w, "height": h}
        if i + 3 < len(buf):
            i += 2 + struct.unpack(">H", buf[i + 2: i + 4])[0]
        else:
            break
    return None


def _parse_gif_size(buf: bytes) -> Optional[dict[str, int]]:
    """Parse GIF image dimensions."""
    if len(buf) < 10:
        return None
    sig = buf[:6].decode("ascii", errors="replace")
    if sig not in {"GIF87a", "GIF89a"}:
        return None
    w = struct.unpack("<H", buf[6:8])[0]
    h = struct.unpack("<H", buf[8:10])[0]
    return {"width": w, "height": h}


def _parse_webp_size(buf: bytes) -> Optional[dict[str, int]]:
    """Parse WebP image dimensions."""
    if len(buf) < 16:
        return None
    if buf[:4] != b"RIFF" or buf[8:12] != b"WEBP":
        return None
    chunk = buf[12:16].decode("ascii", errors="replace")
    if chunk == "VP8 ":
        if len(buf) >= 30 and buf[23] == 0x9D and buf[24] == 0x01 and buf[25] == 0x2A:
            w = struct.unpack("<H", buf[26:28])[0] & 0x3FFF
            h = struct.unpack("<H", buf[28:30])[0] & 0x3FFF
            return {"width": w, "height": h}
    elif chunk == "VP8L":
        if len(buf) >= 25 and buf[20] == 0x2F:
            bits = struct.unpack("<I", buf[21:25])[0]
            w = (bits & 0x3FFF) + 1
            h = ((bits >> 14) & 0x3FFF) + 1
            return {"width": w, "height": h}
    elif chunk == "VP8X":
        if len(buf) >= 30:
            w = (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1
            h = (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1
            return {"width": w, "height": h}
    return None


# ============ URL Download ============


async def download_url(
    url: str,
    max_size_mb: int = DEFAULT_MAX_SIZE_MB,
    timeout: float = 30.0,
) -> Tuple[bytes, str]:
    """Download URL content, returns (data_bytes, content_type).

    Args:
        url: HTTP(S) URL to download
        max_size_mb: Maximum file size in MB
        timeout: Request timeout in seconds

    Returns:
        Tuple of (data_bytes, content_type)

    Raises:
        ValueError: Content exceeds size limit
        httpx.HTTPError: Network/HTTP error
    """
    max_bytes = max_size_mb * 1024 * 1024

    # SSRF protection: only allow HTTP/HTTPS
    if not url.startswith(("http://", "https://")):
        raise ValueError(f"Invalid URL scheme: {url}")

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        # First check size with HEAD
        try:
            head = await client.head(url)
            content_length = int(head.headers.get("content-length", 0) or 0)
            if content_length > 0 and content_length > max_bytes:
                raise ValueError(
                    f"File too large: {content_length / 1024 / 1024:.1f} MB > {max_size_mb} MB"
                )
        except httpx.HTTPStatusError:
            pass  # Some servers don't support HEAD, ignore

        # GET download (streamed to prevent exceeding limit)
        async with client.stream("GET", url) as resp:
            resp.raise_for_status()

            content_type = resp.headers.get("content-type", "").split(";")[0].strip()

            chunks: list[bytes] = []
            downloaded = 0
            async for chunk in resp.aiter_bytes(65536):
                downloaded += len(chunk)
                if downloaded > max_bytes:
                    raise ValueError(
                        f"File too large: exceeds {max_size_mb} MB limit"
                    )
                chunks.append(chunk)

        data = b"".join(chunks)
        return data, content_type


# ============ Media Caching ============


async def cache_image_from_url(
    url: str,
    ext: str = "",
    max_size_mb: int = DEFAULT_MAX_SIZE_MB,
) -> dict[str, any]:
    """Download and cache an image from URL.

    Args:
        url: Image URL to download
        ext: Optional file extension
        max_size_mb: Maximum file size in MB

    Returns:
        Dict with keys: path, url, uuid, size, width, height, mime_type
    """
    data, content_type = await download_url(url, max_size_mb)

    # Validate it's actually an image
    if not content_type.startswith("image/"):
        # Try to detect from magic bytes
        try:
            detected = magic.from_buffer(data, mime=True)
            if detected.startswith("image/"):
                content_type = detected
            else:
                raise ValueError(f"Invalid image type: {detected}")
        except Exception as e:
            raise ValueError(f"Failed to validate image type: {e}")

    return await cache_image_from_bytes(data, ext or _guess_ext_from_mime(content_type))


async def cache_image_from_bytes(
    data: bytes,
    ext: str = "",
) -> dict[str, any]:
    """Cache image data from bytes.

    Args:
        data: Image bytes
        ext: Optional file extension

    Returns:
        Dict with keys: path, url, uuid, size, width, height, mime_type
    """
    file_hash = md5_hex(data)
    mime_type = _detect_mime_from_bytes(data)

    if not ext:
        ext = _guess_ext_from_mime(mime_type)

    cache_path = get_cache_path(file_hash, ext)

    # If not already cached, write to disk
    if not cache_path.exists():
        with open(cache_path, "wb") as f:
            f.write(data)

    # Parse image size
    size_info = parse_image_size(data)

    return {
        "path": str(cache_path),
        "url": f"file://{cache_path}",
        "uuid": file_hash,
        "size": len(data),
        "width": size_info.get("width", 0) if size_info else 0,
        "height": size_info.get("height", 0) if size_info else 0,
        "mime_type": mime_type,
    }


async def cache_document_from_bytes(
    data: bytes,
    filename: str,
) -> dict[str, any]:
    """Cache document data from bytes.

    Args:
        data: Document bytes
        filename: Original filename

    Returns:
        Dict with keys: path, url, uuid, size, mime_type, filename
    """
    file_hash = md5_hex(data)
    ext = os.path.splitext(filename)[1].lower()
    mime_type = guess_mime_type(filename)

    cache_path = get_cache_path(file_hash, ext)

    # If not already cached, write to disk
    if not cache_path.exists():
        with open(cache_path, "wb") as f:
            f.write(data)

    return {
        "path": str(cache_path),
        "url": f"file://{cache_path}",
        "uuid": file_hash,
        "size": len(data),
        "mime_type": mime_type,
        "filename": filename,
    }


async def cache_audio_from_bytes(
    data: bytes,
    ext: str = ".mp3",
) -> dict[str, any]:
    """Cache audio data from bytes.

    Args:
        data: Audio bytes
        ext: File extension

    Returns:
        Dict with keys: path, url, uuid, size, mime_type
    """
    file_hash = md5_hex(data)
    mime_type = guess_mime_type(f"audio{ext}")

    cache_path = get_cache_path(file_hash, ext)

    if not cache_path.exists():
        with open(cache_path, "wb") as f:
            f.write(data)

    return {
        "path": str(cache_path),
        "url": f"file://{cache_path}",
        "uuid": file_hash,
        "size": len(data),
        "mime_type": mime_type,
    }


async def cache_video_from_bytes(
    data: bytes,
    ext: str = ".mp4",
) -> dict[str, any]:
    """Cache video data from bytes.

    Args:
        data: Video bytes
        ext: File extension

    Returns:
        Dict with keys: path, url, uuid, size, mime_type
    """
    file_hash = md5_hex(data)
    mime_type = guess_mime_type(f"video{ext}")

    cache_path = get_cache_path(file_hash, ext)

    if not cache_path.exists():
        with open(cache_path, "wb") as f:
            f.write(data)

    return {
        "path": str(cache_path),
        "url": f"file://{cache_path}",
        "uuid": file_hash,
        "size": len(data),
        "mime_type": mime_type,
    }


# ============ Internal Helpers ============


def _detect_mime_from_bytes(data: bytes) -> str:
    """Detect MIME type from bytes using python-magic."""
    try:
        return magic.from_buffer(data, mime=True)
    except Exception:
        return "application/octet-stream"


def _guess_ext_from_mime(mime_type: str) -> str:
    """Guess file extension from MIME type."""
    for ext, mt in _EXT_TO_MIME.items():
        if mt == mime_type:
            return ext
    return ""
