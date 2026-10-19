"""PRD "여행 조건과 추천 규칙": 공통 목록에 조건별 항목을 합치고 중복을 뺀다."""

import json
from pathlib import Path

_RULES = json.loads((Path(__file__).parent / "data" / "recommend_rules.json").read_text(encoding="utf-8"))

CATEGORIES = {"documents", "clothing", "toiletries", "electronics", "health", "etc"}
CONDITIONS = {
    "region": {"domestic", "overseas"},
    "transport": {"plane", "car", "train"},
    "duration": {"day", "short", "long"},
    "season": {"spring_fall", "summer", "winter"},
}


def _check_rules() -> None:
    """JSON을 고치다 틀리면 서버가 뜰 때 바로 알 수 있게 한다(DB에 넣을 때 깨지지 않게)."""
    groups = [("common", _RULES["common"])]
    for field, values in CONDITIONS.items():
        if set(_RULES[field]) != values:
            raise ValueError(f"recommend_rules.json: {field}의 키는 {sorted(values)}여야 합니다.")
        groups += [(f"{field}.{v}", _RULES[field][v]) for v in values]
    for where, items in groups:
        for item in items:
            if item["category"] not in CATEGORIES:
                raise ValueError(f"recommend_rules.json {where}: 없는 분류 {item['category']!r}")
            if not 1 <= len(item["name"]) <= 50:
                raise ValueError(f"recommend_rules.json {where}: 이름 길이 {item['name']!r}")


_check_rules()


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
