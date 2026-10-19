# PACK QUEST API 명세

2026-10-19 · @전준호

> 원본은 claude.ai 문서다: https://claude.ai/artifact/ACZBB5RKAgfmQLqfoRjffP . 이 파일은 2026-10-19에 내보낸 사본이므로, 원본을 고치면 이 파일도 다시 내보내 올린다.

아래 "확정 사항" 4가지는 2026-10-19에 제안대로 확정했다. PRD v4.3의 "API 공통 규칙"을 따른다.

## 확정 사항

아래 네 가지는 제안대로 확정했다(2026-10-19). 이후 바뀌면 이 문서와 PRD를 같이 고친다.

| # | 제안 | 이유 | PRD와 달라지는 점 |
| --- | --- | --- | --- |
| 1 | 주최자도 여행을 만들 때 닉네임을 입력해 members에 등록하고, `is_host` 표시를 단다. 토큰은 사람마다 하나만 쓴다. | 주최자에게도 항목을 배정할 수 있고 진행률에 나온다. 토큰이 하나라 화면과 서버가 단순해진다. | trips의 "주최자 토큰 해시" 대신 members의 `is_host`로 주최자를 구분한다. |
| 2 | 엄격한 요청 제한은 여행 만들기와 참여하기에만 건다. 5초 폴링(여행 조회)은 넉넉하게 둔다. | 발표장에서 청중이 같은 IP로 몰려도 데모가 막히지 않는다. | 없음(PRD의 요청 제한을 구체화). |
| 3 | items의 담당자 FK는 `ON DELETE SET NULL`로 둔다. | 여행 삭제 때 참여자가 지워지면서 생기는 FK 오류를 막는다. | 없음(데이터 모델 보완). |
| 4 | 항목 삭제는 주최자만 한다. 항목 추가는 참여자 누구나 한다. | 다른 사람이 맡은 항목을 참여자가 지우는 일을 막는다. | FR-04의 삭제 권한을 구체화. |

1번(is_host)이 확정됐으므로 PRD의 두 곳도 고쳐야 한다. 역할 표의 "주최자 관리 토큰 / 수정 토큰"과 데이터 모델의 "trips: 주최자 토큰 해시"다.

## 공통 규칙

