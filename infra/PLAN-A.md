# PLAN.md — PACK QUEST · A 역할(인프라·MariaDB)

> 기준 문서: PACK QUEST PRD v4.6(파일명 `PRD-v4.5.md` 유지) · 기간 10/19(월)~10/23(금) · 금요일 라이브 데모
> 내 역할: **A — AWS 인프라(VPC·서브넷·보안 그룹·NAT·EC2·S3·CloudFront) + MariaDB 설치·관리**
> 담당 단계: 1(로그인·권한 확인), 2~9, 10(DB 서버), 11, 12, 14(버킷), 15, 16·17(공동), 18, 19
>
> **팀 운영 전제**: 세 명이 **컴퓨터 한 대에서 제공받은 IAM 사용자 하나로** AWS 작업을 함께 한다(CLI 작업은 에이전트가 같은 사용자의 `aws login` 임시 자격 증명으로 수행). 그래서 팀원별 SSO 로그인이나 역할별 권한을 따로 만들지 않는다. 루트 계정은 쓰지 않는다.
> **예산 알람**: 계정 권한이 없어 만들지 않는다. 대신 매일 작업 끝에 비용과 실행 중인 리소스를 확인한다.
> B와 C의 일은 PRD 그대로다.
> - B: Backend 서버 준비와 배포(단계 13)
> - C: S3 화면 업로드와 캐시 무효화

---

## 0. 원칙과 우선순위

