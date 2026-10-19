import pymysql
from fastapi import APIRouter, Depends

from app import recommend, security
from app.db import get_db
from app.errors import ApiError
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
