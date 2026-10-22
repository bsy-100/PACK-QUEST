# 화면(프론트엔드) 배포 (C)

PRD 구축 절차 14단계(화면 업로드)와 18단계(리소스 기록)를 따른다. 화면 파일을 S3에 올리고 CloudFront 캐시를 비우는 순서다. 처음 업로드(10/20)부터 화면이 바뀔 때마다 이 순서를 그대로 반복한다.

- AWS 작업은 **A 노트북 한 대**로 한다(팀 결정, 10/20). 콘솔에서만 작업하고 액세스 키는 쓰지 않는다.
- 비밀번호, 계정 ID, 비용 정보는 이 문서에 적지 않는다.

## 0. 리소스

| 항목 | 값 |
|---|---|
| S3 버킷 | `packquest-web-1b07b2` (서울 리전, 퍼블릭 액세스 모두 차단, 정적 웹 호스팅 끔). A가 만듦 |
| 서비스 주소 | https://packquest.pmk.mzsec.cloud — Route 53 도메인을 CloudFront에 연결, 인증서는 ACM. 화면은 S3(OAC), `/api/*`는 Backend 서버. A가 만듦. 브라우저 localStorage는 도메인별이라 옛 주소에서 만든 여행·로그인은 이 주소에서 보이지 않는다 |
| CloudFront 기본 주소(예비) | https://d1ra4yni7dggze.cloudfront.net — 같은 배포. 도메인 연결 뒤에도 열리며 전환 기간 예비로만 확인한다 |
| 올리는 파일 | `frontend/` 안의 `index.html`, `css/style.css`, `js/` 5개(`api.js`, `app.js`, `constants.js`, `mock.js`, `personal.js`) — 모두 7개 |
| 올리지 않는 파일 | `frontend/CHECKLIST.md`(올리면 누구나 볼 수 있다), `.gitkeep`, `tools/`, `docs/`, `backend/` |

`assets/`에 이미지나 폰트를 넣게 되면 그때부터 `assets/`도 올린다.

## 1. 어느 커밋을 올릴지 정한다

| 상황 | 올릴 브랜치 |
|---|---|
| `feature/frontend`가 아직 `main`에 합쳐지지 않았을 때(확인용) | `origin/feature/frontend` |
| 로그인 화면이 들어간 PR이 아직 `main`에 합쳐지지 않았을 때(확인용) | `origin/feature/frontend-login` |
| PR이 합쳐진 뒤, 4일 차 최종본 | `origin/main` — **최종은 `main`과 S3가 같은 버전이어야 한다** |

A의 저장소 브랜치를 바꾸지 않고 GitHub에서 파일만 꺼내므로, A가 다른 브랜치에서 작업 중이어도 괜찮다.

## 2. 올릴 파일 모으기 (A 노트북 WSL)

```bash
cd ~/packquest
REF=origin/main                      # 확인용이면 origin/feature/frontend
git fetch origin
git log -1 --format='%h %s' $REF     # 커밋 번호를 적어 둔다(팀 채팅에 씀)

rm -rf ~/upload-web && mkdir -p ~/upload-web
git archive $REF frontend/index.html frontend/css frontend/js | tar -x -C ~/upload-web --strip-components=1
find ~/upload-web -name .gitkeep -delete
find ~/upload-web -type f | sort
```

마지막 명령 결과가 아래 7개면 된다.

```
/home/mzcedu/upload-web/css/style.css
/home/mzcedu/upload-web/index.html
/home/mzcedu/upload-web/js/api.js
/home/mzcedu/upload-web/js/app.js
/home/mzcedu/upload-web/js/constants.js
/home/mzcedu/upload-web/js/mock.js
/home/mzcedu/upload-web/js/personal.js
```

## 3. S3에 업로드 (콘솔)

1. 콘솔 → S3 → `packquest-web-1b07b2` → **업로드**
2. Windows 탐색기 주소창에 `\\wsl$\Ubuntu\home\mzcedu\upload-web` 입력
3. `index.html`, `css`, `js` 세 개를 선택해 업로드 창에 끌어다 놓는다(폴더 구조가 유지된다)
4. 목록 경로가 `index.html`, `css/style.css`, `js/...`인지 확인한다. `upload-web/index.html`처럼 앞에 폴더 이름이 붙으면 안 된다
5. 권한·속성은 기본값 그대로 **업로드**. 퍼블릭 읽기 권한을 주지 않는다