- 리소스는 **에이전트(Claude)가 AWS CLI로 하나씩** 만들고, 생성·변경·삭제 명령은 실행 전에 내가 확인한다(10/19 결정, 자격 증명은 `aws login` 임시 자격 증명만). 결과는 콘솔에서도 확인한다. IaC·CI/CD 없음. 리전 `ap-northeast-2`(서울), 가용 영역 하나로 통일.
- 리소스 이름은 **`packquest-` 접두사**. 만든 직후 [리소스 기록표](#6-리소스-기록표)에 이름·설정값을 적는다(비밀번호는 절대 적지 않음).
- 액세스 키는 만들지 않는다. 비밀번호는 채팅·문서·GitHub에 남기지 않는다.
- 같은 계정이라 누구나 모든 리소스를 바꿀 수 있다. **내가 만든 네트워크·보안 그룹·IAM 역할·CloudFront 설정은 바꾸기 전에 팀 채팅에 먼저 알리기**로 합의한다.
- **요청이 몰리면 처리 순서**: ① Backend 서버(B에게 전달) → ② S3 버킷(C에게 전달) → ③ 나머지.
- 인계는 **하루 끝에만**. 다음 날 B·C가 나를 기다리지 않도록 그날 산출물을 끝까지 만든다.
- 콘솔 컴퓨터가 한 대이므로 **콘솔 작업 순서를 매일 아침 정한다**. 로그인 정보는 그 컴퓨터 밖(채팅·문서)으로 옮기지 않는다.
- **매일 작업 끝 비용 확인**: 콘솔 청구 화면, 실행 중인 EC2·NAT Gateway·Elastic IP. 예산 알람이 없으므로 이 확인이 유일한 비용 보호 수단이다.

### 하루 끝 인계 목표 (내가 넘겨야 하는 것)

| 날짜 | A가 준비해 둘 것 | 받는 사람이 다음 날 하는 일 |
|---|---|---|
| 1일 차(월) | 네트워크·보안 그룹·IAM 역할 | 나: 서버·DB 생성 / B·C: 로컬 개발 |
| 2일 차(화) | Backend 서버(오전), S3 버킷(오전), **DB 접속 확인** | B: 실제 코드 배포 / C: 로컬 API 연동 / 나: CloudFront |
| 3일 차(수) | **CloudFront 도메인** (화면 + `/api/*` 동작) | 셋이 점검·전체 테스트 분담 |
| 4일 차(목) | 콘솔 점검 결과, **백업 + 복원 확인**, 시연 영상(공동) | 5일 차는 확인·리허설만 |

---

## 1일 차 — 10/19(월) · 기본 인프라 (단계 1~7)

### 단계 1 — 로그인·권한 확인 (가장 먼저)
- [x] 제공받은 IAM 사용자로 로그인(루트 아님) — 10/19 확인
- [ ] 장기 액세스 키 없음 — **10/19 확인 결과: 내 IAM 사용자에 액세스 키가 등록되어 있음.** 처리 방법 결정 대기(아래 참고)
- [ ] MFA — 10/19 확인 결과: **비활성화**. 등록 가능 여부 결정 대기
- [x] **권한 미리 확인**: `AdministratorAccess` 정책이 붙어 있음 — 10/19 확인. 단계 2~15에 필요한 권한은 이 정책에 포함됨(정책 시뮬레이터 확인은 생략)
- [ ] 비용 확인 화면(청구서 또는 Cost Explorer) 열림 — 10/20 CLI로 Cost Explorer 조회는 됨(10월 누적 약 $187, 대부분 10/17 이전 비용). **콘솔 화면 열림은 미확인**

> 액세스 키 처리: 키를 만든 사람(강사·관리자)과 용도를 먼저 확인한다. 쓰지 않는 키라면 **비활성화**(되돌릴 수 있음)부터 하고, 삭제는 제공자와 합의한 뒤에만 한다. 콘솔에서 키의 "마지막 사용" 시각을 보면 지금 쓰이는지 알 수 있다.

### 단계 2~7 — 네트워크·보안 그룹·IAM 역할

| 단계 | 작업 | 핵심 설정 | 확인 |
|---|---|---|---|
| 2 | VPC + IGW | `packquest-vpc` 10.0.0.0/16, "VPC만" 옵션, IPv6 없음, **DNS 확인·DNS 호스트 이름 모두 활성화**<br>`packquest-igw` 연결 (IGW는 VPC 오리진 사용 조건) | IGW `Attached`, VPC DNS 설정 2개 활성화<br>✅ **10/19 완료**(CLI 생성 후 조회 확인) |
| 3 | 서브넷 3개 (같은 AZ, 예: ap-northeast-2a) | `packquest-public` 10.0.0.0/24 (NAT 전용)<br>`packquest-private-app` 10.0.1.0/24<br>`packquest-private-db` 10.0.2.0/24<br>프라이빗 2개는 **공인 IP 자동 할당 끔** | 서브넷 3개 표시<br>✅ **10/19 완료**(ap-northeast-2a, 3개 모두 공인 IP 자동 할당 끔 확인) |
| 4 | 라우팅 테이블 2개 | `packquest-rt-public`: 0.0.0.0/0 → IGW, 퍼블릭 서브넷 연결<br>`packquest-rt-private`: 앱·DB 서브넷 연결 | 서브넷별 연결 정확<br>✅ **10/19 완료**(경로·연결 조회 확인, NAT 경로는 단계 5) |
| 5 | NAT Gateway | 퍼블릭 서브넷, Elastic IP 할당 → `rt-private`에 0.0.0.0/0 → NAT 추가 | NAT `Available` (**이때부터 상시 과금**)<br>✅ **10/19 완료**(NAT available, rt-private 0.0.0.0/0 → NAT active 확인) |
| 6 | 보안 그룹 | `sg-app` 먼저(인바운드 **없음**으로 시작) → `sg-db` (인바운드 TCP 3306, 소스 = `sg-app`만) | sg-db 소스가 sg-app 하나뿐, 22번 없음<br>✅ **10/19 완료**(sg-app 인바운드 없음, sg-db 3306 ← sg-app만, 아웃바운드 기본 전체 허용 확인) |
| 7 | EC2 IAM 역할 2개 | `packquest-ec2-db-role`: `AmazonSSMManagedInstanceCore`<br>`packquest-ec2-backend-role`: 위 + Parameter Store 읽기(아래) | 두 역할·권한 확인<br>✅ **10/19 완료**(정책·인스턴스 프로파일 조회 확인) |

Backend 역할에 붙일 인라인 정책(파라미터 **하나만**):
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["ssm:GetParameter"],
    "Resource": "arn:aws:ssm:ap-northeast-2:<ACCOUNT_ID>:parameter/packquest/db-password"
  }]
}
```
> 기본 `aws/ssm` KMS 키로 SecureString을 만들면 보통 `kms:Decrypt`를 따로 주지 않아도 된다. 2일 차에 B가 실제로 읽어 보고, 실패하면 추가한다.

### 1일 차 병행 작업
- [ ] **기존 실습 기록 확인**: 이전 실습에서 CloudFront → API 연결을 어떻게 했는지 찾아 팀에 공유. 같은 구조를 쓸 수 있으면 그 방식을 먼저 쓰고, 아니면 VPC 오리진 방식으로 2~3일 차에 검증.
- [ ] B·C와 API 명세 회의(공통 규칙: `/api` 경로, `X-Pack-Token`, JSON 오류 형식, `/api/health`)
- [x] B가 만든 `schema.sql` 검토(외래 키 `ON DELETE CASCADE`, utf8mb4) — 10/20 확인(trips·members CASCADE, assignee SET NULL, utf8mb4_unicode_ci)
- [x] 리소스 기록표 1일 차 칸 채우기

### 1일 차 끝 체크
- [x] VPC/IGW/서브넷 3/RT 2/NAT/SG 2/IAM 역할 2 완료 · 기록표 반영 — 10/19 확인
- [x] 비용·실행 중 리소스 확인(NAT Gateway 과금 시작) — 10/19에는 못 함, 10/20 확인(EC2 2대·NAT·EIP 1개만 실행 중, 다른 리전 EC2 없음, 서울 ELB 없음)

---

## 2일 차 — 10/20(화) · 서버, DB, S3 (단계 8~12, 14)

**처리 순서가 중요하다**: `9(Backend 서버) → B에게 전달 → 14(버킷) → C에게 전달 → 8 → 10 → 11 → 12`

### 단계 9 — Backend 서버 (오전 가장 먼저)
- [x] EC2 `packquest-backend`: Ubuntu LTS, `packquest-private-app`, **공인 IP 없음**, `sg-app`, `packquest-ec2-backend-role`, **키 페어 없음**, EBS **암호화** — 10/20 CLI 생성 후 조회 확인(t3.small, Ubuntu 24.04, IMDSv2 필수)
- [x] 상태 검사 2/2 통과 → **B에게 인스턴스 이름·프라이빗 IP 전달** (B가 SSM 접속 후 단계 13 진행) — 10/20 상태 검사 2/2 ok, SSM 관리형 노드 Online 확인. B에게 전달 완료(10/20, 사용자 확인)
- [x] B가 SSM으로 접속되지 않으면 NAT 경로 → 역할 → SSM 에이전트 순서로 같이 점검 — 10/20 B SSM 접속 완료(사용자 확인), 점검 불필요

### 단계 14 — S3 버킷 (오전)
- [x] `packquest-web-<고유값>` 생성, **퍼블릭 액세스 모두 차단**, 정적 웹 호스팅 **사용 안 함** — 10/20 `packquest-web-1b07b2` CLI 생성 후 조회 확인(ap-northeast-2, 퍼블릭 차단 4개 True, 웹 호스팅 없음, BucketOwnerEnforced, SSE-S3, 버킷 정책 없음)
- [x] C에게 버킷 이름 전달 (C가 2일 차 안에 뼈대 `index.html` 업로드) — 10/20 전달, C 업로드 조회 확인(루트에 index.html·css/·js/ 7개, CHECKLIST.md 없음, 퍼블릭 차단 유지, 크기가 main `frontend/`와 일치). `frontend/CHECKLIST.md`의 "C가 버킷 생성"(38~40·97·179행)은 PRD v4.3 이전 기준이므로 C에게 수정 요청

### 단계 8 · 10 — DB 서버
- [x] EC2 `packquest-db`: Ubuntu LTS, `packquest-private-db`, 공인 IP 없음, `sg-db`, `packquest-ec2-db-role`, 키 페어 없음, EBS 암호화 — 10/20 CLI 생성 후 조회 확인(`i-06c3000b9c697fd63`, t3.small, Ubuntu 24.04, 프라이빗 IP 10.0.2.237, IMDSv2 필수, 상태 검사 2/2, SSM Online)
- [x] Session Manager로 접속 확인 — 10/20 사용자 확인

### 단계 11 — MariaDB 설치·설정 (DB 서버 SSM 세션)
- [x] 10/20 완료(사용자 확인): MariaDB 10.11.14 active·enabled, bind-address `10.0.2.237` → `10.0.2.237:3306` LISTEN, 보안 초기화(root localhost만·익명 없음), DB `packquest` + 테이블 3개, `packquest_app@10.0.1.154` S/I/U/D만
- 진행 중 겪은 일(재발 방지):
  - 처음 11-A~F를 **작업용 컴퓨터(WSL)** 에서 실행함 → Backend에서 `Connection refused`. 실제 DB 서버에서 다시 함. **블록마다 `hostname -I`가 `10.0.2.237`인지 먼저 확인**한다. (WSL에 설치된 MariaDB 서버는 10/20 삭제 확인: 패키지·데이터·설정·3306 포트 없음)
  - SSM 세션 기본 셸은 `sh`라서 `read -s`가 없다 → `stty -echo; read PW; stty echo` 사용
  - 비밀번호를 명령 자리에 잘못 넣어 채팅에 노출됨 → Parameter Store 값 교체(현재 **버전 3**), WSL 명령 기록 정리. 노출된 값은 어떤 DB 계정에도 남아 있지 않다
```bash
sudo apt update && sudo apt -y upgrade
sudo apt install -y mariadb-server
sudo systemctl enable --now mariadb

