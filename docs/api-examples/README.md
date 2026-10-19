# API 응답 예시 (화면 개발용)

로컬 서버에 실제로 요청해서 받은 응답이다. 화면을 만들 때 임시 데이터로 그대로 쓰면 된다. 규칙은 PACK QUEST API 명세를 따른다.

- 파일 하나에 요청(`request`)과 응답(`response.status`, `response.body`)이 들어 있다.
- 공유 코드는 명세 예시와 같은 `K7M3QX9P`로, 토큰은 `<주최자 토큰>`·`<참여자 토큰>`으로 바꿔 두었다. `member_id`·`item_id`는 실제 값이다.
- 토큰이 필요한 요청은 `X-Pack-Token` 헤더에 넣는다.

| 파일 | API | 상태 |
|---|---|---|
| `01_health.json` | `GET /api/health` | 200 |
| `02_create_trip.json` | `POST /api/trips` 여행 만들기 | 201 |
| `03_join_trip.json` | `POST /api/trips/{code}/members` 참여(소문자 코드로 보내도 응답 `code`는 대문자) | 201 |
| `04_get_trip.json` | `GET /api/trips/{code}` 전체 상태(5초 폴링). 공용 항목 22개, 1개 체크된 상태 | 200 |
| `05_add_item.json` | `POST /api/trips/{code}/items` 항목 추가 | 201 |
| `06_delete_item.json` | `DELETE /api/trips/{code}/items/{item_id}` 항목 삭제(본문 없음) | 204 |
| `07_set_assignee.json`, `07_unset_assignee.json` | `PUT .../assignee` 맡기·해제 | 200 |
| `08_set_done.json` | `PUT .../done` 완료 체크 | 200 |
| `09_delete_trip.json` | `DELETE /api/trips/{code}` 여행 삭제(본문 없음) | 204 |
| `err_*.json` | 대표 오류 7가지. 화면은 `detail.code`로 분기한다 | 401·403·404·409·422 |

서버가 주는 추천 목록은 **공용 준비물**(나눠 맡는 것)뿐이다. 여권·칫솔·옷 같은 **개인 준비물**은 서버에 없으므로, 화면이 "내 짐" 체크리스트를 따로 두고 브라우저에만 저장한다(팀 진행률에는 들어가지 않는다).

화면에서 기억할 것(명세 요약):

- 토큰 저장 키는 `packquest:<응답의 code>`. 사용자가 입력한 코드가 아니라 응답의 대문자 코드를 쓴다.
- `TOKEN_MISSING`, `TOKEN_INVALID`, `TRIP_NOT_FOUND`를 받으면 저장한 토큰을 지우고 입장 화면으로 보낸다.
- 응답이 JSON이 아니면(서버가 꺼져 CloudFront가 HTML을 줄 때) `SERVER_ERROR`로 처리한다.
- `items`는 이미 분류 순으로 정렬돼 온다. `created_at`은 UTC(`Z`)다.
