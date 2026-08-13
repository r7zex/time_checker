#!/usr/bin/env python3
"""Measure and cache Yandex transit controls without storing the API key.

The Route Details API documents only ``mode=transit``. It does not document a
metro-only request parameter or a transit vehicle subtype in the response.
Consequently this script records Yandex's fastest public-transport result and
marks every measurement as *not proven metro-only*. It deliberately refuses to
turn such a value into a strict metro reference unless a future response
contains an explicit metro subtype.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PLAN_PATH = ROOT / "scripts" / "yandex-metro-control-plan.json"
OUTPUT_PATH = ROOT / "src" / "data" / "yandex-route-controls.json"
USAGE_PATH = ROOT / ".cache" / "yandex-router-usage.json"
API_URL = "https://api.routing.yandex.net/v2/route"
API_DOC_URL = "https://yandex.ru/maps-api/docs/router-api/request.html"
API_KEY_ENV = "YANDEX_ROUTER_API_KEY"
DEFAULT_REFERER = "http://localhost:5173/"
DAILY_LIMIT = 1_000
DEFAULT_MAX_NEW_REQUESTS = 30
REQUEST_DELAY_SECONDS = 0.05
METRO_SUBTYPES = {
    "metro",
    "subway",
    "underground",
}
SUBTYPE_KEYS = {
    "transport_type",
    "transit_type",
    "vehicle_type",
}


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


def coordinate_text(value: Any) -> str:
    latitude, longitude = coordinates(value)
    return f"{latitude:.9f},{longitude:.9f}"


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
                        "direction": "to-anchor" if reverse else "from-anchor",
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


def reserve_request(usage: dict[str, Any]) -> None:
    if int(usage["requests"]) >= DAILY_LIMIT:
        raise MeasurementError(
            f"Daily safety limit reached ({DAILY_LIMIT} requests)."
        )
    usage["requests"] = int(usage["requests"]) + 1
    write_json(USAGE_PATH, usage)


def yandex_request(
    api_key: str,
    control: dict[str, Any],
    referer: str,
    usage: dict[str, Any],
) -> dict[str, Any]:
    reserve_request(usage)
    query = urllib.parse.urlencode(
        {
            "apikey": api_key,
            "waypoints": "|".join(
                (
                    coordinate_text(control["origin"]["coordinates"]),
                    coordinate_text(control["destination"]["coordinates"]),
                )
            ),
            "mode": "transit",
            "results": 3,
        }
    )
    request = urllib.request.Request(
        f"{API_URL}?{query}",
        headers={
            "Accept": "application/json",
            "Referer": referer,
            "User-Agent": "time-checker-control-measurements/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")[:500]
        if error.code in (401, 403):
            raise MeasurementError(
                "Yandex rejected the API key. Check that it belongs to the "
                "Route Details API, wait 15 minutes after creation, and verify "
                f"its IP/domain restrictions. HTTP {error.code}: {details}"
            ) from error
        if error.code == 429:
            raise MeasurementError(
                f"Yandex daily or per-second limit was exceeded: {details}"
            ) from error
        raise MeasurementError(
            f"Yandex returned HTTP {error.code}: {details}"
        ) from error
    except (TimeoutError, urllib.error.URLError) as error:
        raise MeasurementError(f"Yandex request failed: {error}") from error


def routes_from_response(response: dict[str, Any]) -> list[dict[str, Any]]:
    if isinstance(response.get("routes"), list):
        return response["routes"]
    if isinstance(response.get("route"), dict):
        return [response["route"]]
    raise MeasurementError("Yandex response contains neither route nor routes.")


def explicit_subtypes(value: Any) -> set[str]:
    result: set[str] = set()
    if isinstance(value, dict):
        for key, nested in value.items():
            if key in SUBTYPE_KEYS and isinstance(nested, str):
                result.add(nested.lower())
            result.update(explicit_subtypes(nested))
    elif isinstance(value, list):
        for nested in value:
            result.update(explicit_subtypes(nested))
    return result


def summarize_route(route: dict[str, Any], index: int) -> dict[str, Any]:
    steps = [
        step
        for leg in route.get("legs", [])
        for step in leg.get("steps", [])
        if isinstance(step, dict)
    ]
    duration_seconds = sum(float(step.get("duration", 0)) for step in steps)
    length_meters = sum(float(step.get("length", 0)) for step in steps)
    modes = sorted(
        {
            str(step["mode"])
            for step in steps
            if isinstance(step.get("mode"), str)
        }
    )
    subtypes = explicit_subtypes(route)
    metro_only_verified = bool(subtypes) and subtypes <= METRO_SUBTYPES
    return {
        "alternative": index + 1,
        "durationSeconds": round(duration_seconds),
        "durationMinutes": round(duration_seconds / 60, 2),
        "lengthMeters": round(length_meters),
        "stepCount": len(steps),
        "documentedModes": modes,
        "explicitTransitSubtypes": sorted(subtypes),
        "metroOnlyVerified": metro_only_verified,
    }


def summarize_response(response: dict[str, Any]) -> dict[str, Any]:
    alternatives = [
        summarize_route(route, index)
        for index, route in enumerate(routes_from_response(response))
    ]
    if not alternatives:
        raise MeasurementError("Yandex returned an empty route list.")
    fastest = min(alternatives, key=lambda route: route["durationSeconds"])
    verified = [route for route in alternatives if route["metroOnlyVerified"]]
    strict_metro = (
        min(verified, key=lambda route: route["durationSeconds"])
        if verified
        else None
    )
    return {
        "fastestTransitMinutes": fastest["durationMinutes"],
        "strictMetroMinutes": strict_metro["durationMinutes"] if strict_metro else None,
        "strictMetroVerified": strict_metro is not None,
        "alternatives": alternatives,
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
        help="Safety cap for this run; the default plan needs 24 requests.",
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
            f"This run needs {len(pending)} new requests, above --max-new-requests="
            f"{args.max_new_requests}. Increase it explicitly if intentional."
        )
    print(
        f"Planned controls: {len(controls)}; cached: {len(controls) - len(pending)}; "
        f"new requests: {len(pending)}."
    )
    if args.dry_run:
        return 0

    api_key = os.getenv(API_KEY_ENV, "").strip()
    if not api_key:
        raise MeasurementError(
            f"Set {API_KEY_ENV} in the current terminal. "
            "The key is never written to disk."
        )

    usage = usage_for_today()
    measured_at = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    for index, control in enumerate(pending, start=1):
        print(f"[{index}/{len(pending)}] {control['id']}")
        response = yandex_request(api_key, control, args.referer, usage)
        previous_by_id[control["id"]] = {
            **control,
            "measuredAt": measured_at,
            **summarize_response(response),
        }
        # Persist after every successful request, so a later failure does not
        # cause already measured routes to consume the quota again.
        write_json(
            args.output,
            {
                "schemaVersion": 1,
                "generatedAt": measured_at,
                "source": {
                    "provider": "Yandex Route Details API",
                    "requestMode": "transit",
                    "documentation": API_DOC_URL,
                },
                "limitations": {
                    "metroOnlyRequestSupported": False,
                    "reason": (
                        "The documented API accepts only mode=transit and does not "
                        "document a public-transport vehicle subtype in its response."
                    ),
                },
                "controls": [
                    previous_by_id[item["id"]]
                    for item in controls
                    if item["id"] in previous_by_id
                ],
            },
        )
        if index < len(pending):
            time.sleep(REQUEST_DELAY_SECONDS)

    strict_count = sum(
        bool(item.get("strictMetroVerified"))
        for item in previous_by_id.values()
    )
    print(
        f"Saved {len(previous_by_id)} controls to {args.output}. "
        f"Strict metro controls verified by the response: {strict_count}."
    )
    if strict_count == 0:
        print(
            "Yandex returned only generic transit data; these values must not be "
            "presented as strict metro references.",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except MeasurementError as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
