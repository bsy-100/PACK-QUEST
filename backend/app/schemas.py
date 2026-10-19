from typing import Annotated, Literal

from pydantic import BaseModel, StringConstraints

# 명세 "값 규칙": 앞뒤 공백 제거 후 1~20자
Nickname = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)]


class TripCreate(BaseModel):
    region: Literal["domestic", "overseas"]
    transport: Literal["plane", "car", "train"]
    duration: Literal["day", "short", "long"]
    season: Literal["spring_fall", "summer", "winter"]
    nickname: Nickname


class MemberCreate(BaseModel):
    nickname: Nickname


class Me(BaseModel):
    member_id: int
    nickname: str
    is_host: bool


class TripCreated(BaseModel):
    code: str
    token: str
    me: Me


class MemberJoined(BaseModel):
    code: str
    token: str
    me: Me
