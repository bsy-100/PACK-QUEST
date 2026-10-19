"""명세 "검사 순서": 토큰이 필요한 API(4~9번)는 토큰부터 확인한다."""

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header

from app import security
from app.db import Db
from app.errors import ApiError


@dataclass
class Member:
    id: int
    trip_code: str
    nickname: str
    is_host: bool


def current_member(
    code: str,
    db: Db,
    x_pack_token: Annotated[str | None, Header()] = None,
) -> Member:
    if not x_pack_token:
        raise ApiError(401, "TOKEN_MISSING", "토큰이 없습니다.")

    with db.cursor() as cur:
        cur.execute(
            "SELECT id, trip_code, nickname, is_host FROM members WHERE token_hash = %s",
            (security.hash_token(x_pack_token),),
        )
        row = cur.fetchone()

    # 토큰이 틀리거나, 경로의 여행과 다르면 여행이 있는지는 알려주지 않는다.
    # 여행이 삭제되면 members도 연쇄 삭제되므로 그 토큰도 여기서 걸린다.
    if row is None or row["trip_code"] != security.normalize_code(code):
        raise ApiError(401, "TOKEN_INVALID", "토큰이 올바르지 않습니다.")

    return Member(id=row["id"], trip_code=row["trip_code"], nickname=row["nickname"], is_host=bool(row["is_host"]))


CurrentMember = Annotated[Member, Depends(current_member)]


def host_only(member: Member) -> None:
    if not member.is_host:
        raise ApiError(403, "HOST_ONLY", "주최자만 할 수 있습니다.")
