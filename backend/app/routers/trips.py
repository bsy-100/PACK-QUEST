import pymysql
from fastapi import APIRouter, Depends, Response

from app import recommend, security
from app.auth import Member, current_member, host_only
from app.db import get_db
from app.errors import ApiError
from app.items import ITEM_COLUMNS, to_item
from app.schemas import Me, MemberCreate, MemberJoined, TripCreate, TripCreated

router = APIRouter()

DUPLICATE_KEY = 1062


def _is_duplicate(exc: pymysql.err.IntegrityError, key: str) -> bool:
    return exc.args[0] == DUPLICATE_KEY and key in str(exc.args[1])


def _insert_member(cur, code: str, nickname: str, is_host: bool) -> tuple[int, str]:
    token = security.new_token()
    try:
        cur.execute(
            "INSERT INTO members (trip_code, nickname, token_hash, is_host) VALUES (%s, %s, %s, %s)",
            (code, nickname, security.hash_token(token), is_host),
        )
    except pymysql.err.IntegrityError as exc:
        if _is_duplicate(exc, "uq_members_nickname"):
            raise ApiError(409, "NICKNAME_TAKEN", "이미 쓰는 닉네임입니다.") from exc
        raise
    return cur.lastrowid, token


@router.post(
    "/api/trips",
    status_code=201,
    response_model=TripCreated,
    dependencies=[Depends(security.create_trip_limit)],
)
def create_trip(body: TripCreate, db: pymysql.Connection = Depends(get_db)):
    with db.cursor() as cur:
        # 명세 "공유 코드": 기본 키가 겹치면 새로 뽑아 다시 넣는다.
        for _ in range(5):
            code = security.new_code()
            try:
                cur.execute(
                    "INSERT INTO trips (code, region, transport, duration, season) VALUES (%s, %s, %s, %s, %s)",
                    (code, body.region, body.transport, body.duration, body.season),
                )
                break
            except pymysql.err.IntegrityError as exc:
                if not _is_duplicate(exc, "PRIMARY"):
                    raise
        else:
            raise RuntimeError("공유 코드 생성 실패")

        member_id, token = _insert_member(cur, code, body.nickname, is_host=True)

        items = recommend.build(body.region, body.transport, body.duration, body.season)
        cur.executemany(
            "INSERT INTO items (trip_code, name, category, source) VALUES (%s, %s, %s, 'recommended')",
            [(code, item["name"], item["category"]) for item in items],
        )

    return TripCreated(code=code, token=token, me=Me(member_id=member_id, nickname=body.nickname, is_host=True))


@router.post(
    "/api/trips/{code}/members",
    status_code=201,
    response_model=MemberJoined,
    dependencies=[Depends(security.join_trip_limit)],
)
def join_trip(code: str, body: MemberCreate, db: pymysql.Connection = Depends(get_db)):
    # 명세 "값 규칙": 형식이 틀린 코드도 TRIP_NOT_FOUND
    normalized = security.normalize_code(code)
    with db.cursor() as cur:
        if normalized:
            cur.execute("SELECT code FROM trips WHERE code = %s", (normalized,))
        if not normalized or cur.fetchone() is None:
            raise ApiError(404, "TRIP_NOT_FOUND", "여행을 찾을 수 없습니다.")

        member_id, token = _insert_member(cur, normalized, body.nickname, is_host=False)

    return MemberJoined(code=normalized, token=token, me=Me(member_id=member_id, nickname=body.nickname, is_host=False))


def _rate(done: int, total: int) -> int:
    # 0~100 정수, 반올림(0.5는 올림). 항목이 0개면 0.
    return (done * 200 + total) // (total * 2) if total else 0


@router.get("/api/trips/{code}")
def get_trip(me: Member = Depends(current_member), db: pymysql.Connection = Depends(get_db)):
    code = me.trip_code
    with db.cursor() as cur:
        cur.execute(
            "SELECT code, region, transport, duration, season, created_at FROM trips WHERE code = %s", (code,)
        )
        trip = cur.fetchone()

        cur.execute("SELECT id, nickname, is_host FROM members WHERE trip_code = %s ORDER BY id", (code,))
        members = cur.fetchall()

        # 명세 4번: 카테고리 순(ENUM 정의 순서), 그 안에서 item_id 순
        cur.execute(f"SELECT {ITEM_COLUMNS} FROM items WHERE trip_code = %s ORDER BY category, id", (code,))
        items = cur.fetchall()

        cur.execute(
            """SELECT COUNT(*) AS total,
                      COALESCE(SUM(done), 0) AS done,
                      COALESCE(SUM(assignee_id IS NULL), 0) AS unassigned
               FROM items WHERE trip_code = %s""",
            (code,),
        )
        totals = cur.fetchone()

        # 아무것도 맡지 않은 참여자도 assigned 0으로 나오게 LEFT JOIN
        cur.execute(
            """SELECT m.id AS member_id,
                      COUNT(i.id) AS assigned,
                      COALESCE(SUM(i.done), 0) AS done
               FROM members m LEFT JOIN items i ON i.assignee_id = m.id
               WHERE m.trip_code = %s
               GROUP BY m.id ORDER BY m.id""",
            (code,),
        )
        by_member = cur.fetchall()

        cur.execute(
            """SELECT category, COUNT(*) AS total, COALESCE(SUM(done), 0) AS done
               FROM items WHERE trip_code = %s GROUP BY category ORDER BY category""",
            (code,),
        )
        by_category = cur.fetchall()

    total, done = int(totals["total"]), int(totals["done"])
    return {
        "trip": {
            "code": trip["code"],
            "region": trip["region"],
            "transport": trip["transport"],
            "duration": trip["duration"],
            "season": trip["season"],
            "created_at": trip["created_at"].isoformat() + "Z",
        },
        "me": {"member_id": me.id, "nickname": me.nickname, "is_host": me.is_host},
        "members": [
            {"member_id": m["id"], "nickname": m["nickname"], "is_host": bool(m["is_host"])} for m in members
        ],
        "items": [to_item(row) for row in items],
        "progress": {
            "total": total,
            "done": done,
            "unassigned": int(totals["unassigned"]),
            "rate": _rate(done, total),
            "by_member": [
                {
                    "member_id": row["member_id"],
                    "assigned": int(row["assigned"]),
                    "done": int(row["done"]),
                    "rate": _rate(int(row["done"]), int(row["assigned"])),
                }
                for row in by_member
            ],
            "by_category": [
                {"category": row["category"], "total": int(row["total"]), "done": int(row["done"])}
                for row in by_category
            ],
        },
    }


@router.delete("/api/trips/{code}", status_code=204)
def delete_trip(me: Member = Depends(current_member), db: pymysql.Connection = Depends(get_db)):
    host_only(me)
    with db.cursor() as cur:
        # members, items는 ON DELETE CASCADE로 함께 지워진다.
        cur.execute("DELETE FROM trips WHERE code = %s", (me.trip_code,))
    return Response(status_code=204)
