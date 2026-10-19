from collections.abc import Iterator

import pymysql
from pymysql.cursors import DictCursor

from app import config


def connect() -> pymysql.Connection:
    conn = pymysql.connect(
        host=config.DB_HOST,
        port=config.DB_PORT,
        user=config.DB_USER,
        password=config.DB_PASSWORD,
        database=config.DB_NAME,
        charset="utf8mb4",
        cursorclass=DictCursor,
        autocommit=False,
    )
    with conn.cursor() as cur:
        # 명세 "DB 시간대": 연결할 때마다 UTC로 맞춘다.
        cur.execute("SET time_zone = '+00:00'")
        # MariaDB 11.8 기본값(REPEATABLE READ + 스냅숏 격리)에서는 동시에 같은 항목을 맡을 때
        # 1020 "Record has changed since last read" 오류가 난다. 조건을 건 UPDATE가
        # 최신 값으로 판단하도록 READ COMMITTED로 둔다.
        cur.execute("SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED")
    return conn


def get_db() -> Iterator[pymysql.Connection]:
    """요청 하나에 연결 하나. 라우터에서 Depends(get_db)로 받는다."""
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
