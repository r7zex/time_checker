import importlib.util
import json
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).with_name("measure_yandex_transit_controls.py")
SPEC = importlib.util.spec_from_file_location("measure_yandex_controls", SCRIPT_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def response(*routes):
    return {"routes": list(routes)}


def route(duration, *, subtype=None):
    step = {
        "duration": duration,
        "length": 1_000,
        "mode": "transit",
    }
    if subtype:
        step["transport_type"] = subtype
    return {"legs": [{"status": "OK", "steps": [step]}]}


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

    def test_generic_transit_is_not_mislabeled_as_strict_metro(self):
        summary = MODULE.summarize_response(response(route(2_400), route(2_100)))

        self.assertEqual(summary["fastestTransitMinutes"], 35)
        self.assertIsNone(summary["strictMetroMinutes"])
        self.assertFalse(summary["strictMetroVerified"])

    def test_explicit_subway_subtype_can_be_used_as_a_strict_control(self):
        summary = MODULE.summarize_response(
            response(
                route(1_800, subtype="bus"),
                route(2_100, subtype="subway"),
            )
        )

        self.assertEqual(summary["fastestTransitMinutes"], 30)
        self.assertEqual(summary["strictMetroMinutes"], 35)
        self.assertTrue(summary["strictMetroVerified"])


if __name__ == "__main__":
    unittest.main()
