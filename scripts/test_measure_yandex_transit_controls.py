import importlib.util
import json
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).with_name("measure_yandex_transit_controls.py")
SPEC = importlib.util.spec_from_file_location("measure_yandex_controls", SCRIPT_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def route(duration, *, metro_only=False, transport_types=None):
    return {
        "alternative": 1,
        "durationSeconds": duration,
        "durationText": f"{duration // 60} мин",
        "lengthMeters": 1_000,
        "transportTypes": transport_types or [],
        "metroOnlyVerified": metro_only,
    }


class YandexControlMeasurementsTest(unittest.TestCase):
    def test_plan_covers_six_sectors_in_both_directions_for_two_anchors(self):
        plan = json.loads(MODULE.PLAN_PATH.read_text(encoding="utf-8"))
        controls = MODULE.planned_controls(plan)

        self.assertEqual(len(controls), 24)
        self.assertEqual(
            {item["anchorId"] for item in controls},
            {"central-telegraph", "rudn-ordzhonikidze"},
        )
        self.assertEqual(
            {item["direction"] for item in controls},
            {"from-anchor", "to-anchor"},
        )
        self.assertEqual(len({item["sector"] for item in controls}), 6)
        self.assertEqual(
            len(MODULE.fallback_entries_by_anchor(plan)["rudn-ordzhonikidze"]),
            2,
        )

    def test_generic_transit_is_not_mislabeled_as_strict_metro(self):
        summary = MODULE.summarize_routes(
            [
                route(2_400, transport_types=["underground", "bus"]),
                route(2_100, transport_types=["bus"]),
            ]
        )

        self.assertEqual(summary["fastestTransitMinutes"], 35)
        self.assertIsNone(summary["strictMetroMinutes"])
        self.assertFalse(summary["strictMetroVerified"])

    def test_explicit_subway_subtype_can_be_used_as_a_strict_control(self):
        summary = MODULE.summarize_routes(
            [
                route(1_800, transport_types=["bus"]),
                route(
                    2_100,
                    metro_only=True,
                    transport_types=["underground"],
                ),
            ]
        )

        self.assertEqual(summary["fastestTransitMinutes"], 30)
        self.assertEqual(summary["strictMetroMinutes"], 35)
        self.assertTrue(summary["strictMetroVerified"])

    def test_fallback_combines_walk_access_with_verified_metro(self):
        control = {
            "id": "control",
            "origin": {"coordinates": [55.7, 37.6]},
            "destination": {"coordinates": [55.6, 37.3]},
        }
        entry = {
            "id": "station",
            "name": "Метро",
            "coordinates": [55.71, 37.59],
        }
        results = {
            "control--fallback-station--walk": [route(600)],
            "control--fallback-station--metro": [
                route(3_000, transport_types=["bus"]),
                route(
                    3_300,
                    metro_only=True,
                    transport_types=["underground"],
                ),
            ],
        }

        alternative = MODULE.assemble_fallback_alternative(
            control, entry, results
        )

        self.assertIsNotNone(alternative)
        self.assertEqual(alternative["durationSeconds"], 3_900)
        self.assertEqual(alternative["durationMinutes"], 65)
        self.assertTrue(alternative["metroOnlyVerified"])
        self.assertEqual(
            alternative["assembledFrom"]["entryStation"]["id"], "station"
        )


if __name__ == "__main__":
    unittest.main()
