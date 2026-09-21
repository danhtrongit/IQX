#!/usr/bin/env python3
"""Verify the IQX mascot v2 runtime asset contract without mutating assets."""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


DASHBOARD = Path(__file__).resolve().parents[1]
DEFAULT_ROOT = DASHBOARD / "public/assets/mascots-2d/v2"

MASCOTS = {
    "bach-ho": ("bach_ho", "ky_thuat", "technical_blue"),
    "thanh-long": ("thanh_long", "dong_tien", "flow_cyan"),
    "loc-huou": ("loc_huou", "noi_bo", "observer_gold"),
    "phung-hoang": ("phung_hoang", "tin_tuc", "news_coral"),
    "kim-quy": ("kim_quy", "dinh_gia", "value_jade"),
}

STATIC_ASSETS = {
    "poster.webp": (1024, 1024, 300),
    "reveal-silhouette.webp": (640, 640, 120),
    "avatar-head.webp": (256, 256, 80),
    "avatar-body.webp": (512, 512, 160),
}

STATES = {
    "idle": ("idle-strip.webp", 6, [1500, 1100, 80, 120, 100, 2200], 600),
    "greet": ("greet-strip.webp", 6, [100, 180, 220, 220, 220, 260], 600),
    "analyzing": ("analyzing-strip.webp", 6, [300, 400, 500, 400, 400, 400], 650),
    "updated": ("updated-strip.webp", 5, [180, 250, 250, 250, 320], 550),
    "tap_reaction": ("tap-strip.webp", 4, [100, 150, 180, 250], 450),
}

EXPECTED_FILES = {
    "manifest.json",
    *STATIC_ASSETS,
    *(state[0] for state in STATES.values()),
}


def alpha_component_stats(frame: Image.Image) -> dict[str, float | int | tuple[int, ...]]:
    alpha = np.asarray(frame.getchannel("A"))
    mask = np.ascontiguousarray((alpha > 32).astype(np.uint8))
    count, _labels, stats, centroids = cv2.connectedComponentsWithStats(mask, 8)
    if count <= 1:
        return {
            "components": 0,
            "main_area": 0,
            "stray_area": 0,
            "largest_stray": 0,
            "bbox": (0, 0, 0, 0),
            "centroid": (0.0, 0.0),
        }
    areas = stats[1:, cv2.CC_STAT_AREA]
    main_index = 1 + int(np.argmax(areas))
    main_area = int(stats[main_index, cv2.CC_STAT_AREA])
    other_areas = [int(area) for idx, area in enumerate(stats[:, cv2.CC_STAT_AREA]) if idx not in (0, main_index)]
    x, y, width, height = (int(value) for value in stats[main_index, :4])
    return {
        "components": count - 1,
        "main_area": main_area,
        "stray_area": sum(other_areas),
        "largest_stray": max(other_areas, default=0),
        "bbox": (x, y, width, height),
        "centroid": (float(centroids[main_index, 0]), float(centroids[main_index, 1])),
    }


