from fastapi import APIRouter, Depends, Response

from app.auth import CurrentMember, host_only
from app.db import Db
from app.errors import ApiError
from app.items import ITEM_COLUMNS, fetch_item, parse_item_id, to_item
from app.logs import event
from app.schemas import AssigneeUpdate, DoneUpdate, ItemCreate

router = APIRouter()

MAX_ITEMS = 200


@router.post("/api/trips/{code}/items", status_code=201)
def add_item(body: ItemCreate, me: CurrentMember, db: Db):
    with db.cursor() as cur:
        # 여행 행을 잠가서 동시에 추가해도 200개를 넘지 않게 한다.
        cur.execute("SELECT code FROM trips WHERE code = %s FOR UPDATE", (me.trip_code,))
        cur.execute("SELECT COUNT(*) AS n FROM items WHERE trip_code = %s", (me.trip_code,))
        if cur.fetchone()["n"] >= MAX_ITEMS:
            raise ApiError(422, "VALIDATION_ERROR", f"항목은 여행당 {MAX_ITEMS}개까지입니다.")

        cur.execute(
            "INSERT INTO items (trip_code, name, category, source) VALUES (%s, %s, %s, 'custom')",
            (me.trip_code, body.name, body.category),
        )
        row = fetch_item(cur, me.trip_code, cur.lastrowid)
    event("항목 추가 %s | %s: %s", me.trip_code, me.nickname, body.name)
    return to_item(row)


@router.delete("/api/trips/{code}/items/{item_id}", status_code=204)
def delete_item(item_id: str, me: CurrentMember, db: Db):
    host_only(me)
    item_no = parse_item_id(item_id)
    with db.cursor() as cur:
        item = fetch_item(cur, me.trip_code, item_no)
        cur.execute("DELETE FROM items WHERE id = %s AND trip_code = %s", (item_no, me.trip_code))
    event("항목 삭제 %s | %s", me.trip_code, item["name"])
    return Response(status_code=204)


@router.put("/api/trips/{code}/items/{item_id}/assignee")
def set_assignee(
    item_id: str,
    body: AssigneeUpdate,
    me: CurrentMember,
    db: Db,
):
    item_no = parse_item_id(item_id)
    target = body.assignee_id
    with db.cursor() as cur:
        item = fetch_item(cur, me.trip_code, item_no)
        current = item["assignee_id"]

        if target is not None:
            cur.execute("SELECT nickname FROM members WHERE id = %s AND trip_code = %s", (target, me.trip_code))
            target_row = cur.fetchone()
            if target_row is None:
                raise ApiError(404, "MEMBER_NOT_FOUND", "그 참여자는 이 여행에 없습니다.")

        if target == current:
            return to_item(item)  # 바뀌는 것이 없으면 done도 그대로 둔다.

        if not me.is_host:
            if target is not None and target != me.id:
                raise ApiError(403, "NOT_ALLOWED", "자기 자신에게만 배정할 수 있습니다.")
            if target is None and current != me.id:
                raise ApiError(403, "NOT_ALLOWED", "다른 사람의 담당은 해제할 수 없습니다.")
            if target == me.id and current is not None:
                raise ApiError(409, "ITEM_TAKEN", "다른 사람이 이미 맡은 항목입니다.")

        if target == me.id and not me.is_host:
            # 명세 7번: 비어 있는 항목 맡기는 조건을 건 UPDATE 한 번으로
            cur.execute(
                "UPDATE items SET assignee_id = %s, done = FALSE WHERE id = %s AND trip_code = %s AND assignee_id IS NULL",
                (me.id, item_no, me.trip_code),
            )
            if cur.rowcount == 0:
                fetch_item(cur, me.trip_code, item_no)  # 그새 지워졌으면 ITEM_NOT_FOUND
                raise ApiError(409, "ITEM_TAKEN", "다른 사람이 먼저 맡았습니다.")
        else:
            # 담당자가 바뀌거나 해제되면 done은 false로 되돌린다.
            cur.execute(
                "UPDATE items SET assignee_id = %s, done = FALSE WHERE id = %s AND trip_code = %s",
                (target, item_no, me.trip_code),
            )

        row = fetch_item(cur, me.trip_code, item_no)

    if target is None:
        event("담당 해제 %s | %s", me.trip_code, item["name"])
    else:
        event("담당 %s | %s → %s", me.trip_code, item["name"], target_row["nickname"])
    return to_item(row)


@router.put("/api/trips/{code}/items/{item_id}/done")
def set_done(
    item_id: str,
    body: DoneUpdate,
    me: CurrentMember,
    db: Db,
):
    item_no = parse_item_id(item_id)
    with db.cursor() as cur:
        # 담당자가 동시에 바뀌지 않게 이 항목 행을 잠근다.
        cur.execute(
            f"SELECT {ITEM_COLUMNS} FROM items WHERE id = %s AND trip_code = %s FOR UPDATE",
            (item_no, me.trip_code),
        )
        item = cur.fetchone()
        if item is None:
            raise ApiError(404, "ITEM_NOT_FOUND", "항목을 찾을 수 없습니다.")
        if item["assignee_id"] is None:
            raise ApiError(409, "NO_ASSIGNEE", "담당자가 없는 항목입니다.")
        if item["assignee_id"] != me.id:
            raise ApiError(403, "NOT_YOUR_ITEM", "담당자만 체크할 수 있습니다.")

        cur.execute("UPDATE items SET done = %s WHERE id = %s", (body.done, item_no))
        row = fetch_item(cur, me.trip_code, item_no)
        cur.execute("SELECT COUNT(*) AS total, COALESCE(SUM(done), 0) AS done FROM items WHERE trip_code = %s", (me.trip_code,))
        progress = cur.fetchone()

    event(
        "%s %s | %s: %s | 진행 %d/%d",
        "체크" if body.done else "체크 해제", me.trip_code, me.nickname, item["name"],
        int(progress["done"]), int(progress["total"]),
    )
    return to_item(row)