| 항목 | 규칙 |
| --- | --- |
| 경로 | 모든 API는 `/api` 아래에 둔다. 화면은 상대 경로(`/api/...`)로 부른다. |
| 형식 | 요청과 응답 본문은 JSON(UTF-8)이다. 참·거짓 값(done, is_host)은 DB의 0/1이 아니라 JSON의 true/false로 내보낸다. 시각은 UTC 기준 ISO 8601 문자열이고 끝에 Z를 붙인다(예: `2026-10-21T05:03:00Z`). EC2 기본 시간대가 UTC라, 시간대 표시 없이 내보내면 화면이 한국 시각으로 잘못 읽어 9시간 차이가 날 수 있기 때문이다. |
| 토큰 | 여행 만들기와 참여하기 응답으로 받은 토큰을 이후 모든 요청의 `X-Pack-Token` 헤더에 넣는다. `Authorization` 헤더는 쓰지 않는다. |
| 토큰 보관 | 화면은 `localStorage`에 `packquest:<공유 코드>` 키로 토큰을 저장한다. &lt;공유 코드&gt;는 사용자가 입력한 값이 아니라 여행 만들기·참여하기 응답의 code(대문자)를 쓴다. 토큰이 무효라는 응답(TOKEN_INVALID)이나 여행이 없다는 응답(`TRIP_NOT_FOUND`)을 받으면 그 키를 지운다. |
| 공유 코드 | 8자리, 글자는 `23456789ABCDEFGHJKMNPQRSTUVWXYZ`(0, O, 1, I, L 제외)에서 고른다. 서버는 입력받은 코드를 대문자로 바꿔 비교한다. 새 코드가 기존 코드와 겹치면(기본 키 중복) 새로 뽑아 다시 넣는다. |
| 토큰 생성 | 서버는 `secrets.token_urlsafe(32)`로 만들고 SHA-256 해시(64자)만 DB에 저장한다. 원문은 응답에 한 번만 담는다. |
| 범위 확인 | 경로의 공유 코드와 토큰의 여행이 다르면 거부한다. 항목 ID도 그 여행의 항목인지 확인한다. 다른 여행의 데이터를 건드릴 수 없게 하기 위해서다. |
| 검사 순서 | 토큰이 필요한 API(4~9번)는 토큰부터 확인한다. 헤더가 없으면 TOKEN_MISSING, 토큰이 틀리거나 경로의 여행과 다르면 TOKEN_INVALID(401)만 주고, 그 코드의 여행이 있는지는 알려주지 않는다. 요청 제한이 없는 4번으로 공유 코드를 대입해 보지 못하게 하기 위해서다. 토큰 검사를 통과하면 여행은 반드시 있으므로 4~9번은 TRIP_NOT_FOUND를 주지 않는다. |
| DB 시간대 | 서버는 DB에 연결할 때마다 SET time_zone = '+00:00'을 실행한다. DEFAULT CURRENT_TIMESTAMP는 세션 시간대를 따르므로, 서버 시간대가 Asia/Seoul이거나 팀원 PC의 로컬 MariaDB에서 개발하면 한국 시각이 저장되고, 거기에 Z를 붙이면 9시간이 틀어지기 때문이다. |
| 오류 형식 | `{"detail": {"code": "TRIP_NOT_FOUND", "message": "여행을 찾을 수 없습니다."}}`. FastAPI의 기본 입력 검증 오류(422), 기본 404(없는 경로), 405(잘못된 메서드), 처리하지 못한 예외(500)도 예외 처리기로 같은 형식으로 바꾼다(쓸 code는 오류 코드 표의 NOT_FOUND, METHOD_NOT_ALLOWED, SERVER_ERROR). 기본 형식은 detail이 문자열({"detail": "Not Found"})이라 화면이 detail.code를 읽다가 오류가 나기 때문이다. 서버가 꺼져 CloudFront가 HTML로 502/504를 보내는 등 JSON이 아닌 오류 응답은 화면이 SERVER_ERROR로 처리한다. |

## 엔드포인트 목록

API는 9개이며, FR-01~07을 모두 덮는다.

| # | 메서드 | 경로 | 하는 일 | 토큰 | 호출할 수 있는 사람 | FR |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | GET | `/api/health` | 서버 상태 확인 | 없음 | 누구나 | - |
| 2 | POST | `/api/trips` | 여행 만들기, 추천 목록 생성 | 없음 | 누구나 | FR-01, FR-02 |
| 3 | POST | `/api/trips/{code}/members` | 코드로 참여 | 없음 | 누구나 | FR-03 |
| 4 | GET | `/api/trips/{code}` | 여행 전체 상태 조회(5초 폴링) | 필요 | 그 여행의 참여자 | FR-04~06 |
| 5 | POST | `/api/trips/{code}/items` | 항목 추가 | 필요 | 그 여행의 참여자 | FR-04 |
| 6 | DELETE | `/api/trips/{code}/items/{item_id}` | 항목 삭제 | 필요 | 주최자 | FR-04 |
| 7 | PUT | `/api/trips/{code}/items/{item_id}/assignee` | 담당자 지정·해제 | 필요 | 참여자(자기만), 주최자(누구든) | FR-05 |
| 8 | PUT | `/api/trips/{code}/items/{item_id}/done` | 완료 체크·해제 | 필요 | 그 항목의 담당자 | FR-05 |
| 9 | DELETE | `/api/trips/{code}` | 여행 삭제 | 필요 | 주최자 | FR-07 |

