# PACK QUEST 백엔드

FastAPI + MariaDB. API 규칙은 PACK QUEST API 명세를 따른다.

## 처음 한 번

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env   # DB_PASSWORD 채우기
```

비밀번호는 영문·숫자·기호만 쓴다. PyMySQL은 한글 비밀번호로 접속하지 못한다.

로컬 MariaDB에 `db/schema.sql`을 실행하고, 앱 전용 계정을 만든다(명세: SELECT, INSERT, UPDATE, DELETE만).

```bash
sudo mariadb < ../db/schema.sql
sudo mariadb -e "CREATE USER IF NOT EXISTS 'packquest_app'@'localhost' IDENTIFIED BY '비밀번호';
GRANT SELECT, INSERT, UPDATE, DELETE ON packquest.* TO 'packquest_app'@'localhost';"
```

## 실행

```bash
.venv/bin/uvicorn app.main:app --reload
```

http://127.0.0.1:8000/api/health → `{"status": "ok"}`

서버에서는 요청 제한이 메모리 방식이라 worker 1개로 실행한다(`--workers` 옵션을 쓰지 않는다).

## 서버 배포

[deploy/DEPLOY.md](deploy/DEPLOY.md). 서버에서는 비밀번호를 `.env`가 아니라 Parameter Store(`DB_PASSWORD_PARAM`)에서 읽는다.

## 확인

서버를 띄운 상태에서 실행한다. 9개 API와 오류 코드를 차례로 요청해 보고, 만든 테스트 여행은 지운다.

```bash
python3 tests/smoke_test.py                                  # 로컬
python3 tests/smoke_test.py https://<CloudFront 도메인>/api   # 배포 후
```

여행 만들기 제한(분당 10회) 때문에 1분 안에 여러 번 돌리면 429가 난다.

## 구조

| 파일 | 하는 일 |
|---|---|
| `app/main.py` | 앱 생성, 오류 처리기와 라우터 등록 |
| `app/config.py` | `.env`에서 DB 설정 읽기 |
| `app/db.py` | DB 연결(연결마다 `time_zone = '+00:00'`), `Depends(get_db)` |
| `app/errors.py` | 모든 오류를 `{"detail": {"code", "message"}}` 형식으로 |
| `app/auth.py` | 토큰 검사(4~9번 공통), 주최자 확인 |
| `app/security.py` | 공유 코드·토큰 생성, 사용자 IP, 요청 제한 |
| `app/schemas.py` | 요청·응답 형식과 입력 검증 |
| `app/items.py` | 항목 조회와 응답 모양 |
| `app/recommend.py`, `app/data/recommend_rules.json` | 추천 목록(규칙은 JSON만 고치면 된다) |
| `app/routers/` | `trips.py`(1~4, 9번), `items.py`(5~8번) |
| `tests/smoke_test.py` | 전체 API 확인 |
