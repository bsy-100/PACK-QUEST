"""PRD "여행 조건과 추천 규칙": 공통 목록에 조건별 항목을 합치고 중복을 뺀다."""

import json
from pathlib import Path

_RULES = json.loads((Path(__file__).parent / "data" / "recommend_rules.json").read_text(encoding="utf-8"))


def build(region: str, transport: str, duration: str, season: str) -> list[dict]:
    groups = [
        _RULES["common"],
        _RULES["region"][region],
        _RULES["transport"][transport],
        _RULES["duration"][duration],
        _RULES["season"][season],
    ]
    seen: set[str] = set()
    items: list[dict] = []
    for group in groups:
        for item in group:
            if item["name"] not in seen:
                seen.add(item["name"])
                items.append(item)
    return items