진행률(FR-06)은 별도 API 없이 4번 응답의 `progress`에 담는다. 화면은 4번만 5초마다 부르면 목록, 담당자, 진행률을 한 번에 갱신할 수 있다.

## 엔드포인트 상세

### 1. 서버 상태 확인

`GET /api/health` → `200`

```json
{"status": "ok"}
```

### 2. 여행 만들기

`POST /api/trips` → `201`. 공유 코드를 만들고, 주최자를 members에 `is_host=true`로 넣고, 추천 목록을 items에 `source=recommended`로 넣는다.

요청

```json
{
  "region": "overseas",
  "transport": "plane",
  "duration": "short",
  "season": "summer",
  "nickname": "승연"
}
```

응답

```json
{
  "code": "K7M3QX9P",
  "token": "(원문, 이때 한 번만 내려감)",
  "me": {"member_id": 1, "nickname": "승연", "is_host": true}
}
```

화면은 토큰을 저장한 뒤 바로 4번(여행 조회)을 불러 목록을 그린다.

오류: `VALIDATION_ERROR`(값이 목록에 없음, 닉네임 길이), `RATE_LIMITED`

### 3. 코드로 참여

`POST /api/trips/{code}/members` → `201`

요청

```json
{"nickname": "준호"}
```

응답

```json
{
  "code": "K7M3QX9P",
  "token": "(원문, 이때 한 번만 내려감)",
  "me": {"member_id": 2, "nickname": "준호", "is_host": false}
}
```

`code`는 서버가 대문자로 바꾼 공유 코드다. 사용자가 `k7m3qx9p`처럼 소문자로 입력해도 화면은 이 값으로 토큰 저장 키(`packquest:K7M3QX9P`)를 만든다. 그래야 나중에 같은 여행을 다시 열 때 토큰을 찾을 수 있다.

오류: `TRIP_NOT_FOUND`(없는 코드, 삭제된 여행), `NICKNAME_TAKEN`(같은 여행에 같은 닉네임), `VALIDATION_ERROR`, `RATE_LIMITED`

### 4. 여행 전체 상태 조회 (5초 폴링)

`GET /api/trips/{code}` + `X-Pack-Token` → `200`

```json
{
  "trip": {
    "code": "K7M3QX9P",
    "region": "overseas",
    "transport": "plane",
    "duration": "short",
    "season": "summer",
    "created_at": "2026-10-21T05:03:00Z"
  },
  "me": {"member_id": 2, "nickname": "준호", "is_host": false},
  "members": [
    {"member_id": 1, "nickname": "승연", "is_host": true},
    {"member_id": 2, "nickname": "준호", "is_host": false}
  ],
  "items": [
    {
      "item_id": 10,
      "name": "여권",
      "category": "documents",
      "assignee_id": 2,
      "done": true,
      "source": "recommended"
    },
    {
      "item_id": 11,
      "name": "선크림",
      "category": "health",
      "assignee_id": null,
      "done": false,
      "source": "recommended"
    }
  ],
  "progress": {
    "total": 28,
    "done": 9,
    "unassigned": 12,
    "rate": 32,
    "by_member": [
      {"member_id": 1, "assigned": 6, "done": 4, "rate": 67},
      {"member_id": 2, "assigned": 10, "done": 5, "rate": 50}
    ],
    "by_category": [
      {"category": "documents", "total": 4, "done": 3}
    ]
  }
}
```

- 진행률은 SQL 집계로 계산하고, `rate`는 0~100 정수(반올림)다. 항목이 0개면 0이다.
- 전체 완료율의 분모는 담당자 유무와 관계없이 모든 항목이다. 참여자별 완료율의 분모는 그 사람이 맡은 항목이다.
- `by_member`에는 아무것도 맡지 않은 참여자도 넣고 `assigned: 0`, `done: 0`, `rate: 0`으로 표시한다.
- `by_category`는 FR-08(캐리어 완성도)용이다. 선택 기능이라 화면에서 안 쓰면 무시한다.
- `items`는 카테고리 순(값 목록의 category 순서), 같은 카테고리 안에서는 `item_id` 순으로 정렬한다(`ORDER BY category, id`). 5초마다 다시 그릴 때 목록 순서가 흔들리지 않게 하기 위해서다.

