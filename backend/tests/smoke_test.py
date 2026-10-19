"""명세의 9개 API를 실제 서버에 요청해 확인한다. 테스트용 여행을 만들고 끝나면 지운다.

실행: python3 tests/smoke_test.py [http://127.0.0.1:8000/api]
"""

import json
import sys
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000/api"
results = []


def call(method, path, body=None, token=None, ip="198.51.100.1:1"):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("CloudFront-Viewer-Address", ip)
    if token:
        req.add_header("X-Pack-Token", token)
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


# 준비: 여행 + 참여자 2명
s, t = call("POST", "/trips", {"region": "overseas", "transport": "plane", "duration": "short", "season": "summer", "nickname": "host"})
code, host = t["code"], t["token"]
_, a = call("POST", f"/trips/{code}/members", {"nickname": "alice"})
_, b = call("POST", f"/trips/{code}/members", {"nickname": "bob"})
A, B = a["token"], b["token"]
host_id, a_id, b_id = t["me"]["member_id"], a["me"]["member_id"], b["me"]["member_id"]

# 다른 여행
_, t2 = call("POST", "/trips", {"region": "domestic", "transport": "train", "duration": "day", "season": "winter", "nickname": "other"})
code2, other = t2["code"], t2["token"]

print("== 4. 조회")
d = check("조회 OK", call("GET", f"/trips/{code}", token=A), 200)
items = d["items"]
cats = [i["category"] for i in items]
order = ["documents", "clothing", "toiletries", "electronics", "health", "etc"]
results.append(cats == sorted(cats, key=order.index)); print("PASS" if results[-1] else "FAIL", "카테고리 순 정렬")
results.append(d["trip"]["created_at"].endswith("Z")); print("PASS" if results[-1] else "FAIL", "created_at Z", d["trip"]["created_at"])
results.append(len(d["progress"]["by_member"]) == 3 and all(m["assigned"] == 0 for m in d["progress"]["by_member"])); print("PASS" if results[-1] else "FAIL", "by_member 0개도 포함")
results.append(isinstance(items[0]["done"], bool) and d["me"]["is_host"] is False); print("PASS" if results[-1] else "FAIL", "true/false로 나옴")
check("토큰 없음", call("GET", f"/trips/{code}"), 401, "TOKEN_MISSING")
check("틀린 토큰", call("GET", f"/trips/{code}", token="nope"), 401, "TOKEN_INVALID")
check("다른 여행 토큰", call("GET", f"/trips/{code}", token=other), 401, "TOKEN_INVALID")
check("없는 코드 + 토큰 없음(존재 숨김)", call("GET", "/trips/ZZZZZZZZ"), 401, "TOKEN_MISSING")
check("형식 틀린 코드", call("GET", "/trips/abc", token=A), 401, "TOKEN_INVALID")
check("소문자 코드", call("GET", f"/trips/{code.lower()}", token=A), 200)

print("== 5. 항목 추가")
new = check("추가", call("POST", f"/trips/{code}/items", {"name": " 보조배터리2 ", "category": "electronics"}, token=A), 201)
results.append(new["source"] == "custom" and new["assignee_id"] is None and new["done"] is False and new["name"] == "보조배터리2"); print("PASS" if results[-1] else "FAIL", "custom·담당 없음·미완료·공백 제거")
check("잘못된 분류", call("POST", f"/trips/{code}/items", {"name": "x", "category": "food"}, token=A), 422, "VALIDATION_ERROR")
check("51자 이름", call("POST", f"/trips/{code}/items", {"name": "가" * 51, "category": "etc"}, token=A), 422, "VALIDATION_ERROR")

i1, i2 = items[0]["item_id"], items[1]["item_id"]

