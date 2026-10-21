from typing import Annotated, Literal

from pydantic import BaseModel, StrictBool, StringConstraints

# 명세 "값 규칙": 앞뒤 공백 제거 후 nickname 1~20자, 항목 name 1~50자
Nickname = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)]
ItemName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
# 아이디: 영문·숫자·밑줄 4~20자(소문자로 저장). 비밀번호: 8~64자
Username = Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, pattern=r"^[A-Za-z0-9_]{4,20}$")]
Password = Annotated[str, StringConstraints(min_length=8, max_length=64)]
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


class SignupRequest(BaseModel):
    username: Username
    password: Password
    nickname: Nickname


class LoginRequest(BaseModel):
    username: Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, max_length=20)]
    password: Annotated[str, StringConstraints(max_length=64)]


class UserOut(BaseModel):
    user_id: int
    username: str
    nickname: str


class AuthResult(BaseModel):
    token: str
    user: UserOut