오류: `TOKEN_MISSING`, `TOKEN_INVALID`

### 5. 항목 추가

`POST /api/trips/{code}/items` + 토큰 → `201`. `source=custom`, 담당자 없음, 미완료로 만든다.

```json
{"name": "보조배터리", "category": "electronics"}
```

응답은 만들어진 항목 하나(4번의 `items` 원소와 같은 모양)다.

여행당 항목은 추천 항목을 포함해 200개까지다. 추가 전에 개수를 확인해, 이미 200개면 `VALIDATION_ERROR`로 거절한다. 항목 추가에는 요청 제한이 없어, 한 사람이 수천 개를 넣으면 5초 폴링 응답이 커지기 때문이다.

오류: `VALIDATION_ERROR`(이름 길이, 값이 목록에 없음, 200개 초과), `TOKEN_MISSING`, `TOKEN_INVALID`

### 6. 항목 삭제

`DELETE /api/trips/{code}/items/{item_id}` + 주최자 토큰 → `204`(본문 없음)

오류: `HOST_ONLY`, `ITEM_NOT_FOUND`, `TOKEN_MISSING`, `TOKEN_INVALID`

### 7. 담당자 지정·해제

`PUT /api/trips/{code}/items/{item_id}/assignee` + 토큰 → `200`, 바뀐 항목 하나

```json
{"assignee_id": 2}
```

- 해제는 `{"assignee_id": null}`이다.
- 담당자가 바뀌거나 해제되면 `done`은 `false`로 되돌린다.
- 참여자는 비어 있는 항목을 자기에게 지정하거나, 자기 담당을 해제만 할 수 있다(권한 규칙 참고).
- 비어 있는 항목을 맡을 때는 확인과 변경을 조건을 건 UPDATE 한 번으로 처리한다(`UPDATE items SET assignee_id = ? WHERE id = ? AND trip_code = ? AND assignee_id IS NULL`). 두 사람이 동시에 맡아 앞사람의 배정이 덮어써지는 일을 막는다.
- 바뀐 행이 0개면 그 항목을 다시 조회해, 이 여행에 없으면 `ITEM_NOT_FOUND`, 있으면 `ITEM_TAKEN`을 준다.

오류: `NOT_ALLOWED`, `ITEM_TAKEN`, `MEMBER_NOT_FOUND`, `ITEM_NOT_FOUND`, `TOKEN_MISSING`, `TOKEN_INVALID`

### 8. 완료 체크·해제

`PUT /api/trips/{code}/items/{item_id}/done` + 토큰 → `200`, 바뀐 항목 하나

```json
{"done": true}
```

오류: `NO_ASSIGNEE`(담당자 없는 항목), `NOT_YOUR_ITEM`(다른 사람 담당), `ITEM_NOT_FOUND`, `TOKEN_MISSING`, `TOKEN_INVALID`

### 9. 여행 삭제

`DELETE /api/trips/{code}` + 주최자 토큰 → `204`. 연쇄 삭제로 members와 items가 함께 지워진다. 이후 같은 코드로 참여하면 `TRIP_NOT_FOUND`, 저장해 둔 토큰으로 조회하면 `TOKEN_INVALID`가 온다(토큰도 함께 지워지기 때문). 화면은 둘 다 토큰을 지우고 입장 화면으로 보낸다.

오류: `HOST_ONLY`, `TOKEN_MISSING`, `TOKEN_INVALID`

## 권한 규칙

서버는 토큰으로 "누가" 요청했는지 알아내고, 아래 표로 허용 여부를 판단한다. 화면에서 버튼을 숨기는 것과 별개로 서버가 반드시 검사한다.