print("== 7. 담당자")
check("alice가 빈 항목 맡기", call("PUT", f"/trips/{code}/items/{i1}/assignee", {"assignee_id": a_id}, token=A), 200)
check("bob이 alice 항목 맡기", call("PUT", f"/trips/{code}/items/{i1}/assignee", {"assignee_id": b_id}, token=B), 409, "ITEM_TAKEN")
check("bob이 alice 담당 해제", call("PUT", f"/trips/{code}/items/{i1}/assignee", {"assignee_id": None}, token=B), 403, "NOT_ALLOWED")
check("bob이 alice에게 배정", call("PUT", f"/trips/{code}/items/{i2}/assignee", {"assignee_id": a_id}, token=B), 403, "NOT_ALLOWED")
check("없는 참여자", call("PUT", f"/trips/{code}/items/{i2}/assignee", {"assignee_id": 999999}, token=host), 404, "MEMBER_NOT_FOUND")
check("다른 여행 참여자", call("PUT", f"/trips/{code}/items/{i2}/assignee", {"assignee_id": t2["me"]["member_id"]}, token=host), 404, "MEMBER_NOT_FOUND")
check("숫자 아닌 item_id", call("PUT", f"/trips/{code}/items/abc/assignee", {"assignee_id": a_id}, token=A), 404, "ITEM_NOT_FOUND")
check("다른 여행의 항목", call("PUT", f"/trips/{code2}/items/{i2}/assignee", {"assignee_id": None}, token=other), 404, "ITEM_NOT_FOUND")
check("assignee_id 빠짐", call("PUT", f"/trips/{code}/items/{i2}/assignee", {}, token=A), 422, "VALIDATION_ERROR")

print("== 8. 완료 체크")
check("담당자 없는 항목", call("PUT", f"/trips/{code}/items/{i2}/done", {"done": True}, token=A), 409, "NO_ASSIGNEE")
check("다른 사람 항목", call("PUT", f"/trips/{code}/items/{i1}/done", {"done": True}, token=B), 403, "NOT_YOUR_ITEM")
check("주최자도 남의 항목은 불가", call("PUT", f"/trips/{code}/items/{i1}/done", {"done": True}, token=host), 403, "NOT_YOUR_ITEM")
r = check("alice 체크", call("PUT", f"/trips/{code}/items/{i1}/done", {"done": True}, token=A), 200)
results.append(r["done"] is True); print("PASS" if results[-1] else "FAIL", "done true")
check("done에 문자열", call("PUT", f"/trips/{code}/items/{i1}/done", {"done": "yes"}, token=A), 422, "VALIDATION_ERROR")

d = call("GET", f"/trips/{code}", token=host)[1]
pm = {m["member_id"]: m for m in d["progress"]["by_member"]}
results.append(d["progress"]["done"] == 1 and pm[a_id] == {"member_id": a_id, "assigned": 1, "done": 1, "rate": 100}); print("PASS" if results[-1] else "FAIL", "진행률 반영", d["progress"]["total"], d["progress"]["done"], d["progress"]["rate"], pm[a_id])

r = check("주최자가 bob에게 재배정", call("PUT", f"/trips/{code}/items/{i1}/assignee", {"assignee_id": b_id}, token=host), 200)
results.append(r["assignee_id"] == b_id and r["done"] is False); print("PASS" if results[-1] else "FAIL", "재배정 시 done=false")
r = check("bob 자기 담당 해제", call("PUT", f"/trips/{code}/items/{i1}/assignee", {"assignee_id": None}, token=B), 200)
results.append(r["assignee_id"] is None); print("PASS" if results[-1] else "FAIL", "해제됨")

print("== 6. 항목 삭제")
check("참여자 삭제 불가", call("DELETE", f"/trips/{code}/items/{i2}", token=A), 403, "HOST_ONLY")
check("주최자 삭제", call("DELETE", f"/trips/{code}/items/{i2}", token=host), 204)
check("이미 삭제된 항목", call("DELETE", f"/trips/{code}/items/{i2}", token=host), 404, "ITEM_NOT_FOUND")

print("== 200개 상한")
n = call("GET", f"/trips/{code}", token=host)[1]["progress"]["total"]
for k in range(200 - n):
    call("POST", f"/trips/{code}/items", {"name": f"x{k}", "category": "etc"}, token=A)
check("200개째 넘김", call("POST", f"/trips/{code}/items", {"name": "over", "category": "etc"}, token=A), 422, "VALIDATION_ERROR")

print("== 9. 여행 삭제")
check("참여자 삭제 불가", call("DELETE", f"/trips/{code}", token=A), 403, "HOST_ONLY")
check("주최자 삭제", call("DELETE", f"/trips/{code}", token=host), 204)
check("삭제 후 조회", call("GET", f"/trips/{code}", token=A), 401, "TOKEN_INVALID")
check("삭제 후 참여", call("POST", f"/trips/{code}/members", {"nickname": "late"}), 404, "TRIP_NOT_FOUND")

call("DELETE", f"/trips/{code2}", token=other)
print(f"\n{sum(results)}/{len(results)} passed")
