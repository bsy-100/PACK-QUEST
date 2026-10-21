# PACK QUEST — B(백엔드) 체크리스트

- 기간: 2026-10-19(월) ~ 10-23(금)
- 기준: PACK QUEST PRD(최종본), PACK QUEST API 명세(2026-10-19 확정). 사본은 `docs/PRD.md`, `docs/API_SPEC.md`
- 표기: `[x]` 완료, `[ ]` 할 일. "먼저 필요한 것"은 내 작업을 시작하기 전에 A·C가 끝내 둬야 하는 일이다. 막히면 바로 해당 담당자에게 알린다.

## 한눈에 보기

1일 차에 API 명세 확정, schema.sql, **API 9개 구현·테스트**, 3일 차 배포 준비까지 끝냈다(원래 2일 차 일정까지 포함). 모두 `main`에 합쳐져 있다(PR #1).

2일 차에 **Backend 서버 배포와 DB 연결까지** 끝냈다(원래 3일 차 일정). 서버 안에서 테스트 43개 통과. 남은 일은 CloudFront 연결 후 확인과 화면 연동이다.

| 결과물 | 위치 |
|---|---|
| API 9개 (FastAPI) | `backend/app/` |
| DB 스키마 | `db/schema.sql` |
| 공용 준비물 추천 규칙 | `backend/app/data/recommend_rules.json` |
| 전체 API 테스트(43개 항목) | `backend/tests/smoke_test.py` |
| 서버 배포 순서 | `backend/deploy/DEPLOY.md` |
| 화면용 실제 응답 예시 17개 | `docs/api-examples/` |
| 실행 방법 | `backend/README.md` |
| 2일 차 정리(쉬운 말) | [PACK QUEST 2일 차 정리](https://claude.ai/code/artifact/add41fad-80f6-4246-abaa-cf701ab1b8f4) |

---

## 1일 차 — 10/19(월): 명세 확정과 API 구현

**목표:** API 명세 확정, schema.sql, 로컬 DB로 동작하는 API

### 먼저 필요한 것 (A·C)

- [x] C: API 명세 검토 의견(참여 응답 `code`, 토큰 우선 검사, 동시 맡기, 오류 형식, UTC 시각 등)
- [x] 팀: 공용/개인 준비물 분리 결정(2번안) — 서버는 공용만, 개인은 화면의 "내 짐"

### 내 할 일

- [x] API 명세 리뷰·수정 후 확정, 회의 안건 4가지 확정(`is_host`, 요청 제한 범위, `ON DELETE SET NULL`, 삭제는 주최자만)
- [x] PRD를 확정 내용에 맞춰 수정(토큰 1개 + `is_host`, 공용/개인 준비물 구분)
- [x] `db/schema.sql` 작성, 로컬 MariaDB에서 실행 확인
- [x] FastAPI 뼈대: DB 연결(연결마다 UTC), 공통 오류 형식 `{"detail": {"code", "message"}}`
- [x] API 9개 구현: 여행 만들기·참여·조회·삭제, 항목 추가·삭제, 담당자 지정·해제, 완료 체크
- [x] 토큰 검사 순서(4~9번은 토큰 먼저), 요청 제한(만들기 10회/분, 참여 60회/분), 여행당 항목 200개
- [x] 추천 규칙 JSON: 공용 준비물만(데모 두 여행 22개 / 12개)
- [x] 테스트: 43개 항목 통과, 30명이 같은 항목을 동시에 맡아도 1명만 성공
- [x] 테스트 중 찾은 버그 수정
    - MariaDB 동시 수정 오류(1020) → 세션 격리 수준 READ COMMITTED
    - 저장 전에 응답이 나가던 문제 → 커밋 후 응답
- [x] 데모용 서버 로그(한국 시각, 5초 폴링 숨김, 토큰 미기록)
- [x] 배포 준비: systemd 서비스, Parameter Store에서 DB 비밀번호 읽기, `DEPLOY.md`
- [x] C용 실제 응답 예시(`docs/api-examples/`), PRD·명세 사본(`docs/`)
- [x] C의 `feature/frontend`를 로컬에서 붙여 보기 → `tools/dev-server.mjs` 경유 테스트 43개 통과, mock 항목도 추천 JSON과 일치
- [x] PR #1 `main` 머지

### 완료 기준

- [x] 로컬에서 API 9개와 오류 코드가 명세대로 동작한다
- [x] 작업 내용이 GitHub `main`에 올라가 있다

---

## 2일 차 — 10/20(화): 서버 접속 확인 → Backend 배포까지

**목표:** Backend 서버에 SSM으로 접속되고, DB 연결 준비가 끝난다 → 배포와 DB 연결까지 앞당겨 끝냄. C는 결석, A·B 둘이 작업

### 먼저 필요한 것 (A)

- [x] VPC·서브넷·NAT·보안 그룹, EC2용 IAM 역할 2개 — A가 1일 차에 완료(`docs/aws-setup.md`). Backend 역할에 Parameter Store `/packquest/db-password` 읽기가 있어 B 코드는 그대로 쓴다
- [x] AWS 계정 공유 방식 정하기 — 계정 하나를 같이 쓰고, AWS 작업은 A 노트북에서 순서를 정해 함(10/20)
- [x] 예산 알람을 만들 수 있는지 확인 — 권한이 없어 만들지 못함(10/20). NAT Gateway가 계속 과금되므로 발표 후 리소스 삭제를 꼭 한다
- [x] Backend 서버(EC2, packquest-private-app, 공인 IP 없음, packquest-sg-app, packquest-ec2-backend-role) — `packquest-backend`(`i-033c073cd3d240ab7`), Ubuntu 24.04, 프라이빗 IP `10.0.1.154`
- [x] DB 서버 MariaDB: `bind-address`를 프라이빗 IP로, `schema.sql` 실행 — DB 서버 프라이빗 IP `10.0.2.237`, MariaDB 10.11
- [x] 앱 계정 `packquest_app`@`<Backend 프라이빗 IP>`, packquest DB에 SELECT·INSERT·UPDATE·DELETE만. **비밀번호는 영문·숫자로**(한글이면 서버가 접속하지 못한다)
- [x] Parameter Store SecureString `/packquest/db-password`

### 내 할 일

- [x] Backend 서버에 SSM으로 접속해 보기 (PRD 구축 절차 10단계) — A 노트북 콘솔 Session Manager로 접속 완료(10/20)
- [x] `feature/frontend`가 `main`에 합쳐지면 다시 받아서 로컬 연동 확인 — 합치기 전 PR #3 최신 커밋으로 테스트 43개 통과, PR #3 머지·`main` 받기 완료(10/20)
- [x] `DEPLOY.md` 코드 받기를 https로 변경 — 공개 저장소라 Deploy key가 필요 없고, 저장소 주인(C) 없이 배포할 수 있다
- [x] (3일 차 일 앞당김) Backend 배포, DB 연결, 서버 테스트 43개 통과, 재부팅 후 자동 시작 확인 — 아래 3일 차 참고

### 정한 것

- **AWS 작업은 A 노트북 한 대로 한다.** 계정(IAM 사용자) 하나를 셋이 같이 쓴다. B의 서버 작업도 A 노트북에서 하므로 매일 아침 사용 순서를 정한다
- **S3 버킷은 A가 공용 계정에 만든다**(`packquest-web-1b07b2`, 10/20 완료). C는 화면 파일 업로드와 캐시 무효화만 한다
- **배포는 저장소의 `DEPLOY.md` 기준.** A의 PLAN-B.md와 경로가 다르다. 실제 서버는 `~/PACK-QUEST/backend`, 설정은 `/etc/packquest/api.env`
- **서버 코드는 A가 Deploy key로 받았다.** 그대로 써도 되고, 발표 후 GitHub에서 키를 삭제한다

### 서버 정보

| 항목 | Backend | DB |
|---|---|---|
| 이름 | `packquest-backend` (`i-033c073cd3d240ab7`) | `packquest-db` (`i-06c3000b9c697fd63`) |
| 프라이빗 IP | `10.0.1.154` | `10.0.2.237` |
| 내용 | Ubuntu 24.04, systemd `packquest-api`, `0.0.0.0:8000` | MariaDB 10.11, DB `packquest`, 테이블 3개 |
| 접속 | 콘솔 Session Manager → `sudo su - ubuntu` | API는 `packquest_app`@`10.0.1.154`(권한 4개) |

### 오늘 본 오류

| 오류 | 뜻 |
|---|---|
| `Can't connect ... '127.0.0.1'` | `api.env`에 `DB_HOST`가 없어 기본값(자기 자신)으로 접속했다. 명령의 `<DB 사설 IP>` 자리를 실제 IP로 바꿔야 한다 |
| `1130 Host ... is not allowed` | DB에 그 서버에서 들어올 수 있는 계정이 아직 없었다 |
| `1045 Access denied for user 'root'` | 정상. root 원격 접속은 막혀 있어야 한다 |
| 재시작 직후 `Connection refused` | 서비스가 아직 뜨는 중이었다. 몇 초 뒤 다시 하면 된다 |

---

## 3일 차 — 10/21(수): 배포와 연동

**목표:** CloudFront 도메인에서 화면과 API가 함께 동작한다

### 먼저 필요한 것 (A·C)

- [x] A: S3 버킷 `packquest-web-1b07b2`(10/20)
- [x] A: CloudFront VPC 오리진, `sg-app`에 CloudFront에서 오는 8000번 허용, `/api/*` 동작(원본 요청 정책 `Managed-AllViewerAndCloudFrontHeaders-2022-06`, 사용자 지정 오류 응답 없음) — 10/20 앞당겨 완료, `https://d1ra4yni7dggze.cloudfront.net`
- [x] C: 화면 S3 업로드 — 디자인 개편 + 로그인 화면 최종본(PR #7) 업로드 완료(10/21)

### 내 할 일

- [x] `DEPLOY.md` 순서대로 배포: 패키지 → 코드(https, 공개 저장소) → 설정 파일 → 연결 확인 → systemd — 10/20에 앞당겨 완료(코드는 A가 Deploy key로 받음), 재부팅 후 자동 시작 확인
- [x] 서버 안에서 `python3 tests/smoke_test.py http://127.0.0.1:8000/api` 통과 — 43/43(10/20)
- [x] CloudFront 연결 후 `python3 tests/smoke_test.py https://d1ra4yni7dggze.cloudfront.net/api` 통과 — 43/43(10/20, B PC에서)
- [x] C와 화면·API 연동 확인: 여행 만들기 → 참여 → 맡기 → 체크 → 진행률 → 삭제 — PC·휴대폰으로 비로그인 흐름, 로그인 후 다른 기기에서 열기(주최자 권한 유지, 처음 기기에 안내)까지 확인(10/21)
- [x] `X-Pack-Token`, `CloudFront-Viewer-Address`가 들어오는지 확인(요청 제한 IP 구분) — 토큰 API 테스트 통과, 가짜 `CloudFront-Viewer-Address`를 보내도 CloudFront가 실제 IP로 바꿔 넣어 B PC IP로 제한됨(10/21)
- [ ] 배포한 사람·시간·커밋을 팀 채팅에 기록
- [x] (추가) 로그인(선택) API — 팀 제안에 맞춰 구현, PR #6 merge, 명세 원본에 "로그인 API" 절, C용 `docs/API_AUTH.md`(10/21)
- [x] (추가) 로그인 서버 반영: DB 서버 마이그레이션 `db/migrations/001_auth.sql` → Backend `git pull`·재시작 → CloudFront 경유 기존 테스트 43/43, 로그인 테스트 32/33(마지막 요청 제한 항목은 실제 IP로 세어져 실패하는 것이 정상)
- [x] C: 로그인·회원가입, "내 여행" 목록 화면 — PR #7 merge(10/21)

### 오늘 본 오류

| 오류 | 뜻 |
|---|---|
| 재시작 후 DB를 쓰는 API 전부 500, 로그에 `2003 Can't connect ... '<DB 사설 IP>'` | 서버 설정의 `DB_HOST`에 예시 문구가 들어가 있었다. 실행 중인 서비스는 예전 값을 쓰다가 로그인 배포로 재시작하면서 드러남. A가 찾아 수정 |
| 마이그레이션 전에 새 코드를 띄우면 500 | 순서는 DB 마이그레이션 먼저 → Backend 배포(`DEPLOY.md` 8절) |

---

## 4일 차 — 10/22(목): 전체 테스트

- [ ] 셋이 함께 전체 기능 테스트, API 오류 수정
- [ ] 휴대폰 여러 대를 같은 Wi-Fi에 연결해 요청 제한 값 확인·조정
- [ ] 네트워크·권한 점검 교차 확인(저장소에 비밀번호·키·`.env` 없음)

## 5일 차 — 10/23(금): 리허설

- [ ] 최종 배포 확인, 시연 리허설
- [ ] 데모 중 서버 로그 보여주기: `journalctl -u packquest-api -f -o cat`
- [ ] 발표 후: GitHub Deploy key 삭제, AWS 리소스 삭제 확인(예산 알람이 없어 NAT 비용이 계속 나간다)

---

## 팀원이 알아 두면 좋은 것

- **로컬에서 화면과 같이 띄우기:** 백엔드 `cd backend && .venv/bin/uvicorn app.main:app --reload`(8000번) → 저장소 맨 위에서 `node tools/dev-server.mjs` → http://localhost:5500
- **추천 항목을 바꾸려면** `backend/app/data/recommend_rules.json`만 고치면 된다. 잘못 고치면(없는 분류, 50자 넘는 이름) 서버가 시작할 때 알려 준다.
- **서버는 uvicorn worker 1개**로 실행한다. 요청 제한을 메모리에 저장하기 때문이다.
- **API 오류는 항상 JSON**(`detail.code`)으로 온다. HTML이 오면 CloudFront 설정 문제다.
- **문서 원본은 claude.ai에 있다.** `docs/PRD.md`, `docs/API_SPEC.md`는 사본이라, 원본을 고치면 B가 다시 올린다.
