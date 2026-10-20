# PACK QUEST AWS 구축 기록

## 기본 설정
- AWS Region: ap-northeast-2 (서울)
- VPC Name: packquest-vpc (`vpc-06f0bee59d9e4efd8`)
- VPC CIDR: IPv4 10.0.0.0/16 (DNS 확인·DNS 호스트 이름 활성화)
- Availability Zone: ap-northeast-2a (모든 서브넷 동일)

## Network
- Public Subnet: packquest-public, 10.0.0.0/24 (`subnet-0ef6230f714c1f655`) — NAT Gateway 전용
- Private App Subnet: packquest-private-app, 10.0.1.0/24 (`subnet-0b555891641fb181a`) — 공인 IP 자동 할당 끔
- Private DB Subnet: packquest-private-db, 10.0.2.0/24 (`subnet-0e03b56096c343653`) — 공인 IP 자동 할당 끔
- Internet Gateway: packquest-igw (`igw-08a68288588827a70`) — packquest-vpc에 연결됨
- NAT Gateway: packquest-nat (`nat-08d3c865dca521a96`) — packquest-public, Elastic IP 52.79.204.224
- Route Tables:
  - packquest-rt-public (`rtb-0dad1979bc0ad83c6`): 0.0.0.0/0 → IGW, 퍼블릭 서브넷 연결
  - packquest-rt-private (`rtb-0b6b2dc39c3d1b903`): 0.0.0.0/0 → NAT, 앱·DB 서브넷 연결

## Security Groups
- sg-app: packquest-sg-app (`sg-09c3d767d5d3fae47`) — 인바운드 없음(3일 차에 CloudFront VPC 오리진에서 오는 8000번만 추가 예정)
- sg-db: packquest-sg-db (`sg-0969c421fc57972b3`) — 인바운드 TCP 3306, 소스 sg-app만

## IAM Roles
- Backend EC2 Role: packquest-ec2-backend-role — AmazonSSMManagedInstanceCore + Parameter Store `/packquest/db-password` 읽기(GetParameter) 하나
- Database EC2 Role: packquest-ec2-db-role — AmazonSSMManagedInstanceCore만

## EC2
- Backend: packquest-backend (`i-033c073cd3d240ab7`) — Ubuntu 24.04 LTS, t3.small, packquest-private-app, 프라이빗 IP 10.0.1.154 (`ip-10-0-1-154.ap-northeast-2.compute.internal`), 공인 IP·키 페어 없음, sg-app, packquest-ec2-backend-role, IMDSv2 필수, EBS 8GB gp3 암호화

## 진행 상황
- 1일 차 (10/19): 완료 — VPC, 인터넷 게이트웨이, 서브넷 3개, 라우팅 테이블 2개, NAT Gateway, 보안 그룹 2개, EC2용 IAM 역할 2개. 모두 생성 후 조회로 설정값 확인함. NAT Gateway는 이때부터 과금 중.
- 2일 차 (10/20): 진행 중 — Backend 서버 생성 완료(상태 검사 2/2, SSM Online 확인) → B에게 전달 → S3 버킷 생성(C에게 전달) → DB 서버 생성 → MariaDB 설치·설정 → Parameter Store에 DB 비밀번호 저장 → 하루 끝에 Backend에서 DB 접속 확인.