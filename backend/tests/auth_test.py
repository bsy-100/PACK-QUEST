"""로그인(선택) API를 실제 서버에 요청해 확인한다. 테스트 계정은 지울 API가 없어 남는다(아이디에 시각을 붙인다).

실행: python3 tests/auth_test.py [http://127.0.0.1:8000/api]
"""

import json
import sys
import time
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000/api"
results = []


def call(method, path, body=None, token=None, auth=None, ip="198.51.100.2:1"):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("CloudFront-Viewer-Address", ip)
    if token:
        req.add_header("X-Pack-Token", token)
    if auth:
        req.add_header("X-Auth-Token", auth)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return r.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def check(name, got, status, code=None):
    s, b = got
    ok = s == status and (code is None or (b or {}).get("detail", {}).get("code") == code)
    results.append(ok)
    print(("PASS" if ok else "FAIL"), name, s, (b or {}).get("detail", {}).get("code", "") if s >= 400 else "")
    return b


def expect(name, ok):
    results.append(bool(ok))
    print("PASS" if ok else "FAIL", name)


uid = f"t{int(time.time() * 1000) % 10**10}"
TRIP = {"region": "domestic", "transport": "car", "duration": "day", "season": "summer"}

print("== 회원가입")
r = check("가입", call("POST", "/auth/signup", {"username": uid.upper(), "password": "password1", "nickname": " 준호 "}), 201)
expect("아이디 소문자·닉네임 공백 제거", r["user"]["username"] == uid and r["user"]["nickname"] == "준호")
AUTH = r["token"]
check("같은 아이디", call("POST", "/auth/signup", {"username": uid, "password": "password1", "nickname": "x"}), 409, "USERNAME_TAKEN")
check("짧은 아이디", call("POST", "/auth/signup", {"username": "ab", "password": "password1", "nickname": "x"}), 422, "VALIDATION_ERROR")
check("한글 아이디", call("POST", "/auth/signup", {"username": "준호준호", "password": "password1", "nickname": "x"}), 422, "VALIDATION_ERROR")
check("짧은 비밀번호", call("POST", "/auth/signup", {"username": uid + "x", "password": "short", "nickname": "x"}), 422, "VALIDATION_ERROR")

print("== 로그인")
r = check("로그인", call("POST", "/auth/login", {"username": uid, "password": "password1"}), 200)
AUTH2 = r["token"]
expect("로그인마다 새 토큰", AUTH2 != AUTH)
check("틀린 비밀번호", call("POST", "/auth/login", {"username": uid, "password": "wrong-pass"}), 401, "LOGIN_FAILED")
check("없는 아이디(같은 오류)", call("POST", "/auth/login", {"username": uid + "zz", "password": "password1"}), 401, "LOGIN_FAILED")

print("== 내 정보")
check("로그인 없음", call("GET", "/me"), 401, "AUTH_MISSING")
check("틀린 로그인 토큰", call("GET", "/me", auth="nope"), 401, "AUTH_INVALID")
r = check("빈 목록", call("GET", "/me", auth=AUTH), 200)
expect("여행 0개", r["trips"] == [] and r["user"]["username"] == uid)

print("== 여행 연결")
s, t = call("POST", "/trips", {**TRIP, "nickname": "host"}, auth=AUTH)
check("로그인하고 여행 만들기", (s, t), 201)
code, host_token = t["code"], t["token"]
check("틀린 로그인 토큰으로 만들기", call("POST", "/trips", {**TRIP, "nickname": "h"}, auth="nope"), 401, "AUTH_INVALID")
s, guest = call("POST", "/trips", {**TRIP, "nickname": "guest"})
check("비로그인 여행 만들기(기존 그대로)", (s, guest), 201)
check("같은 계정으로 같은 여행 다시 참여", call("POST", f"/trips/{code}/members", {"nickname": "again"}, auth=AUTH2), 409, "ALREADY_JOINED")
check("비로그인은 같은 여행 여러 명 가능", call("POST", f"/trips/{code}/members", {"nickname": "anon"}), 201)
s, g = call("POST", f"/trips/{guest['code']}/members", {"nickname": "준호"}, auth=AUTH)
check("로그인하고 참여", (s, g), 201)

r = call("GET", "/me", auth=AUTH2)[1]
expect("목록 2개, 최근 참여 순", [x["code"] for x in r["trips"]] == [guest["code"], code])
expect("주최자 여부·진행률", r["trips"][1]["me"]["is_host"] is True and r["trips"][1]["progress"]["total"] > 0 and r["trips"][0]["me"]["is_host"] is False)

print("== 다른 기기에서 다시 들어가기")
r = check("토큰 재발급", call("POST", f"/me/trips/{code.lower()}/token", auth=AUTH2), 200)
new_token = r["token"]
expect("주최자 그대로", r["me"]["is_host"] is True and r["code"] == code)
check("새 토큰으로 조회", call("GET", f"/trips/{code}", token=new_token), 200)
check("예전 기기 토큰은 무효", call("GET", f"/trips/{code}", token=host_token), 401, "TOKEN_INVALID")
check("참여 안 한 여행", call("POST", "/me/trips/ZZZZZZZZ/token", auth=AUTH2), 404, "TRIP_NOT_FOUND")
check("로그인 없이 재발급", call("POST", f"/me/trips/{code}/token"), 401, "AUTH_MISSING")

print("== 로그아웃")
check("로그아웃", call("POST", "/auth/logout", auth=AUTH), 204)
check("로그아웃한 토큰", call("GET", "/me", auth=AUTH), 401, "AUTH_INVALID")
check("다른 기기 로그인은 유지", call("GET", "/me", auth=AUTH2), 200)

print("== 여행 삭제 후")
call("DELETE", f"/trips/{code}", token=new_token)
call("DELETE", f"/trips/{guest['code']}", token=guest["token"])
r = call("GET", "/me", auth=AUTH2)[1]
expect("삭제된 여행은 목록에서 빠짐", r["trips"] == [])

print("== 요청 제한(같은 IP 1분 30회)")
codes = [call("POST", "/auth/login", {"username": uid, "password": "x"}, ip="198.51.100.99:1")[0] for _ in range(31)]
expect("31번째 429", codes[:30].count(401) == 30 and codes[30] == 429)

print(f"\n{sum(results)}/{len(results)} passed")