| 하는 일 | 참여자 | 주최자 | 거부할 때 오류 |
| --- | --- | --- | --- |
| 여행 조회, 항목 추가 | 가능 | 가능 | - |
| 비어 있는 항목을 자기에게 지정 | 가능 | 가능 | - |
| 자기 담당 해제 | 가능 | 가능 | - |
| 다른 사람에게 지정, 다른 사람 담당 해제 | 불가 | 가능 | `NOT_ALLOWED` |
| 다른 사람이 맡은 항목을 자기에게 지정 | 불가 | 가능 | `ITEM_TAKEN` |
| 완료 체크·해제 | 자기 담당만 | 자기 담당만 | `NOT_YOUR_ITEM`, `NO_ASSIGNEE` |
| 항목 삭제 | 불가 | 가능 | `HOST_ONLY` |
| 여행 삭제 | 불가 | 가능 | `HOST_ONLY` |

완료 체크는 주최자도 자기 담당만 할 수 있다. PRD의 "담당자가 완료로 체크한다"를 그대로 따른 것이며, 회의에서 주최자에게 열어 줄지 정해도 된다. 화면이 단순해지므로 초안대로 두는 것을 추천한다.

## 오류 코드

화면은 `code`로 분기하고, 사용자에게는 아래 "화면 안내"를 보여준다. `message`는 개발 확인용이다.

| 코드 | HTTP | 언제 | 화면 안내(예시) |
| --- | --- | --- | --- |
| `VALIDATION_ERROR` | 422 | 값이 목록에 없음, 닉네임·항목 이름 길이 초과, 여행당 항목 200개 초과 | 입력값을 확인해 주세요. |
| `TOKEN_MISSING` | 401 | `X-Pack-Token` 헤더가 없음 | 다시 입장해 주세요. |
| `TOKEN_INVALID` | 401 | 토큰이 틀림, 다른 여행의 토큰, 삭제된 여행의 토큰 | 다시 입장해 주세요. |
| `TRIP_NOT_FOUND` | 404 | 참여(3번) 때 없는 코드, 형식이 틀린 코드, 삭제된 여행. 토큰이 필요한 API는 이 코드 대신 TOKEN_INVALID를 준다 | 여행을 찾을 수 없어요. 코드를 확인해 주세요. |
| `ITEM_NOT_FOUND` | 404 | 없는 항목, 다른 여행의 항목, 숫자가 아닌 item_id | 이미 삭제된 항목이에요. |
| `MEMBER_NOT_FOUND` | 404 | 지정하려는 담당자가 이 여행에 없음 | 참여자를 다시 선택해 주세요. |
| `NOT_FOUND` | 404 | 없는 경로(API 주소 오타 등) | 일시적인 오류예요. 다시 시도해 주세요. |
| `METHOD_NOT_ALLOWED` | 405 | 경로는 있지만 메서드가 틀림 | 일시적인 오류예요. 다시 시도해 주세요. |
| `NICKNAME_TAKEN` | 409 | 같은 여행에 같은 닉네임이 있음 | 이미 쓰는 닉네임이에요. |
| `ITEM_TAKEN` | 409 | 다른 사람이 이미 맡은 항목 | 다른 사람이 먼저 맡았어요. |
| `NO_ASSIGNEE` | 409 | 담당자 없는 항목을 체크 | 먼저 담당자를 정해 주세요. |
| `HOST_ONLY` | 403 | 주최자만 할 수 있는 일 | 주최자만 할 수 있어요. |
| `NOT_ALLOWED` | 403 | 참여자가 다른 사람에게 배정·해제 | 자기 자신에게만 배정할 수 있어요. |
| `NOT_YOUR_ITEM` | 403 | 다른 사람 담당 항목을 체크 | 담당자만 체크할 수 있어요. |
| `RATE_LIMITED` | 429 | 요청 제한 초과 | 잠시 후 다시 시도해 주세요. |
| `SERVER_ERROR` | 500 | 그 외 서버 오류(DB 연결 실패, 처리하지 못한 예외 등) | 일시적인 오류예요. 다시 시도해 주세요. |