# 보안 초기화: root 원격 로그인 금지, 익명 사용자·test DB 삭제
sudo mariadb-secure-installation

# bind-address를 DB 서버 프라이빗 IP로 (기본 127.0.0.1이면 Backend 접속 거부)
DB_IP=$(hostname -I | awk '{print $1}')
sudo sed -i "s/^bind-address\s*=.*/bind-address = ${DB_IP}/" /etc/mysql/mariadb.conf.d/50-server.cnf
grep bind-address /etc/mysql/mariadb.conf.d/50-server.cnf
sudo systemctl restart mariadb
sudo ss -ltnp | grep 3306        # <프라이빗 IP>:3306 이어야 함
```

DB·앱 계정 생성:

> ⚠️ **순서 변경(10/20)**: 단계 12를 먼저 해서 비밀번호가 **이미 Parameter Store `/packquest/db-password`(현재 **버전 3**, 영문·숫자 32자)에 있다.** 여기서 새 비밀번호를 만들지 않는다.
> - 콘솔 → Systems Manager → Parameter Store → `/packquest/db-password` → **값 표시**로 복사해 `<RANDOM_PASSWORD>` 자리에 붙여 넣는다. 앞뒤 공백이 섞이지 않게 한다.
> - 실행 후 바로 `clear`, 콘솔의 값 표시를 닫는다. 채팅·문서·메모에 붙여 넣지 않는다.
> - 파라미터 값을 바꾸면 `ALTER USER`로 DB 비밀번호도 바꾸고 B 서비스를 재시작해야 한다. 단계 11 전에는 파라미터를 건드리지 않는다.
> - 일치 여부는 "2일 차 끝 DB 접속 확인"에서 앱 계정 접속 성공으로 검증한다.
```sql
-- sudo mariadb
CREATE DATABASE packquest CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'packquest_app'@'<BACKEND_PRIVATE_IP>' IDENTIFIED BY '<RANDOM_PASSWORD>';
GRANT SELECT, INSERT, UPDATE, DELETE ON packquest.* TO 'packquest_app'@'<BACKEND_PRIVATE_IP>';
FLUSH PRIVILEGES;

-- 점검
SELECT user, host FROM mysql.user;   -- root는 localhost만, 익명 없음
SHOW GRANTS FOR 'packquest_app'@'<BACKEND_PRIVATE_IP>';
```
- [x] `schema.sql`은 GitHub에서 복사해 **SSM 세션에 붙여 넣어** 실행(`sudo mariadb packquest`). DB 서버에는 GitHub 자격 증명을 두지 않는다.
- [x] `SHOW TABLES;` → `trips`, `members`, `items` 3개, 외래 키 CASCADE 확인 — 10/20 확인(`fk_members_trip`·`fk_items_trip` CASCADE, `fk_items_assignee` SET NULL)

> 주의: 앱 계정은 Backend **프라이빗 IP에 묶여 있다**. Backend 인스턴스를 다시 만들면 IP가 바뀌므로 계정의 host도 바꿔야 한다.

### 단계 12 — Parameter Store
- [x] `/packquest/db-password`, 유형 **SecureString**, 값 = 위 무작위 비밀번호 — 10/20 **단계 11보다 먼저** CLI 생성(값은 출력하지 않음). 조회 확인: SecureString, `alias/aws/ssm`, Standard, 버전 1, ARN이 Backend 역할 정책 Resource와 일치
  - 먼저 한 이유: B의 `backend/app/config.py`가 시작할 때 이 파라미터를 읽어서, 없으면 서비스가 뜨지 않는다
- [x] Backend 서버에서 읽기 권한 확인 — 10/20 boto3로 파라미터를 읽어 앱 계정으로 DB 접속까지 성공(`DB-OK`, 값 출력 없음)
- [x] B에게 전달(10/20): DB 호스트(DB 프라이빗 IP `10.0.2.237`), 계정명 `packquest_app`, DB명 `packquest`, 파라미터 이름 `/packquest/db-password` (**비밀번호 자체는 전달하지 않음**)

### 2일 차 끝: DB 접속 확인 (인계물)
Backend 서버 SSM 세션에서 (B와 함께):
```bash
sudo apt install -y mariadb-client
mariadb -h <DB_PRIVATE_IP> -u packquest_app -p packquest -e "SHOW TABLES;"   # 성공해야 함
mariadb -h <DB_PRIVATE_IP> -u root -p                                       # 실패해야 함
```
- [x] 앱 계정 접속 성공 / root 원격 접속 실패 — 10/20 확인: Backend에서 pymysql `DB-OK`, Backend에서 `mariadb -h 10.0.2.237 -u root` → `ERROR 1045 Access denied for user 'root'@'ip-10-0-1-154...'`
- [x] B의 `/api/health` 뼈대가 `curl http://<BACKEND_IP>:8000/api/health`로 응답 (B 담당, 나는 확인만) — 10/20 B 배포 완료, 서비스 active·`0.0.0.0:8000`·health 200·DB 연동 정상(사용자 확인)
- [x] C의 뼈대 화면이 버킷에 보임 (C 담당, 나는 확인만) — 10/20 조회 확인
- [x] 기록표 2일 차 칸 채우기 — 10/20(Backend·DB EC2, MariaDB, Parameter, S3)

