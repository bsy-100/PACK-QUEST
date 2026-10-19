"""items 조회와 응답 모양(명세 4번의 items 원소)."""

from app.errors import ApiError

ITEM_COLUMNS = "id, name, category, assignee_id, done, source"


def to_item(row: dict) -> dict:
    return {
        "item_id": row["id"],
        "name": row["name"],
        "category": row["category"],
        "assignee_id": row["assignee_id"],
        "done": bool(row["done"]),
        "source": row["source"],
    }


def parse_item_id(item_id: str) -> int:
    # 명세 "값 규칙": 숫자가 아닌 item_id는 422 대신 ITEM_NOT_FOUND
    if not item_id.isdigit():
        raise ApiError(404, "ITEM_NOT_FOUND", "항목을 찾을 수 없습니다.")
    return int(item_id)


def fetch_item(cur, trip_code: str, item_id: int) -> dict:
    """그 여행의 항목만 찾는다. 다른 여행의 항목도 ITEM_NOT_FOUND."""
    cur.execute(f"SELECT {ITEM_COLUMNS} FROM items WHERE id = %s AND trip_code = %s", (item_id, trip_code))
    row = cur.fetchone()
    if row is None:
        raise ApiError(404, "ITEM_NOT_FOUND", "항목을 찾을 수 없습니다.")
    return row
