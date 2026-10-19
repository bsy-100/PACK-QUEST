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

## 구조

| 파일 | 하는 일 |
|---|---|
| `app/main.py` | 앱 생성, 오류 처리기와 라우터 등록 |
| `app/config.py` | `.env`에서 DB 설정 읽기 |
| `app/db.py` | DB 연결(연결마다 `time_zone = '+00:00'`), `Depends(get_db)` |
| `app/errors.py` | 모든 오류를 `{"detail": {"code", "message"}}` 형식으로 |
| `app/routers/` | API별 라우터 |