---

## 3일 차 — 10/21(수) · CloudFront와 통합 (단계 15~16)

### 단계 15 — CloudFront 설정 순서
1. [x] **사전 확인**: Backend 서버 실행 중, uvicorn `0.0.0.0:8000`에서 응답 (`curl http://<BACKEND_IP>:8000/api/health`) — 10/20 확인(서비스 active·`0.0.0.0:8000`·health 200은 사용자 확인, IGW attached·앱 서브넷 여유 IP 250·기존 배포 없음은 조회 확인)
2. [x] (건너뜀 — 10/20, 서버 안 확인으로 대신하고 임시 규칙을 열지 않음) (필요 시) 연결 테스트용으로 `sg-app`에 인바운드 TCP 8000, 소스 = 관리형 접두사 목록 `com.amazonaws.global.cloudfront.origin-facing` **임시** 추가
3. [x] CloudFront 콘솔 → **VPC 오리진** 생성 `packquest-vpc-origin`: 원본 ARN = Backend EC2, HTTP, 포트 8000 → 상태 **Deployed** 대기(최대 15분, 그동안 설정값 기록) — 10/20 CLI 생성 `vo_C1Fa5wzoZhSE0kgfSYx1Fx`(http-only, 8000), 15:09 **Deployed** 확인, 서비스 관리형 SG `CloudFront-VPCOrigins-Service-SG`(sg-01f21584ac34ee388) 자동 생성 확인
4. [x] 배포 `packquest-cf` 생성, 원본 2개 — 10/20 CLI 생성 `E1JDVTXZDF4P90`, 도메인 `d1ra4yni7dggze.cloudfront.net`, OAC `packquest-oac`(E10COFUJ81ZT0M), 설정 조회 확인
   - S3 원본: **OAC** 사용 → **기본 동작(`*`)**, 기본 루트 객체 `index.html`
   - VPC 오리진: 원본 도메인 = 인스턴스의 **프라이빗 IP DNS 이름**(`ip-10-0-1-xx.ap-northeast-2.compute.internal`), HTTP/8000
5. [x] 콘솔이 보여주는 **OAC 버킷 정책을 복사해 S3 버킷 정책에 붙여 넣기** (안 하면 화면 403) — 10/20 CLI 적용(같은 형식, GetObject만, SourceArn=E1JDVTXZDF4P90). 조회 확인: IsPublic False, 퍼블릭 차단 4개 유지, S3 직접 URL 403, CloudFront `/` 200
6. [x] 동작 `/api/*` → VPC 오리진 (10/20 조회 확인: CachingDisabled 4135ea2d…, AllViewerAndCloudFrontHeaders-2022-06 33f36d7e…, 메서드 7개)
   - 캐시 정책: `Managed-CachingDisabled`
   - 원본 요청 정책: `Managed-AllViewerAndCloudFrontHeaders-2022-06`
   - 허용 메서드: GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE 전부
7. [x] **사용자 지정 오류 응답(Error pages)은 설정하지 않는다** (10/20 조회 확인: 0개) (API JSON 오류가 index.html로 바뀜)
8. [x] `sg-app` 허용 규칙 교체: 인바운드 TCP 8000, 소스 = **`CloudFront-VPCOrigins-Service-SG`** (서비스 관리형 SG) → 접두사 목록 임시 규칙 **삭제**. 서비스 관리형 SG는 수정하지 않고, 같은 이름 패턴으로 SG를 직접 만들지 않는다. — 10/20 CLI 추가 `sgr-06aca535c28be0e66`(TCP 8000 ← sg-01f21584ac34ee388). 임시 접두사 목록 규칙은 만들지 않았으므로 삭제할 것 없음. 조회 확인: sg-app 인바운드는 이 규칙 1개뿐
9. [x] C에게 배포 ID·도메인 전달 (화면 변경 후 C가 캐시 무효화) — 10/20 전달. C가 새 디자인(feature/frontend `584309b`) 7개 파일을 콘솔로 덮어쓰기 업로드(15:35, 크기 일치 확인) → 무효화 `/*` Completed(15:37) → CloudFront가 새 index.html(17,922B) 제공 확인. **S3는 main이 아닌 feature/frontend 버전**이므로 PR 병합으로 맞춰야 함

### 확인
- [x] `https://<dxxxx>.cloudfront.net/` → 화면 열림 (403 아님) — 10/20 200, `<title>PACK QUEST</title>`, http→https 301
- [x] `https://<dxxxx>.cloudfront.net/api/health` → JSON 응답 — 10/20 `{"status":"ok"}` 200 application/json
- [x] 없는 코드로 참여 → HTML이 아닌 **JSON 오류** — 10/20 `POST /api/trips/ZZZZZZZZ/members` → 404 `TRIP_NOT_FOUND` application/json
- [x] B와 함께 서버 로그에서 `X-Pack-Token`, `CloudFront-Viewer-Address`가 도착하는지 확인 (IPv6 형식도 이때 확인) — `X-Pack-Token` 도착은 10/20 간접 확인(헤더 없으면 TOKEN_MISSING, 잘못된 값이면 TOKEN_INVALID로 응답이 달라짐). `CloudFront-Viewer-Address`는 10/20 16:08 확인: CloudFront 경유 `POST /api/trips/LOGTEST2/members` 로그에 PC 공인 IPv4가 **포트 없이** 찍힘(B의 `client_ip()` 포트 제거 정상, 토큰은 로그에 없음). IPv6도 10/20 16:19 확인: 휴대폰 LTE 요청이 `2001:2d8:...` 전체 8묶음, **포트 없이** 찍힘. 참고: 로그 조회는 `sudo journalctl -u packquest-api --since "-30min"`(서버 시계 UTC, ubuntu는 journal 그룹 아님)
- [x] S3 객체 URL로 직접 접근 → 차단(AccessDenied) — 10/20 403

