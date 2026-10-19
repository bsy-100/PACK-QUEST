from typing import Annotated, Literal

from pydantic import BaseModel, StrictBool, StringConstraints

# 명세 "값 규칙": 앞뒤 공백 제거 후 nickname 1~20자, 항목 name 1~50자
Nickname = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)]
ItemName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
Category = Literal["documents", "clothing", "toiletries", "electronics", "health", "etc"]


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


class ItemCreate(BaseModel):
    name: ItemName
    category: Category


class AssigneeUpdate(BaseModel):
    # 기본값이 없으므로 반드시 보내야 하고, null은 해제다.
    assignee_id: int | None


class DoneUpdate(BaseModel):
    done: StrictBool