같은 경로의 파일은 자동으로 덮어쓰므로 기존 파일을 먼저 지울 필요는 없다. 업로드 후 버킷 루트에 `index.html`, `css/`, `js/`만 있고 각 파일의 "마지막 수정" 시각이 방금으로 바뀌었는지 본다. `.gitkeep`이나 `CHECKLIST.md`가 보이면 그 파일만 삭제한다.

## 4. CloudFront 캐시 무효화 (콘솔)

1. 콘솔 → CloudFront → PACK QUEST 배포 → **무효화** 탭 → **무효화 생성**
2. 객체 경로 `/*` 입력 → 생성
3. 상태가 **완료됨**이 될 때까지 기다린다(보통 1~2분)

무효화를 하지 않으면 CloudFront가 저장해 둔 예전 화면이 한동안 계속 보인다.

## 5. 확인

| 순서 | 확인 | 기대 결과 |
|---|---|---|
| 1 | https://packquest.pmk.mzsec.cloud | 새 화면이 열린다(403 아님, 인증서 경고 없음). 예전 화면이면 Ctrl+Shift+R |
| 2 | https://packquest.pmk.mzsec.cloud/api/health | JSON 응답 |
| 3 | 없는 코드(예: `ABCD2345`)로 합류 | "여행을 찾을 수 없어요" 안내(서버가 HTML이 아닌 JSON 오류를 보냄) |
| 4 | `?mock=1` 없이 여행 만들기 → 맡기 → 체크 → 진행률 | 실제 API로 끝까지 된다. 휴대폰으로 같은 코드에 합류해 참여자 화면도 본다 |
| 5 | 로그인 없이 여행 만들기·참여 | 로그인하지 않아도 4번이 그대로 된다 |
| 6 | 가입(또는 로그인) → 여행 만들기 → 다른 브라우저(시크릿 창·휴대폰)에서 같은 계정으로 로그인 → 내 여행의 "이 기기에서 열기" | 주최자 권한 그대로 열리고, 처음 기기는 첫 화면으로 돌아가 "다른 기기에서 접속했어요" 안내가 뜬다. 확인 후 테스트 여행은 삭제한다 |

## 6. 팀 채팅에 기록

```
[S3 업로드] <무엇을 바꿨는지 한 줄>
- 올린 사람: C (A 노트북)
- 시간: MM/DD HH:MM
- 커밋: <2단계 커밋 번호> (<브랜치>)
- 버킷: packquest-web-1b07b2 — index.html, css/style.css, js/ 5개
- CloudFront 캐시 무효화 /* 완료
- 확인: 화면 열림, /api/health JSON, 없는 코드 오류 안내, 핵심 흐름
```

## 문제 해결

| 증상 | 확인할 것 |
|---|---|
| 화면이 403 | A가 OAC 버킷 정책을 버킷에 붙였는지, `index.html`이 버킷 루트에 있는지(`frontend/index.html`처럼 한 단계 안이면 안 된다) |
| 예전 화면이 계속 보임 | 무효화 `/*`가 완료됐는지, 브라우저 강력 새로고침(Ctrl+Shift+R) |
| 화면은 열리는데 글자만 보이고 모양이 없음 | `css/style.css` 경로로 올라갔는지 |
| 버튼이 동작하지 않음 | `js/` 5개가 모두 `js/` 경로로 올라갔는지. 브라우저 F12 콘솔의 빨간 오류 |
| API 오류가 HTML로 옴, 안내 대신 "일시적인 오류" | CloudFront 사용자 지정 오류 응답이 비어 있는지(A), `/api/*` 동작이 있는지 |
| `/api/health`가 502 | Backend 서버의 uvicorn이 `0.0.0.0:8000`에서 실행 중인지, sg-app 허용 규칙(B·A) |

## 되돌리기

문제가 생긴 화면을 바로 되돌리려면 2단계의 `REF`를 이전에 올렸던 커밋 번호(팀 채팅 기록)로 바꿔 같은 순서(2 → 3 → 4 → 5)를 반복한다.

```bash
REF=<이전 커밋 번호>
```

## 발표 후 정리 (PRD 단계 19, A 진행)

버킷은 비어 있어야 삭제된다. A가 리소스를 지울 때 S3 → `packquest-web-1b07b2` → **비우기** → **삭제** 순서로 하는지 같이 확인한다.