### FR-09 회원가입·로그인 — A 담당 (10/21 추가, PRD v4.6)
> 결정(10/21): 아이디+비밀번호+닉네임, 로그인은 선택(비로그인 합류 유지), 여행별 `X-Pack-Token`은 그대로 두고 계정을 참여자에 연결만, 로그인 토큰은 `X-Auth-Token` 헤더.
> **되돌리기 기준**: 10/22 정오까지 안 끝나면 로그인 없는 버전(main)으로 발표. DB에 추가한 테이블·NULL 컬럼은 기존 기능에 영향이 없으므로 지우지 않고 단계 19에서 함께 삭제한다.

**AWS 리소스 변경 없음(예정)** — 아래 두 가지는 바꾸지 않는다.
- CloudFront: `/api/*` 원본 요청 정책 `Managed-AllViewerAndCloudFrontHeaders-2022-06`이 모든 사용자 헤더를 넘기므로 `X-Auth-Token`도 그대로 전달된다. 관리형 정책이라 헤더를 추가할 수도 없고, 고정값이라 바꾸지 않는다. **확인만** 한다(L4).
- Parameter Store·IAM: 로그인 토큰은 무작위 값 + 해시 저장(기존 토큰과 같은 방식)이라 서명 키가 필요 없다. B가 JWT 같은 서명 방식으로 바꾸면 그때 `/packquest/auth-secret`(SecureString) 생성 + `packquest-read-db-password` 정책 Resource 추가 + 단계 19 삭제 목록 추가를 다시 계획한다.

**L1. 스키마 변경 전 백업 (DB 서버 SSM 세션, 사람이 실행)**
```bash
hostname -I        # 10.0.2.237 인지 먼저 확인 (WSL에서 실행하지 않기)
sudo mysqldump --single-transaction --routines --triggers packquest \
  > ~/packquest_before-fr09_$(date +%F_%H%M).sql
ls -lh ~/packquest_before-fr09_*.sql
sudo mariadb -e "SELECT COUNT(*) FROM packquest.trips; SELECT COUNT(*) FROM packquest.members; SELECT COUNT(*) FROM packquest.items;"
```
- [x] 덤프 파일 이름·크기, 테이블별 행 수 기록 — 10/21 확인(사용자 실행): DB 서버 `/home/ssm-user/packquest_before-fr09_2026-10-21_0111.sql` 6.6K, 마지막 줄 `-- Dump completed`. 행 수 trips 1 · members 1 · items 22
  - 실수로 두 번 실행해 `_0109`도 생겼음(둘 다 정상 완료) → 늦은 `_0111`만 남기고 `_0109` 삭제, `ls`로 1개 확인

**L2. 변경 SQL 검토 (B와 함께)**
- 앱 계정은 S/I/U/D만 있어 `CREATE`·`ALTER`를 못 한다 → A가 root(`sudo mariadb`)로 적용한다. 권한은 `packquest.*`에 걸려 있어 새 테이블에도 자동 적용되므로 GRANT는 바꾸지 않는다.
- 검토 기준: **추가만** 한다(DROP·데이터 변경 없음), `members.user_id`는 NULL 허용, 비밀번호·토큰 컬럼은 해시만.
- 아래는 B 확정 전 초안이다. **B가 `db/schema.sql`과 함께 확정한 SQL로 적용한다.**
```sql
-- sudo mariadb packquest
CREATE TABLE users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username      VARCHAR(20)  NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  nickname      VARCHAR(20)  NOT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB;

-- 실제 적용된 것은 sessions(+expires_at). 아래는 초안 그대로 둔다
CREATE TABLE auth_sessions (
  token_hash CHAR(64)     NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (token_hash),
  KEY idx_auth_sessions_user (user_id),
  CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

ALTER TABLE members
  ADD COLUMN user_id INT UNSIGNED NULL AFTER nickname,
  ADD UNIQUE KEY uq_members_user (trip_code, user_id),
  ADD CONSTRAINT fk_members_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE SET NULL;
```
- `uq_members_user`: 한 계정이 같은 여행에 두 번 들어가지 않게 한다. user_id가 NULL인 비로그인 참여자는 여러 명이어도 된다.
- [x] B 확정 SQL 받음, 위 기준으로 검토 — 10/21 **실행 후 검토**: B가 검토 전에 DB 서버에서 `curl … main/db/migrations/001_auth.sql | sudo mariadb`로 적용함. 파일(커밋 3ee0515 이후 변경 없음)을 읽어 확인: 추가만 있음(`CREATE TABLE IF NOT EXISTS` users·sessions, `ALTER TABLE members ADD … IF NOT EXISTS`), DROP·데이터 변경 없음, `members.user_id` NULL 허용 + FK `ON DELETE SET NULL`, `uq_members_user(trip_code, user_id)`, 비밀번호·토큰은 해시 컬럼만
  - 초안과 다른 점: 세션 테이블 이름 `sessions`(초안 `auth_sessions`), `expires_at` 컬럼 추가(로그인 세션 만료), `user_id` 위치 `AFTER is_host`
  - 앞으로: 검토 전 실행 금지, DB 서버에서는 GitHub에서 받아 바로 파이프하지 말고 검토한 SQL을 SSM 세션에 붙여 넣는다(PRD 보안 표의 schema.sql 방식)

