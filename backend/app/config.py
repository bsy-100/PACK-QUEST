import os

from dotenv import load_dotenv

load_dotenv()

DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT = int(os.getenv("DB_PORT", "3306"))
DB_USER = os.getenv("DB_USER", "packquest_app")
DB_NAME = os.getenv("DB_NAME", "packquest")

# 서버(PRD): 비밀번호는 Parameter Store에서 읽는다. DB_PASSWORD_PARAM=/packquest/db-password
# 로컬: .env의 DB_PASSWORD를 쓴다.
DB_PASSWORD_PARAM = os.getenv("DB_PASSWORD_PARAM")


def _read_parameter(name: str) -> str:
    import boto3  # 서버에서만 필요하므로 여기서 불러온다.

    ssm = boto3.client("ssm", region_name=os.getenv("AWS_REGION", "ap-northeast-2"))
    return ssm.get_parameter(Name=name, WithDecryption=True)["Parameter"]["Value"]


DB_PASSWORD = _read_parameter(DB_PASSWORD_PARAM) if DB_PASSWORD_PARAM else os.getenv("DB_PASSWORD", "")
