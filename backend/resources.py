"""Crisis resources for India.

Keep this list short and verified. The app is India-only for now.
"""

INDIA_RESOURCES = [
    {
        "name": "Tele-MANAS",
        "contact": "call 14416 or 1-800-891-4416 (24/7, free, multiple languages)",
    },
    {
        "name": "KIRAN",
        "contact": "call 1800-599-0019 (24/7, free, 13 languages)",
    },
    {
        "name": "AASRA",
        "contact": "call +91 98204 66726 (24/7)",
    },
]

EMERGENCY_NUMBER = "112"


def crisis_resources():
    return list(INDIA_RESOURCES), EMERGENCY_NUMBER