**L3. 적용과 확인 (DB 서버 SSM 세션, B 배포 전에)**
```bash
hostname -I                                   # 10.0.2.237
sudo mariadb packquest                        # B 확정 SQL 붙여 넣기
sudo mariadb packquest -e "SHOW TABLES; SHOW CREATE TABLE members\G"
sudo mariadb -e "SELECT COUNT(*) FROM packquest.members;"   # L1과 같은 수
```
- [x] 테이블 5개(trips·members·items·users·sessions), `members.user_id` NULL 허용, FK 확인 — 일부 확인(10/21 B 실행 결과): 테이블 5개, 앱 계정 권한 그대로(`packquest`.* S/I/U/D). 10/21 `SHOW CREATE TABLE members` 확인(사용자 실행): `user_id int unsigned DEFAULT NULL`, `uq_members_user(trip_code,user_id)`, `fk_members_user … ON DELETE SET NULL`, 기존 `fk_members_trip` CASCADE 유지. 행 수 trips 1 · members 1 · items 22로 L1과 같음
- [x] 기존 코드 그대로 동작 — 10/21 CloudFront `/api/health` 200 JSON `{"status":"ok"}`. `/api/auth/me`는 404 JSON(`NOT_FOUND`)이라 B의 새 코드는 아직 배포 전. 기존 여행 조회는 L4에서 함께 확인

**L4. B 배포 후 CloudFront로 확인 (B와 함께)**
- 10/21 1차 시도(에이전트, CloudFront 경유 21개 요청): **DB를 쓰는 모든 API가 500 `SERVER_ERROR`**(로그인 API와 비로그인 여행 만들기·합류·조회 모두). `/api/health`(DB 안 씀) 200, 로그인 실패 반복 시 26번째에 429 JSON(앞선 5회 포함 30/분, 정상). 새 코드는 배포됨(`/api/auth/signup`이 404가 아니라 500)
  - 조회로 확인한 AWS 쪽: 두 EC2 running·상태 검사 ok, IP 그대로(10.0.1.154 / 10.0.2.237), `/packquest/db-password` 버전 3 그대로(10/20 이후 변경 없음), sg-db 3306 ← sg-app 그대로
  - 원인(10/21 사용자 확인): Backend `journalctl`에 `(2003, "Can't connect ... ([Errno -2] Name or service not known)")`. DB 서버 MariaDB는 active, `10.0.2.237:3306` LISTEN으로 정상. `/etc/packquest/api.env`의 `DB_HOST`가 예시 자리표시 글자(`<DB 사설 IP>`) 그대로였음(재배포 때 예시로 덮어쓴 것으로 추정)
  - 조치: `sed`로 `DB_HOST=10.0.2.237` 수정(`cat -A`로 확인) → `systemctl restart packquest-api` → active. B에게 전달: 재배포 때 `api.env.example` 복사는 처음 한 번만
- 10/21 2차 시도(에이전트, CloudFront 경유): **21개 모두 통과**. 테스트 아이디 `pqtest_f6e3a5`(세션은 로그아웃으로, 테스트 여행 2개는 API로 삭제. 계정은 삭제 API가 없어 10/21 DB 서버에서 root로 `DELETE FROM users WHERE username='pqtest_f6e3a5'` 실행 — 사용자 삭제 완료 확인)
- [x] 가입 201 → 같은 아이디 409 → 로그인 200 → `GET /api/me`가 `X-Auth-Token`으로 200(헤더가 서버까지 옴, 실제 경로는 `/api/me`), 토큰 없음 401 `AUTH_MISSING`, 틀린 토큰 401 `AUTH_INVALID`, 로그아웃 204 후 같은 토큰 401 — 10/21
- [x] 잘못된 비밀번호와 없는 아이디의 응답 코드·메시지가 같음(둘 다 401 `LOGIN_FAILED`) — 10/21
- [x] 로그인 실패 반복 시 429 `RATE_LIMITED` JSON(분당 30회, 앞선 auth 요청 5회 포함 26번째) — 10/21
- [x] 서버 로그에 비밀번호·토큰 원문 없음 — 10/21 사용자가 `journalctl … | grep -i -E "password|token"` 실행: 걸린 줄은 경로 이름(`/api/me/trips/<code>/token`)뿐이고 값 없음. B의 `app/logs.py`도 요청 줄에 메서드·경로(쿼리 제외)·상태·시간·IP·오류 코드만, 사건 줄에 아이디·닉네임만 남김(헤더·본문 기록 없음)
- [x] 기존 흐름 그대로 동작: 비로그인 생성 201·합류 201·조회 200·주최자 삭제 204. 로그인 상태 생성 → 내 여행 목록에 주최자로 표시 → 다시 들어가기로 새 토큰 200, 예전 `X-Pack-Token` 401 — 10/21 (항목 체크는 이번에 안 함)

**L5. 기록**
- [ ] 리소스 기록표 MariaDB 행 갱신, 보안 슬라이드 재료(비밀번호 해시, 토큰 해시 저장, 요청 제한, 비밀값 위치 = DB 비밀번호만 Parameter Store) 정리

### 단계 16 — 전체 흐름 (A·B·C)
- [ ] CloudFront 도메인에서 여행 생성 → 참여 → 체크 → 진행률 → 삭제 끝까지
- [ ] 3일 차 저녁: 진행 상황 보고 FR-08(선택) 진행 여부 결정
- [ ] 기록표 3일 차 칸 채우기

### 막히면 — VPC 오리진 체크리스트
리전 지원(서울 OK) → IGW 연결 → Backend 실행 중 → uvicorn `0.0.0.0` → sg-app 허용 규칙 → 원본 도메인(프라이빗 IP DNS) → 프라이빗 서브넷 여유 IPv4.
기존 실습 방식이 확인되면 그 방식을 먼저 시도. 둘 다 막히면 **팀 합의 후에만** 퍼블릭 서브넷 대안(공인 IP 노출, 마지막 수단).

---

## 4일 차 — 10/22(목) · 점검, 백업, 시연 준비 (단계 17~18)

### 단계 17 — 내 담당: 콘솔 점검
(B는 서버 안, C는 브라우저 점검을 동시에 진행)
- [ ] 두 서버 **공인 IP 없음**, 프라이빗 서브넷에 있음
- [ ] 어떤 SG에도 **22번 포트 없음**, 두 서버 키 페어 없음
- [ ] `sg-app` 인바운드 = CloudFront 서비스 관리형 SG(8000)만, 접두사 목록 규칙 없음
- [ ] `sg-db` 인바운드 = 3306 / 소스 sg-app만
- [ ] IAM 역할: DB = SSM만, Backend = SSM + 파라미터 1개 읽기만
- [ ] **장기 액세스 키 없음** (IAM → 자격 증명 보고서 확인)
- [ ] S3 퍼블릭 액세스 차단 ON, 버킷 정책은 OAC 허용 정책만
- [ ] CloudFront: `/api/*` 정책 이름 일치, Error pages 비어 있음
- [ ] 청구 화면에서 현재 비용 확인
- [ ] B 서버 점검·C 브라우저 점검 결과 취합

