# PLAN.md — PACK QUEST · A 역할(인프라·MariaDB)

> 기준 문서: PACK QUEST PRD v4.5 · 기간 10/19(월)~10/23(금) · 금요일 라이브 데모
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
- [ ] 비용 확인 화면(청구서 또는 Cost Explorer) 열림 — **미확인**(나중에 확인하기로 함)

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
- [ ] B가 만든 `schema.sql` 검토(외래 키 `ON DELETE CASCADE`, utf8mb4)
- [ ] 리소스 기록표 1일 차 칸 채우기

### 1일 차 끝 체크
- [x] VPC/IGW/서브넷 3/RT 2/NAT/SG 2/IAM 역할 2 완료 · 기록표 반영 — 10/19 확인
- [ ] 비용·실행 중 리소스 확인(NAT Gateway 과금 시작)

---

## 2일 차 — 10/20(화) · 서버, DB, S3 (단계 8~12, 14)

**처리 순서가 중요하다**: `9(Backend 서버) → B에게 전달 → 14(버킷) → C에게 전달 → 8 → 10 → 11 → 12`

### 단계 9 — Backend 서버 (오전 가장 먼저)
- [x] EC2 `packquest-backend`: Ubuntu LTS, `packquest-private-app`, **공인 IP 없음**, `sg-app`, `packquest-ec2-backend-role`, **키 페어 없음**, EBS **암호화** — 10/20 CLI 생성 후 조회 확인(t3.small, Ubuntu 24.04, IMDSv2 필수)
- [x] 상태 검사 2/2 통과 → **B에게 인스턴스 이름·프라이빗 IP 전달** (B가 SSM 접속 후 단계 13 진행) — 10/20 상태 검사 2/2 ok, SSM 관리형 노드 Online 확인. B에게 전달 완료(10/20, 사용자 확인)
- [x] B가 SSM으로 접속되지 않으면 NAT 경로 → 역할 → SSM 에이전트 순서로 같이 점검 — 10/20 B SSM 접속 완료(사용자 확인), 점검 불필요

### 단계 14 — S3 버킷 (오전)
- [ ] `packquest-web-<고유값>` 생성, **퍼블릭 액세스 모두 차단**, 정적 웹 호스팅 **사용 안 함**
- [ ] C에게 버킷 이름 전달 (C가 2일 차 안에 뼈대 `index.html` 업로드)

### 단계 8 · 10 — DB 서버
- [ ] EC2 `packquest-db`: Ubuntu LTS, `packquest-private-db`, 공인 IP 없음, `sg-db`, `packquest-ec2-db-role`, 키 페어 없음, EBS 암호화
- [ ] Session Manager로 접속 확인

### 단계 11 — MariaDB 설치·설정 (DB 서버 SSM 세션)
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

DB·앱 계정 생성 (비밀번호는 `openssl rand -base64 24`로 만들고 **바로 Parameter Store에 넣은 뒤 화면을 지운다**):
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
- [ ] `schema.sql`은 GitHub에서 복사해 **SSM 세션에 붙여 넣어** 실행(`sudo mariadb packquest`). DB 서버에는 GitHub 자격 증명을 두지 않는다.
- [ ] `SHOW TABLES;` → `trips`, `members`, `items` 3개, 외래 키 CASCADE 확인

> 주의: 앱 계정은 Backend **프라이빗 IP에 묶여 있다**. Backend 인스턴스를 다시 만들면 IP가 바뀌므로 계정의 host도 바꿔야 한다.

### 단계 12 — Parameter Store
- [ ] `/packquest/db-password`, 유형 **SecureString**, 값 = 위 무작위 비밀번호
- [ ] B에게 전달: DB 호스트(DB 프라이빗 IP), 계정명 `packquest_app`, DB명 `packquest`, 파라미터 이름 `/packquest/db-password` (**비밀번호 자체는 전달하지 않음**)

### 2일 차 끝: DB 접속 확인 (인계물)
Backend 서버 SSM 세션에서 (B와 함께):
```bash
sudo apt install -y mariadb-client
mariadb -h <DB_PRIVATE_IP> -u packquest_app -p packquest -e "SHOW TABLES;"   # 성공해야 함
mariadb -h <DB_PRIVATE_IP> -u root -p                                       # 실패해야 함
```
- [ ] 앱 계정 접속 성공 / root 원격 접속 실패
- [ ] B의 `/api/health` 뼈대가 `curl http://<BACKEND_IP>:8000/api/health`로 응답 (B 담당, 나는 확인만)
- [ ] C의 뼈대 화면이 버킷에 보임 (C 담당, 나는 확인만)
- [ ] 기록표 2일 차 칸 채우기

---

## 3일 차 — 10/21(수) · CloudFront와 통합 (단계 15~16)

### 단계 15 — CloudFront 설정 순서
1. [ ] **사전 확인**: Backend 서버 실행 중, uvicorn `0.0.0.0:8000`에서 응답 (`curl http://<BACKEND_IP>:8000/api/health`)
2. [ ] (필요 시) 연결 테스트용으로 `sg-app`에 인바운드 TCP 8000, 소스 = 관리형 접두사 목록 `com.amazonaws.global.cloudfront.origin-facing` **임시** 추가
3. [ ] CloudFront 콘솔 → **VPC 오리진** 생성 `packquest-vpc-origin`: 원본 ARN = Backend EC2, HTTP, 포트 8000 → 상태 **Deployed** 대기(최대 15분, 그동안 설정값 기록)
4. [ ] 배포 `packquest-cf` 생성, 원본 2개
   - S3 원본: **OAC** 사용 → **기본 동작(`*`)**, 기본 루트 객체 `index.html`
   - VPC 오리진: 원본 도메인 = 인스턴스의 **프라이빗 IP DNS 이름**(`ip-10-0-1-xx.ap-northeast-2.compute.internal`), HTTP/8000
