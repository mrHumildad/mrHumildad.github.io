#!/usr/bin/env python3
"""Renders the static telemetry fallback from stats.json.

The homepage shows this image when the live `stats.json` fetch fails (or when
JavaScript is off). The daily stats workflow re-renders it so the snapshot
never lies for long.

    python3 scripts/render-stats-fallback.py

Needs Pillow and DejaVu fonts (both present on ubuntu-latest runners).
"""

import json
import pathlib
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "stats.json"
OUT = ROOT / "assets" / "img" / "stats-fallback.png"

S = 2  # render at 2x for retina, displayed at 1160x470
W, H = 1160, 470

BG = (13, 16, 10)
PANEL = (17, 21, 13)
PANEL_2 = (23, 28, 18)
LINE = (42, 50, 32)
CHALK = (240, 244, 230)
MUTED = (159, 174, 141)
ACID = (201, 242, 74)
CELLS = [(28, 35, 24), (56, 73, 31), (95, 125, 36), (143, 181, 47), (201, 242, 74)]

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def load_font(name, size):
    for base in (pathlib.Path("/usr/share/fonts/truetype/dejavu"), pathlib.Path("/usr/share/fonts")):
        candidate = base / name
        if candidate.exists():
            return ImageFont.truetype(str(candidate), int(size * S))
    return ImageFont.load_default()


def mono(size):
    return load_font("DejaVuSansMono.ttf", size)


def mono_bold(size):
    return load_font("DejaVuSansMono-Bold.ttf", size)


def sans_bold(size):
    return load_font("DejaVuSans-Bold.ttf", size)


def compact(n):
    return f"{n:,}"


def stamp(iso):
    try:
        from datetime import datetime

        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return f"{dt.day} {MONTHS[dt.month - 1]} {dt.year}"
    except Exception:
        return "unknown date"


def main():
    if not DATA.exists():
        sys.exit("stats.json not found — run scripts/fetch-stats.mjs first")

    stats = json.loads(DATA.read_text(encoding="utf-8"))
    contributions = stats.get("contributions") or {}
    weeks = contributions.get("weeks") or []
    total = contributions.get("total")
    streak = (stats.get("longest_streak") or {}).get("days")
    languages = stats.get("top_languages") or []
    rendered = stamp(stats.get("generated_at", ""))

    img = Image.new("RGB", (W * S, H * S), BG)
    draw = ImageDraw.Draw(img)

    def text(x, y, value, font, fill, anchor="lt"):
        draw.text((x * S, y * S), str(value), font=font, fill=fill, anchor=anchor)

    def box(x0, y0, x1, y1, radius=12, fill=PANEL, outline=LINE, width=1):
        draw.rounded_rectangle(
            [x0 * S, y0 * S, x1 * S, y1 * S],
            radius=radius * S,
            fill=fill,
            outline=outline,
            width=max(1, int(width * S)),
        )

    draw.rectangle([0, 0, W * S - 1, H * S - 1], outline=LINE, width=S)

    # header
    text(32, 24, "GITHUB TELEMETRY", mono(13), ACID)
    text(1128, 26, f"mrHumildad · {rendered}", mono(11), MUTED, "rt")
    draw.line([32 * S, 60 * S, 1128 * S, 60 * S], fill=LINE, width=S)

    # stat tiles
    tiles = [
        ("PUBLIC REPOSITORIES", compact(stats.get("public_repos", 0))),
        ("STARS", compact(stats.get("stars", 0))),
        ("FOLLOWERS", compact(stats.get("followers", 0))),
        ("CONTRIBUTIONS (12 MO)", compact(total) if total is not None else "n/a"),
        ("LONGEST STREAK", f"{streak} d" if streak else "n/a"),
    ]

    gap = 12
    tile_w = (1128 - 32 - gap * (len(tiles) - 1)) / len(tiles)
    for i, (label, value) in enumerate(tiles):
        x = 32 + i * (tile_w + gap)
        featured = i == 3
        box(x, 78, x + tile_w, 188, radius=12, outline=ACID if featured else LINE)
        text(x + 14, 92, label, mono(9.6), MUTED)
        text(x + 14, 126, value, sans_bold(30), CHALK)
        if featured:
            draw.ellipse(
                [(x + tile_w - 18) * S, 90 * S, (x + tile_w - 11) * S, 97 * S],
                fill=ACID,
            )

    # contribution grid
    text(32, 208, "CONTRIBUTIONS · LAST 12 MONTHS", mono(10), MUTED)
    cell, cell_gap = 12, 3
    grid_x, grid_y = 32, 232
    unit = max([n for week in weeks for n in week] or [1]) or 1

    for week_index, week in enumerate(weeks):
        for day_index, count in enumerate(week):
            level = 0 if not count else min(4, max(1, -(-count * 4 // unit)))
            x = grid_x + week_index * (cell + cell_gap)
            y = grid_y + day_index * (cell + cell_gap)
            draw.rounded_rectangle(
                [x * S, y * S, (x + cell) * S, (y + cell) * S],
                radius=2 * S,
                fill=CELLS[level],
            )

    total_label = f"total {compact(total)} contributions" if total is not None else "calendar unavailable"
    text(32, grid_y + 7 * (cell + cell_gap) + 8, total_label, mono(10.5), MUTED)

    # languages
    text(848, 208, "TOP LANGUAGES", mono(10), MUTED)
    max_pct = max([entry["pct"] for entry in languages] or [1]) or 1
    for i, entry in enumerate(languages[:4]):
        y = 232 + i * 24
        text(848, y, entry["name"], mono(10.5), CHALK)
        track_x0, track_x1 = 952, 1096
        box(track_x0, y + 2, track_x1, y + 10, radius=4, fill=PANEL_2, outline=LINE)
        fill_w = max(2, (entry["pct"] / max_pct) * (track_x1 - track_x0 - 2))
        draw.rounded_rectangle(
            [track_x0 * S, (y + 2) * S, (track_x0 + fill_w) * S, (y + 10) * S],
            radius=4 * S,
            fill=ACID,
        )
        text(1128, y, f"{entry['pct']}%", mono(10.5), MUTED, "rt")

    # footer
    draw.line([32 * S, 376 * S, 1128 * S, 376 * S], fill=LINE, width=S)
    text(
        32,
        396,
        f"static snapshot · rendered {rendered} · shown when stats.json is unavailable",
        mono(10),
        MUTED,
    )
    text(1128, 396, "github.com/mrHumildad", mono(10), ACID, "rt")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, optimize=True)
    print(f"[stats] rendered {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