`TOKEN_MISSING`, `TOKEN_INVALID`, `TRIP_NOT_FOUND`를 받으면 화면은 저장한 토큰을 지우고 입장 화면으로 보낸다. `NOT_FOUND`와 `METHOD_NOT_ALLOWED`는 화면 코드가 잘못 부른 것이라 개발 중에 고친다. 나머지는 안내 메시지와 재시도 버튼을 보여준다.

## 요청 제한

엄격한 제한은 공유 코드를 대입해 볼 수 있는 API에만 건다. 청중이 같은 IP로 몰려도 폴링은 막히지 않게 하기 위해서다. 기준 IP는 `CloudFront-Viewer-Address` 헤더에서 포트를 뺀 값이다(로컬 개발에서는 헤더가 없으므로 연결 주소를 쓴다). 포트는 마지막 콜론 뒤만 뗀다. IPv6 주소에도 콜론이 있기 때문이다(rsplit(":", 1)). 이 헤더는 누구나 붙여 보낼 수 있으므로, 서버는 CloudFront를 거친 요청만 받도록 막혀 있어야 한다(PRD의 sg-app 허용 규칙대로, VPC 오리진이 만드는 서비스 관리형 보안 그룹 CloudFront-VPCOrigins-Service-SG만 허용한다. CloudFront 관리형 프리픽스 목록은 다른 사람의 CloudFront 배포에서 온 요청도 통과시키므로 임시로만 쓴다). 서버에 직접 접속할 수 있으면 헤더 값을 바꿔 가며 제한을 피할 수 있다.

| API | 제한(IP당) | 이유 |
| --- | --- | --- |
| 3. 코드로 참여 | 분당 60회 | 공유 코드 무차별 대입을 막는다. 청중 30명이 한 IP로 한꺼번에 들어와도 걸리지 않는 값이다. 코드 경우의 수가 약 8,500억 개라 분당 60회로는 대입이 사실상 불가능하다. |
| 2. 여행 만들기 | 분당 10회 | 여행을 대량으로 만들어 DB를 채우는 것을 막는다. |
| 4. 여행 조회(폴링) | 제한 없음(시간이 되면 분당 600회) | 30명이 5초마다 부르면 한 IP에서 분당 약 360회다. |
| 그 외 | 제한 없음 | 토큰이 있어야 호출할 수 있다. |

제한 값은 4일 차 테스트 때 팀원 휴대폰 여러 대를 같은 Wi-Fi에 연결해 확인하고 조정한다. 서버 재시작 시 초기화되는 메모리 방식으로 충분하다. 메모리 방식이므로 uvicorn은 worker 1개로 실행한다. worker가 여러 개면 제한이 worker마다 따로 계산된다.

## 값 목록

API와 DB에는 영어 코드값을 쓰고, 한글 표시는 화면이 맡는다. 추천 규칙 JSON(B)과 화면의 선택지(C)가 같은 코드값을 써야 한다.

| 필드 | 코드값 | 화면 표시 |
| --- | --- | --- |
| `region` | `domestic`, `overseas` | 국내, 해외 |
| `transport` | `plane`, `car`, `train` | 비행기, 자동차, 기차 |
| `duration` | `day`, `short`, `long` | 당일, 1~2박, 3박 이상 |
| `season` | `spring_fall`, `summer`, `winter` | 봄·가을, 여름, 겨울 |
| `category` | `documents`, `clothing`, `toiletries`, `electronics`, `health`, `etc` | 서류, 의류, 세면, 전자기기, 건강·안전, 기타 |
| `source` | `recommended`, `custom` | 추천, 직접 추가 |