5. [ ] 콘솔이 보여주는 **OAC 버킷 정책을 복사해 S3 버킷 정책에 붙여 넣기** (안 하면 화면 403)
6. [ ] 동작 `/api/*` → VPC 오리진
   - 캐시 정책: `Managed-CachingDisabled`
   - 원본 요청 정책: `Managed-AllViewerAndCloudFrontHeaders-2022-06`
   - 허용 메서드: GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE 전부
7. [ ] **사용자 지정 오류 응답(Error pages)은 설정하지 않는다** (API JSON 오류가 index.html로 바뀜)
8. [ ] `sg-app` 허용 규칙 교체: 인바운드 TCP 8000, 소스 = **`CloudFront-VPCOrigins-Service-SG`** (서비스 관리형 SG) → 접두사 목록 임시 규칙 **삭제**. 서비스 관리형 SG는 수정하지 않고, 같은 이름 패턴으로 SG를 직접 만들지 않는다.
9. [ ] C에게 배포 ID·도메인 전달 (화면 변경 후 C가 캐시 무효화)

### 확인
- [ ] `https://<dxxxx>.cloudfront.net/` → 화면 열림 (403 아님)
- [ ] `https://<dxxxx>.cloudfront.net/api/health` → JSON 응답
- [ ] 없는 코드로 참여 → HTML이 아닌 **JSON 오류**
- [ ] B와 함께 서버 로그에서 `X-Pack-Token`, `CloudFront-Viewer-Address`가 도착하는지 확인 (IPv6 형식도 이때 확인)
- [ ] S3 객체 URL로 직접 접근 → 차단(AccessDenied)

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
| 토큰이 서버에 안 옴 | `X-Pack-Token` 헤더, 원본 요청 정책 `AllViewerAndCloudFrontHeaders-2022-06` |
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
| sg-app | packquest-sg-app | 8000 ← CloudFront 서비스 관리형 SG(단계 15에서 추가, 현재 인바운드 없음) | sg-09c3d767d5d3fae47 (10/19) |
| sg-db | packquest-sg-db | 3306 ← sg-app | sg-0969c421fc57972b3 (10/19) |
| IAM 역할(DB) | packquest-ec2-db-role | SSMManagedInstanceCore, 인스턴스 프로파일 동명 | arn:aws:iam::<ACCOUNT_ID>:role/packquest-ec2-db-role (10/19) |
| IAM 역할(Backend) | packquest-ec2-backend-role | SSMManagedInstanceCore + 인라인 `packquest-read-db-password`(GetParameter 1개), 인스턴스 프로파일 동명 | arn:aws:iam::<ACCOUNT_ID>:role/packquest-ec2-backend-role (10/19) |
| Backend EC2 | packquest-backend | Ubuntu 24.04 LTS (ami-0e1eeb87102d64f40), t3.small, packquest-private-app, 프라이빗 IP 10.0.1.154 (ip-10-0-1-154.ap-northeast-2.compute.internal), 공인 IP·키 페어 없음, sg-app, packquest-ec2-backend-role, IMDSv2 필수, EBS 8GB gp3 암호화(vol-038bb10ecc7402eba) | i-033c073cd3d240ab7 (10/20) |
| DB EC2 | packquest-db | Ubuntu ___, 프라이빗 IP ___ | |
| MariaDB | DB `packquest` | bind-address ___, 앱 계정 `packquest_app@<backend IP>` | 권한 S/I/U/D |
| Parameter | /packquest/db-password | SecureString, aws/ssm 키 | |
| S3 버킷 | packquest-web-___ | 퍼블릭 차단, OAC 정책 | |
| VPC 오리진 | packquest-vpc-origin | HTTP 8000, 프라이빗 IP DNS | |
| CloudFront | packquest-cf | 기본→S3(OAC), `/api/*`→VPC 오리진, CachingDisabled, AllViewerAndCloudFrontHeaders-2022-06, Error pages 없음 | 도메인 ___ |
| 백업 | packquest_YYYY-MM-DD.sql / packquest-db-snap-1022 | 복원 확인 ☐ | |

---

## 7. 내 인수 기준 체크 (A 관련)

- [ ] 구축 절차 순서대로 VPC·서브넷·RT·SG·NAT·EC2 2대를 콘솔로 만들었고 설정값이 기록됨
- [ ] MariaDB `bind-address` = DB 프라이빗 IP, Backend에서 앱 계정 접속 OK
- [ ] CloudFront `/api/*` → FastAPI, 나머지 → S3 화면
- [ ] `/api/*` 원본 요청 정책 일치, `X-Pack-Token` 서버까지 전달, Error pages 없음
- [ ] 두 서버 프라이빗·공인 IP 없음, 22번 닫힘, SSM으로만 접속
- [ ] 3306은 sg-app만, root 원격 로그인 차단, 앱 계정 최소 권한
- [ ] S3 비공개 + OAC로만 접근, 장기 액세스 키 없음
- [ ] 백업 1회 이상 + 복원 확인
- [ ] 2일 차 끝 DB 접속 확인 완료(3일 차를 기다림 없이 시작)
- [ ] 배포 절차 직접 1회 수행, 통합 테스트·점검 참여
