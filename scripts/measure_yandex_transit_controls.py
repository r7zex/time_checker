#!/usr/bin/env python3
"""Measure and cache strict metro controls through Yandex Maps JS API 2.1.

The API key is read from ``YANDEX_MAPS_API_KEY`` (the former
``YANDEX_ROUTER_API_KEY`` name remains accepted). The Node helper loads the
official JavaScript API and uses ``multiRouter.MultiRoute``. A route is marked
strict metro only when every public-transport segment returned by Yandex is
explicitly typed ``underground``; walking and transfer segments are allowed.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Iterator


ROOT = Path(__file__).resolve().parents[1]
PLAN_PATH = ROOT / "scripts" / "yandex-metro-control-plan.json"
RUNNER_PATH = ROOT / "scripts" / "yandex-js-route-runner.cjs"
OUTPUT_PATH = ROOT / "src" / "data" / "yandex-route-controls.json"
USAGE_PATH = ROOT / ".cache" / "yandex-router-usage.json"
API_DOC_URL = (
    "https://yandex.ru/dev/jsapi-v2-1/doc/ru/v2-1/"
    "ref/reference/multiRouter.MultiRoute"
)
API_KEY_ENV = "YANDEX_MAPS_API_KEY"
LEGACY_API_KEY_ENV = "YANDEX_ROUTER_API_KEY"
DEFAULT_REFERER = "http://localhost:5173/"
DAILY_LIMIT = 1_000
DEFAULT_MAX_NEW_REQUESTS = 30


class MeasurementError(RuntimeError):
    """A safe, user-facing measurement failure."""


def read_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def coordinates(value: Any) -> tuple[float, float]:
    if not isinstance(value, list) or len(value) != 2:
        raise MeasurementError(f"Invalid coordinates: {value!r}")
    latitude, longitude = float(value[0]), float(value[1])
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        raise MeasurementError(f"Coordinates are out of range: {value!r}")
    return latitude, longitude


def control_id(
    anchor: dict[str, Any],
    destination: dict[str, Any],
    reverse: bool,
) -> str:
    direction = "to-anchor" if reverse else "from-anchor"
    return f"{anchor['id']}--{destination['id']}--{direction}"


def planned_controls(plan: dict[str, Any]) -> list[dict[str, Any]]:
    controls: list[dict[str, Any]] = []
    for anchor in plan["anchors"]:
        coordinates(anchor["coordinates"])
        for destination in plan["destinations"]:
            coordinates(destination["coordinates"])
            for reverse in (False, True):
                origin = destination if reverse else anchor
                target = anchor if reverse else destination
                controls.append(
                    {
                        "id": control_id(anchor, destination, reverse),
                        "anchorId": anchor["id"],
                        "direction": (
                            "to-anchor" if reverse else "from-anchor"
                        ),
                        "sector": destination["direction"],
                        "origin": {
                            "name": origin["name"],
                            "coordinates": origin["coordinates"],
                        },
                        "destination": {
                            "name": target["name"],
                            "coordinates": target["coordinates"],
                        },
                    }
                )
    return controls


def usage_for_today() -> dict[str, Any]:
    today = dt.datetime.now(dt.timezone.utc).date().isoformat()
    usage = read_json(USAGE_PATH, {}) or {}
    if usage.get("date") != today:
        return {"date": today, "requests": 0}
    return usage


def ensure_capacity(usage: dict[str, Any], requested: int) -> None:
    used = int(usage.get("requests", 0))
    if used + requested > DAILY_LIMIT:
        raise MeasurementError(
            f"This run could exceed the daily safety limit: "
            f"{used} used + {requested} planned > {DAILY_LIMIT}."
        )


def reserve_request(usage: dict[str, Any]) -> None:
    usage["requests"] = int(usage.get("requests", 0)) + 1
    write_json(USAGE_PATH, usage)


def api_key_from_environment() -> str:
    return (
        os.getenv(API_KEY_ENV, "").strip()
        or os.getenv(LEGACY_API_KEY_ENV, "").strip()
    )


def runner_requests(controls: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "id": control["id"],
            "origin": control["origin"]["coordinates"],
            "destination": control["destination"]["coordinates"],
        }
        for control in controls
    ]


def run_yandex_requests(
    requests: list[dict[str, Any]],
    referer: str,
) -> Iterator[dict[str, Any]]:
    node = shutil.which("node")
    if not node:
        raise MeasurementError(
            "Node.js is required for Yandex Maps JavaScript API measurements."
        )
    process = subprocess.Popen(
        [node, str(RUNNER_PATH)],
        cwd=ROOT,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
    )
    assert process.stdin is not None
    assert process.stdout is not None
    assert process.stderr is not None
    process.stdin.write(
        json.dumps(
            {
                "referer": referer,
                "requests": requests,
            },
            ensure_ascii=False,
        )
    )
    process.stdin.close()
    try:
        for line in process.stdout:
            try:
                message = json.loads(line)
            except json.JSONDecodeError as error:
                raise MeasurementError(
                    f"Yandex JS runner returned invalid output: {line[:200]}"
                ) from error
            yield message
    finally:
        process.stdout.close()
    stderr = process.stderr.read().strip()
    process.stderr.close()
    return_code = process.wait()
    if return_code and stderr:
        raise MeasurementError(
            f"Yandex JS runner failed with exit code {return_code}: "
            f"{stderr[:500]}"
        )
    if return_code:
        raise MeasurementError(
            f"Yandex JS runner failed with exit code {return_code}."
        )


def run_yandex_js(
    controls: list[dict[str, Any]],
    referer: str,
) -> Iterator[dict[str, Any]]:
    if not controls:
        return iter(())
    return run_yandex_requests(runner_requests(controls), referer)


def normalized_routes(routes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    valid = [
        route
        for route in routes
        if isinstance(route.get("durationSeconds"), (int, float))
        and route["durationSeconds"] >= 0
    ]
    if not valid:
        raise MeasurementError("Yandex returned no usable route alternatives.")
    alternatives = []
    for route in valid:
        seconds = round(float(route["durationSeconds"]))
        alternatives.append(
            {
                **route,
                "durationSeconds": seconds,
                "durationMinutes": round(seconds / 60, 2),
            }
        )
    return alternatives


def summarize_routes(routes: list[dict[str, Any]]) -> dict[str, Any]:
    alternatives = normalized_routes(routes)
    fastest = min(alternatives, key=lambda route: route["durationSeconds"])
    metro_routes = [
        route
        for route in alternatives
        if route.get("metroOnlyVerified") is True
    ]
    strict_metro = (
        min(metro_routes, key=lambda route: route["durationSeconds"])
        if metro_routes
        else None
    )
    return {
        "fastestTransitMinutes": fastest["durationMinutes"],
        "strictMetroMinutes": (
            strict_metro["durationMinutes"] if strict_metro else None
        ),
        "strictMetroVerified": strict_metro is not None,
        "alternatives": alternatives,
    }


def fallback_requests(
    control: dict[str, Any],
    entries: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    requests: list[dict[str, Any]] = []
    for entry in entries:
        coordinates(entry["coordinates"])
        prefix = f"{control['id']}--fallback-{entry['id']}"
        requests.extend(
            [
                {
                    "id": f"{prefix}--walk",
                    "origin": control["origin"]["coordinates"],
                    "destination": entry["coordinates"],
                    "routingMode": "pedestrian",
                },
                {
                    "id": f"{prefix}--metro",
                    "origin": entry["coordinates"],
                    "destination": control["destination"]["coordinates"],
                    "routingMode": "masstransit",
                },
            ]
        )
    return requests


def numeric_sum(*values: Any) -> float | None:
    if not all(isinstance(value, (int, float)) for value in values):
        return None
    return sum(float(value) for value in values)


def assemble_fallback_alternative(
    control: dict[str, Any],
    entry: dict[str, Any],
    results: dict[str, list[dict[str, Any]]],
) -> dict[str, Any] | None:
    prefix = f"{control['id']}--fallback-{entry['id']}"
    walk_routes = normalized_routes(results.get(f"{prefix}--walk", []))
    metro_routes = normalized_routes(results.get(f"{prefix}--metro", []))
    access = min(walk_routes, key=lambda route: route["durationSeconds"])
    strict_routes = [
        route
        for route in metro_routes
        if route.get("metroOnlyVerified") is True
    ]
    if not strict_routes:
        return None
    metro = min(strict_routes, key=lambda route: route["durationSeconds"])
    seconds = access["durationSeconds"] + metro["durationSeconds"]
    return {
        "alternative": f"fallback-{entry['id']}",
        "durationSeconds": seconds,
        "durationMinutes": round(seconds / 60, 2),
        "durationText": f"{round(seconds / 60)} мин",
        "lengthMeters": numeric_sum(
            access.get("lengthMeters"), metro.get("lengthMeters")
        ),
        "segmentCount": int(access.get("segmentCount", 0))
        + int(metro.get("segmentCount", 0)),
        "transitSegmentCount": int(metro.get("transitSegmentCount", 0)),
        "walkingSeconds": access["durationSeconds"]
        + float(metro.get("walkingSeconds", 0)),
        "transferSeconds": float(metro.get("transferSeconds", 0)),
        "transitSeconds": float(metro.get("transitSeconds", 0)),
        "transportTypes": metro.get("transportTypes", []),
        "transitLines": metro.get("transitLines", []),
        "metroOnlyVerified": True,
        "assembledFrom": {
            "accessMode": "pedestrian",
            "entryStation": {
                "id": entry["id"],
                "name": entry["name"],
                "coordinates": entry["coordinates"],
            },
            "accessDurationSeconds": access["durationSeconds"],
            "metroDurationSeconds": metro["durationSeconds"],
        },
    }


def fallback_entries_by_anchor(
    plan: dict[str, Any],
) -> dict[str, list[dict[str, Any]]]:
    return {
        anchor["id"]: anchor.get("metroFallbackEntries", [])
        for anchor in plan["anchors"]
        if anchor.get("metroFallbackEntries")
    }


def measurement_document(
    controls: list[dict[str, Any]],
    measured_at: str,
) -> dict[str, Any]:
    return {
        "schemaVersion": 2,
        "generatedAt": measured_at,
        "source": {
            "provider": "Yandex Maps JavaScript API 2.1 MultiRoute",
            "requestMode": "masstransit",
            "documentation": API_DOC_URL,
        },
        "strictMetroRule": (
            "Every public-transport segment must contain only transports "
            "with type=underground; walk and transfer segments are allowed."
        ),
        "fallbackRule": (
            "When the three direct alternatives contain no strict metro "
            "route, compare explicit pedestrian access to configured entry "
            "stations plus a separately verified underground-only route."
        ),
        "controls": controls,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", type=Path, default=PLAN_PATH)
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH)
    parser.add_argument(
        "--referer",
        default=os.getenv("YANDEX_ROUTER_REFERER", DEFAULT_REFERER),
    )
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--max-new-requests",
        type=int,
        default=DEFAULT_MAX_NEW_REQUESTS,
        help=(
            "Safety cap for this run; the default plan needs 24 direct "
            "requests and currently four fallback requests."
        ),
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    plan = read_json(args.plan)
    if not isinstance(plan, dict):
        raise MeasurementError(f"Control plan is missing or invalid: {args.plan}")
    controls = planned_controls(plan)
    previous = read_json(args.output, {}) or {}
    previous_by_id = {
        item["id"]: item
        for item in previous.get("controls", [])
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }
    pending = (
        controls
        if args.refresh
        else [item for item in controls if item["id"] not in previous_by_id]
    )
    if len(pending) > args.max_new_requests:
        raise MeasurementError(
            f"This run needs {len(pending)} new requests, above "
            f"--max-new-requests={args.max_new_requests}."
        )
    print(
        f"Planned controls: {len(controls)}; "
        f"cached: {len(controls) - len(pending)}; "
        f"new requests: {len(pending)}."
    )
    fallback_entries = fallback_entries_by_anchor(plan)
    cached_fallback_candidates = [
        previous_by_id[item["id"]]
        for item in controls
        if item["id"] in previous_by_id
        and not previous_by_id[item["id"]].get("strictMetroVerified")
        and fallback_entries.get(item["anchorId"])
    ]
    cached_fallback_request_count = sum(
        2 * len(fallback_entries[item["anchorId"]])
        for item in cached_fallback_candidates
    )
    if args.dry_run:
        print(
            "Known strict-metro fallback requests: "
            f"{cached_fallback_request_count}."
        )
        return 0

    if not pending and not cached_fallback_candidates:
        return 0

    if not api_key_from_environment():
        raise MeasurementError(
            f"Set {API_KEY_ENV} in the current terminal. "
            "The key is never written to disk."
        )
    usage = usage_for_today()
    ensure_capacity(usage, len(pending) + cached_fallback_request_count)
    measured_at = dt.datetime.now(dt.timezone.utc).replace(
        microsecond=0
    ).isoformat()
    pending_by_id = {item["id"]: item for item in pending}
    completed = 0
    for message in run_yandex_js(pending, args.referer):
        event = message.get("event")
        control_identifier = message.get("id")
        if event == "request":
            reserve_request(usage)
            print(
                f"[{completed + 1}/{len(pending)}] "
                f"{control_identifier}"
            )
            continue
        if event == "error":
            raise MeasurementError(str(message.get("error", "Yandex failed.")))
        if event != "result" or control_identifier not in pending_by_id:
            raise MeasurementError(f"Unexpected runner message: {message!r}")
        summary = summarize_routes(message.get("routes", []))
        previous_by_id[control_identifier] = {
            **pending_by_id[control_identifier],
            "measuredAt": measured_at,
            **summary,
        }
        completed += 1
        write_json(
            args.output,
            measurement_document(
                [
                    previous_by_id[item["id"]]
                    for item in controls
                    if item["id"] in previous_by_id
                ],
                measured_at,
            ),
        )

    fallback_candidates = [
        previous_by_id[item["id"]]
        for item in controls
        if item["id"] in previous_by_id
        and not previous_by_id[item["id"]].get("strictMetroVerified")
        and fallback_entries.get(item["anchorId"])
    ]
    fallback_request_count = sum(
        2 * len(fallback_entries[item["anchorId"]])
        for item in fallback_candidates
    )
    total_run_requests = len(pending) + fallback_request_count
    if total_run_requests > args.max_new_requests:
        raise MeasurementError(
            f"Direct and fallback measurements need {total_run_requests} "
            f"requests, above --max-new-requests={args.max_new_requests}."
        )
    ensure_capacity(usage, fallback_request_count)
    for control in fallback_candidates:
        entries = fallback_entries[control["anchorId"]]
        requests = fallback_requests(control, entries)
        results: dict[str, list[dict[str, Any]]] = {}
        print(
            f"Checking strict-metro station fallbacks for {control['id']} "
            f"({len(requests)} requests)."
        )
        for message in run_yandex_requests(requests, args.referer):
            event = message.get("event")
            request_id = message.get("id")
            if event == "request":
                reserve_request(usage)
                continue
            if event == "error":
                raise MeasurementError(
                    str(message.get("error", "Yandex failed."))
                )
            if event != "result" or not isinstance(request_id, str):
                raise MeasurementError(
                    f"Unexpected fallback runner message: {message!r}"
                )
            results[request_id] = message.get("routes", [])
        assembled = [
            alternative
            for entry in entries
            if (
                alternative := assemble_fallback_alternative(
                    control, entry, results
                )
            )
            is not None
        ]
        if not assembled:
            print(f"No strict metro fallback found for {control['id']}.")
            continue
        summary = summarize_routes(control["alternatives"] + assembled)
        previous_by_id[control["id"]] = {
            **control,
            "measuredAt": measured_at,
            **summary,
        }
        write_json(
            args.output,
            measurement_document(
                [previous_by_id[item["id"]] for item in controls],
                measured_at,
            ),
        )

    strict_count = sum(
        bool(item.get("strictMetroVerified"))
        for item in previous_by_id.values()
    )
    print(
        f"Saved {len(previous_by_id)} controls to {args.output}. "
        f"Strict metro controls: {strict_count}."
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except MeasurementError as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