| 필드 | 규칙 |
| --- | --- |
| `nickname` | 앞뒤 공백 제거 후 1~20자. 같은 여행에서 대소문자만 다른 닉네임(Junho, junho)은 같은 닉네임으로 보고 NICKNAME_TAKEN을 준다(DB 콜레이션 utf8mb4_unicode_ci 기준). |
| 항목 `name` | 앞뒤 공백 제거 후 1~50자 |
| `code` | 8자리, 대소문자 구분 없이 입력받음. 형식이 틀린 코드(7자리, 쓰지 않는 글자 등)는 422로 답하지 않는다. 3번(참여)은 TRIP_NOT_FOUND, 4~9번은 토큰 검사에서 TOKEN_INVALID로 답한다. 사용자에게는 "코드를 확인해 주세요"가 맞는 안내이기 때문이다. |
| `item_id` | 경로의 item_id가 숫자가 아니면(/items/abc) 422 대신 ITEM_NOT_FOUND로 답한다. 그런 번호의 항목은 어차피 없기 때문이다. 형식이 틀린 공유 코드와 같은 원칙이다. |
| 항목 개수 | 여행당 최대 200개(추천 항목 포함). 넘으면 VALIDATION_ERROR. |

## 알려진 한계

토큰을 잃으면 되찾을 수 없다. MVP에서는 받아들인다.

- 브라우저 저장소가 지워지거나 다른 휴대폰을 쓰면 같은 닉네임으로 다시 들어갈 수 없다(`NICKNAME_TAKEN`).
- 주최자가 토큰을 잃으면 여행 삭제 권한도 잃는다.
- 그래서 발표자는 데모 내내 같은 브라우저를 쓴다.

## schema.sql

확정 사항 1번(`is_host`)과 3번(`ON DELETE SET NULL`)을 반영했다. 각자 PC의 MariaDB에서 한 번 실행해 오류가 없는지 확인한 뒤 GitHub `db/` 폴더에 올린다.

```sql
CREATE DATABASE IF NOT EXISTS packquest
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE packquest;

CREATE TABLE trips (
  code       CHAR(8)  NOT NULL,
  region     ENUM('domestic','overseas')         NOT NULL,
  transport  ENUM('plane','car','train')         NOT NULL,
  duration   ENUM('day','short','long')          NOT NULL,
  season     ENUM('spring_fall','summer','winter') NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (code)
) ENGINE=InnoDB;

CREATE TABLE members (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  trip_code  CHAR(8)      NOT NULL,
  nickname   VARCHAR(20)  NOT NULL,
  token_hash CHAR(64)     NOT NULL,
  is_host    BOOLEAN      NOT NULL DEFAULT FALSE,
  joined_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_members_token (token_hash),
  UNIQUE KEY uq_members_nickname (trip_code, nickname),
  CONSTRAINT fk_members_trip FOREIGN KEY (trip_code)
    REFERENCES trips (code) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE items (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  trip_code   CHAR(8)      NOT NULL,
  name        VARCHAR(50)  NOT NULL,
  category    ENUM('documents','clothing','toiletries','electronics','health','etc') NOT NULL,
  assignee_id INT UNSIGNED NULL,
  done        BOOLEAN      NOT NULL DEFAULT FALSE,
  source      ENUM('recommended','custom') NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_items_trip (trip_code),
  CONSTRAINT fk_items_trip FOREIGN KEY (trip_code)
    REFERENCES trips (code) ON DELETE CASCADE,
  CONSTRAINT fk_items_assignee FOREIGN KEY (assignee_id)
    REFERENCES members (id) ON DELETE SET NULL
) ENGINE=InnoDB;
```

- `uq_members_nickname`가 같은 여행의 닉네임 중복을 DB에서도 막는다. 중복으로 INSERT가 실패하면 서버는 `NICKNAME_TAKEN`을 돌려준다.
- 서버(2일 차)에서는 A가 이 파일을 SSM 세션에 붙여 넣어 실행한다. 앱 전용 계정은 이 DB의 SELECT, INSERT, UPDATE, DELETE만 받는다.
