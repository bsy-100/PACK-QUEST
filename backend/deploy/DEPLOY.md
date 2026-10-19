# Backend 서버 배포 (B)

PRD 구축 절차 13단계와 "배포와 운영 방식"을 그대로 따른다. 처음 한 번은 1~8, 이후 업데이트는 9만 하면 된다.

## 0. 시작 전에 A에게 확인할 것

| 항목 | 확인 |
|---|---|
| Backend 서버 | 앱 서브넷, 공인 IP 없음, sg-app, Backend용 IAM 역할 |
| DB 서버 프라이빗 IP | `/etc/packquest/api.env`의 `DB_HOST`에 넣는다 |
| MariaDB | `bind-address`가 DB 서버 프라이빗 IP, `schema.sql` 실행 완료 |
| 앱 계정 | `packquest_app`@`<Backend 서버 프라이빗 IP>`, packquest DB에 SELECT·INSERT·UPDATE·DELETE |
| Parameter Store | SecureString `/packquest/db-password`, Backend 역할만 읽기 가능 |
| GitHub | 저장소 관리자(Deploy key 등록 권한)가 누구인지 |

DB 비밀번호는 영문·숫자·기호로만 만든다(PyMySQL은 한글 비밀번호로 접속하지 못한다).

## 1. 서버 접속

AWS 콘솔 → EC2 → Backend 서버 → 연결 → Session Manager. 접속하면 `ssm-user`이므로 `ubuntu`로 바꾼다.

```bash
sudo su - ubuntu
```

## 2. 패키지 설치

```bash
sudo apt update
sudo apt install -y git python3-venv mariadb-client
```

## 3. GitHub Deploy key (읽기 전용)

```bash
ssh-keygen -t ed25519 -C packquest-backend -f ~/.ssh/packquest_deploy -N ""
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/packquest_deploy
  IdentitiesOnly yes
EOF
cat ~/.ssh/packquest_deploy.pub
```

출력된 한 줄을 GitHub 저장소 → Settings → Deploy keys → Add deploy key에 붙인다. **Allow write access는 체크하지 않는다.** 저장소 관리자만 할 수 있다.

```bash
ssh -T git@github.com    # "You've successfully authenticated" 나오면 성공
```

## 4. 코드 받기, 가상환경

```bash
git clone git@github.com:bsy-100/PACK-QUEST.git ~/PACK-QUEST
cd ~/PACK-QUEST/backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## 5. 서비스 설정 파일 (비밀번호 없음)

```bash
sudo mkdir -p /etc/packquest
sudo cp deploy/api.env.example /etc/packquest/api.env
sudo nano /etc/packquest/api.env          # DB_HOST를 DB 서버 프라이빗 IP로
sudo chown root:ubuntu /etc/packquest/api.env
sudo chmod 640 /etc/packquest/api.env
```

## 6. 서비스 등록 전에 연결 확인

Parameter Store 읽기와 DB 접속을 한 번에 본다.

```bash
cd ~/PACK-QUEST/backend
set -a; . /etc/packquest/api.env; set +a
.venv/bin/python -c "
from app.db import connect
cur = connect().cursor()
cur.execute('SELECT CURRENT_USER() u, @@session.time_zone tz')
print(cur.fetchone())
cur.execute('SHOW TABLES'); print(cur.fetchall())"
```

`packquest_app@<Backend IP>`, `+00:00`, 테이블 3개가 나오면 성공. 실패하면 아래 "문제 해결"을 본다.

## 7. systemd 등록 (처음 한 번)

```bash
sudo cp deploy/packquest-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now packquest-api
systemctl status packquest-api --no-pager
```

## 8. 확인

```bash
curl -s http://127.0.0.1:8000/api/health                               # {"status":"ok"}
curl -s http://$(hostname -I | awk '{print $1}'):8000/api/health       # 프라이빗 IP로도 응답해야 CloudFront가 붙는다
python3 tests/smoke_test.py http://127.0.0.1:8000/api                  # 43/43 passed
journalctl -u packquest-api -n 50 --no-pager
```

스모크 테스트는 테스트 여행을 만들고 끝나면 지운다. CloudFront가 붙은 뒤에는 `https://<CloudFront 도메인>/api`로 한 번 더 돌린다.

## 9. 업데이트 배포 (코드가 바뀔 때마다)

```bash
sudo su - ubuntu
cd ~/PACK-QUEST && git pull
cd backend && .venv/bin/pip install -r requirements.txt    # requirements.txt가 바뀌었을 때만
sudo systemctl restart packquest-api
systemctl status packquest-api --no-pager
git log --oneline -1                                        # 커밋 번호
```

배포한 사람, 시간, 커밋 번호를 팀 채팅에 남긴다.

## 로그 보기 (데모 중에도)

```bash
journalctl -u packquest-api -f -o cat
```

`-o cat`은 journalctl 머리말을 빼고 앱이 쓴 줄만 보여준다(시각은 한국 시각). 5초 폴링(GET 200)은 나오지 않는다.

```
14:03:05  * 여행 생성 K7M3QX9P | 해외·비행기·1~2박·여름 | 주최자 승연 | 추천 50개
14:03:05  POST    /api/trips                               201     31ms  203.0.113.7
14:03:12  * 참여 K7M3QX9P | 준호 | 지금 2명
14:03:20  PUT     /api/trips/K7M3QX9P/items/12/assignee    409     10ms  198.51.100.21   ITEM_TAKEN
14:03:31  * 체크 K7M3QX9P | 준호: 여권 | 진행 1/50
```

## 문제 해결

| 증상 | 확인할 곳 |
|---|---|
| `(2003, "Can't connect to MySQL server")` | MariaDB `bind-address`가 프라이빗 IP인지, sg-db가 sg-app에서 3306을 허용하는지, `DB_HOST` 값 |
| `(1045, "Access denied")` | 앱 계정의 접속 호스트가 Backend 프라이빗 IP인지, Parameter Store 값과 DB 비밀번호가 같은지 |
| `AccessDeniedException` (ssm) | Backend 역할에 `/packquest/db-password` 읽기 권한(KMS 복호화 포함)이 있는지 |
| `ParameterNotFound` | 파라미터 이름, 리전(`AWS_REGION`) |
| 서비스가 계속 재시작 | `journalctl -u packquest-api -n 100` |
| CloudFront에서 502 | uvicorn이 `0.0.0.0:8000`에서 듣는지(8단계 두 번째 curl), sg-app 허용 규칙 |
| API 오류가 HTML로 옴 | CloudFront 사용자 지정 오류 응답이 비어 있는지 |
| 서버에서 토큰 오류만 남 | `/api/*` 원본 요청 정책이 `Managed-AllViewerAndCloudFrontHeaders-2022-06`인지(`X-Pack-Token` 전달) |

## 배포 전후 체크리스트

- [ ] 저장소에 비밀번호, 키, `.env` 파일이 없다
- [ ] 서버에서 최신 커밋을 받았고 커밋 번호를 적었다
- [ ] `packquest-api`가 active이고 오류 로그가 없다
- [ ] CloudFront 도메인에서 핵심 흐름(생성 → 참여 → 체크 → 진행률 → 삭제)을 해 봤다
- [ ] 배포한 사람, 시간, 커밋을 팀 채팅에 남겼다
