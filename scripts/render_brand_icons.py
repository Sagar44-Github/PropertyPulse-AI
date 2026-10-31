"""Render the editable PropertyPulse SVG mark into PNG app-store icons using stdlib only."""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def chunk(kind: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)


def render(size: int, output: Path) -> None:
    pixels = bytearray(size * size * 4)
    scale = size / 128
    radius = 34 * scale

    def paint(x: int, y: int, color: tuple[int, int, int, int]) -> None:
        index = (y * size + x) * 4
        pixels[index:index + 4] = bytes(color)

    def line(start: tuple[float, float], end: tuple[float, float], width: float, color: tuple[int, int, int, int]) -> None:
        x1, y1 = start
        x2, y2 = end
        half = width / 2
        left = max(0, int(min(x1, x2) - half - 1))
        right = min(size, int(max(x1, x2) + half + 2))
        top = max(0, int(min(y1, y2) - half - 1))
        bottom = min(size, int(max(y1, y2) + half + 2))
        dx, dy = x2 - x1, y2 - y1
        denominator = dx * dx + dy * dy or 1
        for y in range(top, bottom):
            for x in range(left, right):
                projection = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / denominator))
                px, py = x1 + projection * dx, y1 + projection * dy
                if (x - px) ** 2 + (y - py) ** 2 <= half * half:
                    paint(x, y, color)

    background = (217, 232, 202, 255)
    dark = (36, 73, 59, 255)
    pulse = (56, 90, 66, 255)
    for y in range(size):
        for x in range(size):
            nearest_x = min(max(x, radius), size - radius)
            nearest_y = min(max(y, radius), size - radius)
            if (x - nearest_x) ** 2 + (y - nearest_y) ** 2 <= radius * radius:
                paint(x, y, background)

    point = lambda x, y: (x * scale, y * scale)
    mark_width = max(3.8, 6 * scale)
    line(point(28, 56), point(64, 27), mark_width, dark)
    line(point(64, 27), point(100, 56), mark_width, dark)
    line(point(38, 54), point(38, 101), mark_width, dark)
    line(point(90, 54), point(90, 101), mark_width, dark)
    line(point(38, 101), point(90, 101), mark_width, dark)
    pulse_width = max(3.2, 5 * scale)
    pulse_points = [(40, 76), (54, 76), (60, 64), (69, 90), (77, 73), (88, 73)]
    for first, second in zip(pulse_points, pulse_points[1:]):
        line(point(*first), point(*second), pulse_width, pulse)

    rows = b"".join(b"\0" + pixels[y * size * 4:(y + 1) * size * 4] for y in range(size))
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b"")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(png)


if __name__ == "__main__":
    render(1024, ROOT / "frontend" / "public" / "propertypulse-icon.png")
    render(180, ROOT / "frontend" / "public" / "apple-touch-icon.png")