def verify(root: Path) -> tuple[list[str], list[str], list[dict[str, object]]]:
    errors: list[str] = []
    warnings: list[str] = []
    summaries: list[dict[str, object]] = []

    actual_dirs = {path.name for path in root.iterdir() if path.is_dir() and path.name != "shared"}
    if actual_dirs != set(MASCOTS):
        errors.append(f"Mascot folders differ: expected {sorted(MASCOTS)}, got {sorted(actual_dirs)}")

    fallback = root / "shared/fallback-placeholder.webp"
    if not fallback.is_file():
        errors.append("Missing shared/fallback-placeholder.webp")
    else:
        with Image.open(fallback) as image:
            if image.size != (640, 640) or image.mode != "RGBA":
                errors.append(f"Shared fallback must be 640x640 RGBA, got {image.size} {image.mode}")

    for slug, (mascot_id, dominant_layer, stage_preset) in MASCOTS.items():
        folder = root / slug
        if not folder.is_dir():
            continue

        actual_files = {path.name for path in folder.iterdir() if path.is_file()}
        if actual_files != EXPECTED_FILES:
            missing = sorted(EXPECTED_FILES - actual_files)
            extra = sorted(actual_files - EXPECTED_FILES)
            errors.append(f"{slug}: runtime inventory mismatch; missing={missing}, extra={extra}")

        manifest_path = folder / "manifest.json"
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            errors.append(f"{slug}: cannot read manifest: {exc}")
            continue

        expected_manifest_values = {
            "schemaVersion": 2,
            "mascotId": mascot_id,
            "slug": slug,
            "dominantLayer": dominant_layer,
        }
        for field, expected in expected_manifest_values.items():
            if manifest.get(field) != expected:
                errors.append(f"{slug}: manifest.{field} expected {expected!r}, got {manifest.get(field)!r}")
        asset_version = manifest.get("assetVersion")
        if not isinstance(asset_version, str) or not asset_version.startswith("2.0."):
            errors.append(f"{slug}: manifest.assetVersion must be a 2.0.x version, got {asset_version!r}")

        canvas = manifest.get("canvas", {})
        for field, expected in {
            "frameWidth": 640,
            "frameHeight": 640,
            "anchorX": 0.5,
            "anchorY": 0.92,
            "safePaddingPct": 8,
        }.items():
            if canvas.get(field) != expected:
                errors.append(f"{slug}: canvas.{field} expected {expected!r}, got {canvas.get(field)!r}")

        presentation = manifest.get("presentation", {})
        if presentation.get("stageEffectPreset") != stage_preset:
            errors.append(f"{slug}: wrong stageEffectPreset {presentation.get('stageEffectPreset')!r}")
        if presentation.get("accentToken") != f"mascot.{mascot_id}":
            errors.append(f"{slug}: wrong accentToken {presentation.get('accentToken')!r}")

        total_bytes = 0
        for filename, (width, height, max_kib) in STATIC_ASSETS.items():
            path = folder / filename
            if not path.is_file():
                continue
            total_bytes += path.stat().st_size
            with Image.open(path) as image:
                if image.size != (width, height):
                    errors.append(f"{slug}/{filename}: expected {width}x{height}, got {image.size}")
                if image.mode != "RGBA":
                    errors.append(f"{slug}/{filename}: expected alpha-enabled RGBA, got {image.mode}")
                alpha = np.asarray(image.getchannel("A"))
                if int(alpha.min()) != 0 or int(alpha.max()) != 255:
                    errors.append(f"{slug}/{filename}: alpha channel lacks both transparent and opaque pixels")
            if path.stat().st_size > max_kib * 1024:
                errors.append(f"{slug}/{filename}: {path.stat().st_size / 1024:.1f} KiB exceeds {max_kib} KiB")

        states = manifest.get("states", {})
        if set(states) != set(STATES):
            errors.append(f"{slug}: state set expected {sorted(STATES)}, got {sorted(states)}")

        frame_records: list[dict[str, object]] = []
        for state_name, (filename, frame_count, default_durations, max_kib) in STATES.items():
            state = states.get(state_name, {})
            for field, expected in {
                "file": filename,
                "frameCount": frame_count,
                "columns": frame_count,
                "rows": 1,
            }.items():
                if state.get(field) != expected:
                    errors.append(f"{slug}/{state_name}: {field} expected {expected!r}, got {state.get(field)!r}")

            durations = state.get("durationsMs")
            if not isinstance(durations, list) or len(durations) != frame_count:
                errors.append(f"{slug}/{state_name}: durationsMs must have {frame_count} values")
            else:
                for index, (actual, default) in enumerate(zip(durations, default_durations)):
                    if not isinstance(actual, (int, float)) or not 0.85 * default <= actual <= 1.15 * default:
                        errors.append(
                            f"{slug}/{state_name}: duration[{index}]={actual!r} exceeds ±15% of {default}"
                        )

            path = folder / filename
            if not path.is_file():
                continue
            total_bytes += path.stat().st_size
            if path.stat().st_size > max_kib * 1024:
                errors.append(f"{slug}/{filename}: {path.stat().st_size / 1024:.1f} KiB exceeds {max_kib} KiB")
            with Image.open(path) as strip:
                strip = strip.convert("RGBA")
                expected_size = (640 * frame_count, 640)
                if strip.size != expected_size:
                    errors.append(f"{slug}/{filename}: expected {expected_size}, got {strip.size}")
                    continue
                for frame_index in range(frame_count):
                    frame = strip.crop((frame_index * 640, 0, (frame_index + 1) * 640, 640))
                    stats = alpha_component_stats(frame)
                    x, y, width, height = stats["bbox"]
                    margins = (x, y, 640 - (x + width), 640 - (y + height))
                    if min(margins) < math.floor(640 * 0.08):
                        errors.append(
                            f"{slug}/{state_name}[{frame_index}]: safe padding below 8%, margins={margins}"
                        )
                    if stats["largest_stray"] >= 128:
                        errors.append(
                            f"{slug}/{state_name}[{frame_index}]: detached alpha component "
                            f"{stats['largest_stray']} px; stray total {stats['stray_area']} px"
                        )
                    elif stats["largest_stray"] >= 16:
                        warnings.append(
                            f"{slug}/{state_name}[{frame_index}]: detached alpha component "
                            f"{stats['largest_stray']} px"
                        )
                    frame_records.append({"state": state_name, "index": frame_index, **stats})

        if total_bytes > int(2.8 * 1024 * 1024):
            errors.append(f"{slug}: {total_bytes / 1024 / 1024:.2f} MiB exceeds 2.8 MiB total budget")

        if frame_records:
            bottoms = [record["bbox"][1] + record["bbox"][3] for record in frame_records]
            median_bottom = float(np.median(bottoms))
            max_bottom_drift = max(abs(bottom - median_bottom) for bottom in bottoms)
            if max_bottom_drift > 13:
                errors.append(f"{slug}: main-body baseline drifts {max_bottom_drift:.1f}px (>2% of frame)")

            center_x = [record["centroid"][0] for record in frame_records]
            median_center = float(np.median(center_x))
            max_center_drift = max(abs(center - median_center) for center in center_x)
            if max_center_drift > 13:
                warnings.append(f"{slug}: main-body alpha centroid drifts {max_center_drift:.1f}px (>2% of frame)")

            idle_heights = [
                record["bbox"][3] for record in frame_records if record["state"] == "idle"
            ]
            median_height = float(np.median(idle_heights))
            idle_scale_drift = max(abs(height - median_height) / median_height for height in idle_heights)
            if idle_scale_drift > 0.02:
                warnings.append(f"{slug}: idle main-body height drifts {idle_scale_drift * 100:.1f}% (>2%)")

            summaries.append(
                {
                    "mascot": slug,
                    "runtime_files": len(actual_files),
                    "runtime_image_bytes": total_bytes,
                    "frames": len(frame_records),
                    "frames_with_detached_alpha": sum(
                        1 for record in frame_records if record["stray_area"] > 0
                    ),
                    "largest_detached_component_px": max(
                        record["largest_stray"] for record in frame_records
                    ),
                    "max_main_body_baseline_drift_px": max_bottom_drift,
                    "max_main_body_centroid_drift_px": max_center_drift,
                }
            )

    return errors, warnings, summaries


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--json", action="store_true", help="Print a machine-readable result")
    args = parser.parse_args()

    errors, warnings, summaries = verify(args.root.resolve())
    if args.json:
        print(json.dumps({"errors": errors, "warnings": warnings, "mascots": summaries}, indent=2))
    else:
        for summary in summaries:
            print(
                f"{summary['mascot']}: {summary['runtime_files']} files, {summary['frames']} frames, "
                f"{summary['runtime_image_bytes'] / 1024 / 1024:.2f} MiB, "
                f"detached alpha {summary['frames_with_detached_alpha']}/{summary['frames']} frames"
            )
        for message in warnings:
            print(f"WARNING: {message}", file=sys.stderr)
        for message in errors:
            print(f"ERROR: {message}", file=sys.stderr)
        print(f"Result: {len(errors)} error(s), {len(warnings)} warning(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
