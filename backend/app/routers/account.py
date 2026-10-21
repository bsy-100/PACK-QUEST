"""로그인(선택): 계정을 만들면 내 여행 목록을 보고, 다른 기기에서 참여자로 다시 들어갈 수 있다.

여행 안의 권한 검사는 그대로 X-Pack-Token으로 한다. 계정은 참여자(members.user_id)에 연결만 한다.
"""

import pymysql
from fastapi import APIRouter, Depends, Response

from app import security
from app.auth import CurrentUser
from app.db import Db
from app.errors import ApiError
from app.logs import event
from app.routers.trips import rate
from app.schemas import AuthResult, LoginRequest, MemberJoined, Me, SignupRequest, UserOut

router = APIRouter()

SESSION_DAYS = 30
DUPLICATE_KEY = 1062


def _new_session(cur, user_id: int) -> str:
    token = security.new_token()
    cur.execute(
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (%s, %s, UTC_TIMESTAMP() + INTERVAL %s DAY)",
        (security.hash_token(token), user_id, SESSION_DAYS),
    )
    return token


@router.post(
    "/api/auth/signup",
    status_code=201,
    response_model=AuthResult,
    dependencies=[Depends(security.auth_limit)],
)
def signup(body: SignupRequest, db: Db):
    with db.cursor() as cur:
        try:
            cur.execute(
                "INSERT INTO users (username, password_hash, nickname) VALUES (%s, %s, %s)",
                (body.username, security.hash_password(body.password), body.nickname),
            )
        except pymysql.err.IntegrityError as exc:
            if exc.args[0] == DUPLICATE_KEY:
                raise ApiError(409, "USERNAME_TAKEN", "이미 쓰는 아이디입니다.") from exc
            raise
        user_id = cur.lastrowid
        token = _new_session(cur, user_id)
    event("회원가입 %s", body.username)
    return AuthResult(token=token, user=UserOut(user_id=user_id, username=body.username, nickname=body.nickname))


@router.post("/api/auth/login", response_model=AuthResult, dependencies=[Depends(security.auth_limit)])
def login(body: LoginRequest, db: Db):
    with db.cursor() as cur:
        cur.execute("SELECT id, username, nickname, password_hash FROM users WHERE username = %s", (body.username,))
        row = cur.fetchone()
        # 아이디가 없는지, 비밀번호가 틀렸는지 구분하지 않는다.
        if not security.verify_password(body.password, row and row["password_hash"]):
            raise ApiError(401, "LOGIN_FAILED", "아이디 또는 비밀번호가 올바르지 않습니다.")
        token = _new_session(cur, row["id"])
    event("로그인 %s", row["username"])
    return AuthResult(token=token, user=UserOut(user_id=row["id"], username=row["username"], nickname=row["nickname"]))


@router.post("/api/auth/logout", status_code=204)
def logout(user: CurrentUser, db: Db):
    with db.cursor() as cur:
        cur.execute("DELETE FROM sessions WHERE token_hash = %s", (user.session_hash,))
    return Response(status_code=204)


@router.get("/api/me")
def me(user: CurrentUser, db: Db):
    with db.cursor() as cur:
        # 내가 참여한 여행(최근 참여 순)과 전체 진행률
        cur.execute(
            """SELECT t.code, t.region, t.transport, t.duration, t.season, t.created_at,
                      m.id AS member_id, m.nickname, m.is_host, m.joined_at,
                      COUNT(i.id) AS total, COALESCE(SUM(i.done), 0) AS done
               FROM members m
               JOIN trips t ON t.code = m.trip_code
               LEFT JOIN items i ON i.trip_code = t.code
               WHERE m.user_id = %s
               GROUP BY m.id
               ORDER BY m.joined_at DESC, m.id DESC""",
            (user.id,),
        )
        rows = cur.fetchall()
    return {
        "user": {"user_id": user.id, "username": user.username, "nickname": user.nickname},
        "trips": [
            {
                "code": r["code"],
                "region": r["region"],
                "transport": r["transport"],
                "duration": r["duration"],
                "season": r["season"],
                "created_at": r["created_at"].isoformat() + "Z",
                "me": {"member_id": r["member_id"], "nickname": r["nickname"], "is_host": bool(r["is_host"])},
                "progress": {"total": int(r["total"]), "done": int(r["done"]), "rate": rate(int(r["done"]), int(r["total"]))},
            }
            for r in rows
        ],
    }


@router.post("/api/me/trips/{code}/token", response_model=MemberJoined)
def reissue_token(code: str, user: CurrentUser, db: Db):
    """다른 기기에서 참여자로 다시 들어가기. 토큰은 해시로만 저장하므로 새로 발급하고,
    예전 기기의 X-Pack-Token은 더 이상 쓸 수 없다."""
    normalized = security.normalize_code(code)
    with db.cursor() as cur:
        row = None
        if normalized:
            cur.execute(
                "SELECT id, nickname, is_host FROM members WHERE trip_code = %s AND user_id = %s",
                (normalized, user.id),
            )
            row = cur.fetchone()
        # 참여하지 않은 여행은 있는지 없는지 알려주지 않는다.
        if row is None:
            raise ApiError(404, "TRIP_NOT_FOUND", "참여한 여행이 아닙니다.")
        token = security.new_token()
        cur.execute("UPDATE members SET token_hash = %s WHERE id = %s", (security.hash_token(token), row["id"]))
    event("다른 기기에서 다시 참여 %s | %s", normalized, row["nickname"])
    return MemberJoined(
        code=normalized, token=token, me=Me(member_id=row["id"], nickname=row["nickname"], is_host=bool(row["is_host"]))
    )
