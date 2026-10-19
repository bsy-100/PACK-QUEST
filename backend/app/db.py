from collections.abc import Iterator

import pymysql
from pymysql.cursors import DictCursor

from app import config


def connect() -> pymysql.Connection:
    # 명세 "DB 시간대": 연결할 때마다 UTC로 맞춘다.
    return pymysql.connect(
        host=config.DB_HOST,
        port=config.DB_PORT,
        user=config.DB_USER,
        password=config.DB_PASSWORD,
        database=config.DB_NAME,
        charset="utf8mb4",
        cursorclass=DictCursor,
        autocommit=False,
        init_command="SET time_zone = '+00:00'",
    )


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