### 백업과 복원 확인 (발표 전날 필수)
```bash
# DB 서버 SSM 세션
sudo mysqldump --single-transaction --routines --triggers packquest \
  > ~/packquest_$(date +%F_%H%M).sql
ls -lh ~/packquest_*.sql

# 복원 테스트: 별도 DB에 복원해 행 수 비교 후 삭제
sudo mariadb -e "CREATE DATABASE packquest_restore_test;"
sudo mariadb packquest_restore_test < ~/packquest_<날짜>.sql
sudo mariadb -e "SELECT COUNT(*) FROM packquest.items; SELECT COUNT(*) FROM packquest_restore_test.items;"
sudo mariadb -e "DROP DATABASE packquest_restore_test;"
```
- [ ] EC2 콘솔 → DB 서버 볼륨 → **EBS 스냅샷** `packquest-db-snap-1022`
- [ ] 복원 절차를 기록표/팀 문서에 남김

### 기타
- [ ] OS 패치 상태 확인(`sudo apt list --upgradable`), MariaDB 서비스 `active`, 재부팅 후 자동 시작
- [ ] 배포 절차 1회 직접 해 보기 (B의 git pull + 재시작 또는 C의 S3 업로드 + 무효화 중 하나, 담당자와 함께)
- [ ] 시연 영상 녹화 참여 · 오류 수정 지원
- [ ] 단계 18: 내가 만든 리소스의 이름·설정값을 팀 문서에 최종 정리(다른 팀원이 문서만 보고 설명 가능해야 함)

---

## 5일 차 — 10/23(금) · 최종 확인, 리허설, 발표, 정리 (단계 19)

### 발표 전
- [ ] 아침 점검: 두 서버 상태 검사, MariaDB·FastAPI 서비스 active, CloudFront 도메인 핵심 흐름 1회
- [ ] 데모용 여행은 발표 전용으로 새로 생성
- [ ] 리허설 참여 · 발표장 네트워크 점검
- [ ] 발표 중 콘솔 화면 노출 시 **계정 ID·비용 정보 가리기**
- [ ] 내 발표 파트(필요 시): 3티어 아키텍처 · 네트워크 경로(CloudFront → VPC 오리진 → sg-app → sg-db, 나가는 길은 NAT) · 보안 설계(22번 없음, 최소 권한 역할, Parameter Store)

### 단계 19 — 발표 후 삭제 (B·C가 체크리스트 읽어 주며 확인)
먼저 **보관할 백업이 있는지 결정**(덤프 파일 로컬 보관 여부, 스냅샷 유지 여부).

1. [ ] CloudFront 배포 **비활성화 → 삭제**
2. [ ] VPC 오리진 삭제
3. [ ] EC2 두 대 종료 (EBS 스냅샷 필요 없으면 삭제)
4. [ ] NAT Gateway 삭제
5. [ ] Elastic IP 릴리스
6. [ ] S3 버킷 비운 뒤 삭제
7. [ ] 보안 그룹 → 서브넷 → 라우팅 테이블 → IGW 분리·삭제 → VPC 삭제
8. [ ] Parameter Store `/packquest/db-password` 삭제
9. [ ] IAM 역할 2개(+ 인스턴스 프로파일) 삭제
- [ ] 확인: 청구 화면에 상시 과금 항목(EC2, NAT, EIP)이 남지 않음

---

## 5. 자주 터지는 곳 — 빠른 진단

| 증상 | 먼저 볼 곳 |
|---|---|
| Backend → DB 접속 거부 | MariaDB `bind-address`(프라이빗 IP인지), 앱 계정 host, sg-db 소스 |
| CloudFront `/api/*` 502/504 | uvicorn `--host 0.0.0.0`, sg-app 허용 규칙, VPC 오리진 Deployed, 원본 포트 8000 |
| 화면 403 | S3 버킷 정책에 OAC 허용 정책 누락, 기본 루트 객체 |
| API 오류가 HTML로 옴 | CloudFront 사용자 지정 오류 응답 설정됨 → 제거 |
| 토큰이 서버에 안 옴 | `X-Pack-Token`·`X-Auth-Token` 헤더 이름, 원본 요청 정책 `AllViewerAndCloudFrontHeaders-2022-06` |
| SSM 접속 안 됨 | NAT 경로(rt-private) → EC2 역할 → SSM 에이전트 상태 |
| apt/pip 설치 안 됨 | NAT Gateway Available, rt-private 0.0.0.0/0 → NAT |
| 요청 제한이 안 먹음 | `CloudFront-Viewer-Address`에서 포트를 뺐는지(B와 확인) |

---

## 6. 리소스 기록표

> 만든 직후 채운다. **비밀번호·키는 적지 않는다.** 이 표가 단계 18 산출물의 바탕이 된다.

| 리소스 | 이름 | 주요 설정값 | ID / 비고 |
|---|---|---|---|
| VPC | packquest-vpc | 10.0.0.0/16, DNS 확인·호스트 이름 켜짐 | vpc-06f0bee59d9e4efd8 (10/19) |
| IGW | packquest-igw | packquest-vpc에 연결됨 | igw-08a68288588827a70 (10/19) |
| 퍼블릭 서브넷 | packquest-public | 10.0.0.0/24, AZ ap-northeast-2a | subnet-0ef6230f714c1f655 (10/19) |
| 앱 서브넷 | packquest-private-app | 10.0.1.0/24, AZ ap-northeast-2a, 공인 IP 자동 할당 끔 | subnet-0b555891641fb181a (10/19) |
| DB 서브넷 | packquest-private-db | 10.0.2.0/24, AZ ap-northeast-2a, 공인 IP 자동 할당 끔 | subnet-0e03b56096c343653 (10/19) |
| RT 퍼블릭 | packquest-rt-public | 0.0.0.0/0 → IGW, packquest-public 연결 | rtb-0dad1979bc0ad83c6 (10/19) |
| RT 프라이빗 | packquest-rt-private | 0.0.0.0/0 → NAT, 앱·DB 서브넷 연결 | rtb-0b6b2dc39c3d1b903 (10/19) |
| NAT Gateway | packquest-nat | packquest-public, EIP 52.79.204.224 (packquest-nat-eip, eipalloc-0700d56639835f43c), 프라이빗 IP 10.0.0.25 | nat-08d3c865dca521a96 (10/19, 과금 시작) |
| sg-app | packquest-sg-app | 8000 ← CloudFront-VPCOrigins-Service-SG(sg-01f21584ac34ee388), 규칙 sgr-06aca535c28be0e66 (10/20 추가) | sg-09c3d767d5d3fae47 (10/19) |
| sg-db | packquest-sg-db | 3306 ← sg-app | sg-0969c421fc57972b3 (10/19) |
| IAM 역할(DB) | packquest-ec2-db-role | SSMManagedInstanceCore, 인스턴스 프로파일 동명 | arn:aws:iam::<ACCOUNT_ID>:role/packquest-ec2-db-role (10/19) |
| IAM 역할(Backend) | packquest-ec2-backend-role | SSMManagedInstanceCore + 인라인 `packquest-read-db-password`(GetParameter 1개), 인스턴스 프로파일 동명 | arn:aws:iam::<ACCOUNT_ID>:role/packquest-ec2-backend-role (10/19) |
| Backend EC2 | packquest-backend | Ubuntu 24.04 LTS (ami-0e1eeb87102d64f40), t3.small, packquest-private-app, 프라이빗 IP 10.0.1.154 (ip-10-0-1-154.ap-northeast-2.compute.internal), 공인 IP·키 페어 없음, sg-app, packquest-ec2-backend-role, IMDSv2 필수, EBS 8GB gp3 암호화(vol-038bb10ecc7402eba) | i-033c073cd3d240ab7 (10/20) |
| DB EC2 | packquest-db | Ubuntu 24.04 LTS (ami-0e1eeb87102d64f40), t3.small, packquest-private-db, 프라이빗 IP 10.0.2.237 (ip-10-0-2-237.ap-northeast-2.compute.internal), 공인 IP·키 페어 없음, sg-db, packquest-ec2-db-role, IMDSv2 필수, EBS 8GB gp3 암호화(vol-03ade82015a4b056f) | i-06c3000b9c697fd63 (10/20) |
| MariaDB | DB `packquest` | 10.11.14, bind-address 10.0.2.237, utf8mb4_unicode_ci, 테이블 trips·members·items(CASCADE / assignee SET NULL) + 10/21 FR-09 users·sessions, members.user_id(NULL, SET NULL) — `db/migrations/001_auth.sql`, 앱 계정 `packquest_app@10.0.1.154`, root localhost만 | 권한 S/I/U/D (10/20) |
| Parameter | /packquest/db-password | SecureString, aws/ssm 키, Standard, 영문·숫자 32자. **단계 11의 CREATE USER에 이 값을 써야 함** | 버전 3 (10/20, 단계 11보다 먼저 생성, 노출 후 교체) |
| S3 버킷 | packquest-web-1b07b2 | ap-northeast-2, 퍼블릭 액세스 차단 4개 모두 켬, 정적 웹 호스팅 없음, 객체 소유권 BucketOwnerEnforced(ACL 비활성), 기본 암호화 SSE-S3, 버킷 정책 = OAC 허용 1개(cloudfront.amazonaws.com, GetObject, SourceArn=packquest-cf) | arn:aws:s3:::packquest-web-1b07b2 (10/20) |
| VPC 오리진 | packquest-vpc-origin | 원본 Backend EC2(i-033c073cd3d240ab7), http-only, HTTP 8000 | vo_C1Fa5wzoZhSE0kgfSYx1Fx (10/20) |
| CloudFront | packquest-cf | 기본→S3(OAC `packquest-oac` E10COFUJ81ZT0M, CachingOptimized), `/api/*`→VPC 오리진(CachingDisabled, AllViewerAndCloudFrontHeaders-2022-06, 메서드 7개), 루트 객체 index.html, Error pages 없음, HTTPS 리디렉션, IPv6 켬 | E1JDVTXZDF4P90 / d1ra4yni7dggze.cloudfront.net (10/20) |
| 백업(FR-09 전) | packquest_before-fr09_2026-10-21_0111.sql | 스키마 변경 직전, DB 서버 `/home/ssm-user/`, 6.6K, 행 수 trips 1·members 1·items 22 | 10/21 (복원 테스트는 안 함) |
| 백업 | packquest_YYYY-MM-DD.sql / packquest-db-snap-1022 | 복원 확인 ☐ | |

---

## 7. 내 인수 기준 체크 (A 관련)

- [ ] 구축 절차 순서대로 VPC·서브넷·RT·SG·NAT·EC2 2대를 콘솔로 만들었고 설정값이 기록됨
- [ ] MariaDB `bind-address` = DB 프라이빗 IP, Backend에서 앱 계정 접속 OK
- [ ] CloudFront `/api/*` → FastAPI, 나머지 → S3 화면
- [ ] `/api/*` 원본 요청 정책 일치, `X-Pack-Token`·`X-Auth-Token`(FR-09) 서버까지 전달, Error pages 없음
- [ ] 두 서버 프라이빗·공인 IP 없음, 22번 닫힘, SSM으로만 접속
- [ ] 3306은 sg-app만, root 원격 로그인 차단, 앱 계정 최소 권한
- [ ] S3 비공개 + OAC로만 접근, 장기 액세스 키 없음
- [ ] 백업 1회 이상 + 복원 확인
- [ ] 2일 차 끝 DB 접속 확인 완료(3일 차를 기다림 없이 시작)
- [ ] 배포 절차 직접 1회 수행, 통합 테스트·점검 참여
