# 네이버 호환성 검증 — 이슈 #3

검증 이력: 2026-11-05 KST 초기 합성 검증, **2026-11-06 KST 실제 DOM 재관찰**. 기준 main: `e8d4901ae7c7c4d1e6395a1894c090473195ced5`.

## 결론과 증거의 구분

**최신 실제 검증에서는 받은메일함 80행의 식별과 설치된 MV3 확장의 Mock 배지 삽입에 성공했다.** [실제 Mock 삽입 보고서](naver-live-mock-validation.md)에 조건·UI·남은 제한을 기록했다. 아래는 그 이전의 초기 합성 검증과 읽기 전용 조사 이력이다. 읽기 전용 단계에서는 분리된 로그인 테스트 탭을 확보하지 못해 삽입을 보류했고, 이후 사용자가 이번 작업에 한해 기존 세션 사용을 추가 허용하여 별도 실증했다.

[기존 DOM 기록](naver-webmail-dom.md)과 ESSMT 비공개 선행 이슈 #234/#235의 결과 댓글을 읽었다. 선행 관찰과 이번 합성 테스트를 혼동하지 않도록 아래에서 구분한다. 비공개 코드·실제 메일 데이터는 이 저장소로 옮기지 않았다.

## 환경 접근 확인 — 2026-11-05 초기 실행

- 원본 저장소의 origin과 clean 작업 상태를 확인하고 `git fetch origin` 후 기준 커밋에서 별도 managed worktree 및 `codex/issue-3-naver-compatibility` 브랜치를 만들었다. 원본 체크아웃은 보존했다.
- 기존 `scripts/cdp-mail/README.md`와 `connect.mjs`를 읽었다. 해당 도구는 기본 CDP `localhost:9222`와 수집 프로필을 사용한다. `connect.mjs`는 제목/URL을 출력하므로 실행하지 않았다. 캡처·설치·reload·커서/인입 조작 스크립트도 실행하지 않았다.
- 현재 작업 환경의 loopback CDP 접속은 시간 초과였다. 기존 개발 호스트 `es2003`의 SSH는 시간 초과였고 Tailscale peer 상태는 `Online=false`였다. 서비스를 시작하거나 네트워크 설정을 바꾸지 않았다.
- 연결된 Playwright 도구 브라우저에는 `about:blank` 탭만 있었다. 분리된 로그인 테스트 세션을 확보하지 못했다. 프로필을 복제하거나 쿠키/인증 토큰을 조회하지 않았다.

## 선행 관찰 — 선행 조사 기록

선행 기록은 일반 `mail.naver.com` 받은메일함 `/v2/folders/0/all`, Chrome 151.0.7922.77 / CDP 1.3을 대상으로 했다. 목록 80행에서 제목 링크 `/v2/popup/read/{folderSN}/{mailSN}`와 `mail-{mailSN}` 클래스가 80/80 일치했다. 제목 링크는 `.mail_inner > .mail_title > a.mail_title_link` 아래에 있고 첨부·미리보기·팝업 요소는 같은 제목 영역의 형제였다.

당시 단일 viewport 800×457에서 제목 영역은 flex/overflow hidden, 링크는 nowrap/hidden/ellipsis, 행 높이는 39px였다. 이 수치는 범용 반응형 규격이 아니다. 링크 뒤 별도 배지 컨테이너는 **삽입 후보**였으며 실제 삽입 결과가 아니었다. 링크의 popup 경로만으로 실제 클릭 동작을 확정할 수 없다.

## 데모와 실제 환경의 차이

| 항목 | 합성 데모 | 실제 네이버 선행 관찰 / 이번 지원 범위 |
| --- | --- | --- |
| 화면 계약 | `#demo-root` ready/namespace/generation | 데모 계약 없음; DOM 루트와 허용 경로를 별도 판별 |
| 조회 | 같은 origin의 합성 `postMessage` bridge | bridge 없음; 확장 격리 world의 로컬 합성 조회 |
| 식별 | 합성 href/class | 선행 관찰과 같은 엄격한 href/class 교차 확인; 추정 fallback 없음 |
| 계정 | 명시적 합성 namespace | 실제 계정 식별 미구현; Mock만 사용, 영구 캐시 없음 |
| UI | 통제된 레이아웃/동작 | 복잡한 flex·아이콘·읽음/선택 label; live 영향 미검증 |
| 전환 | 명시적 generation/이벤트 | 실제 SPA·가상화 계약 미검증; 합성 DOM 변이로 방어 로직 검증 |

## 읽기 전용 조사 단계의 판정 — 후속 삽입 실증 이전

| 항목 | 당시 결과 |
| --- | --- |
| 받은메일함 DOM·mailSN 재확인 | **확인** — 80행·고유 SN 80개, href/class 일치 80/80, 확장 식별 함수 결과 80/80 |
| 실제 MV3 Mock 배지 삽입 | 미검증 — 분리된 로그인 프로필 없음 |
| 실제 메일별 정확성·태그 없음·미매칭 | 미검증 |
| 다른 메일함·검색·상세·팝업 | 미검증 |
| 실제 SPA 전환·행 재사용·스크롤·지연 응답 | 미검증 |
| 읽음·선택·중요·링크·키보드 영향 | 미검증 — 기존 세션에서 조작하지 않음 |
| 실제 제목 말줄임·첨부/답장/전달·좁은 화면 | 미검증 |
| 제품판 Chrome/Edge 수동 설치·접근성 | 미검증 |

## 읽기 전용 단계에서 남긴 후속 검증·API 조건

1. 기존 수집 프로필과 분리된 새 테스트 프로필에서 사용자가 직접 로그인한 세션을 마련한다. 세션 복사와 인증정보 추출은 하지 않는다. 테스트 확장을 기존 collector에 설치하지 않는다.
2. 현재 받은메일함 DOM을 집계로 다시 확인한다. 실제 SN·href·텍스트·HTML·스크린샷을 공개 파일/로그로 내보내지 않는다.
3. 분리된 프로필에서만 Mock 배지 삽입·선택·읽음·중요·링크·스크롤·좁은 화면을 직접 확인한다. 메일 상태 변경을 포함한 테스트는 테스트 계정/메일로 수행한다.
4. 검색·다른 메일함·상세의 실제 DOM을 확인한 뒤 지원 경로를 추가한다. 실제 SPA 전환·목록 루트 교체·가상화·계정 변경을 검증한다.
5. 운영 API 전에는 계정 namespace, 인증/권한, SN NULL·중복·폴더별 태그 차이의 해소 정책, 배치 조회 계약·오류·만료·캐시 무효화를 별도 설계한다. 현재 Mock 매핑은 ESSMT DB 매칭을 증명하지 않는다.

자동 검증 결과와 구현 범위는 아래에 최종 기록한다.

## 구현 범위 — 2026-11-05 합성 검증 단계

- 기본 manifest는 localhost 데모 전용을 유지한다. `npm run build:experimental-naver`는 저장소 밖 임시 폴더에 별도 실험 확장을 만들며 그 복사본에만 Naver 호스트를 추가한다. 이 명령의 산출물 생성과 manifest도 확인했다. 실제 수집 프로필에 설치하지 않았다.
- Naver 어댑터는 HTTPS `mail.naver.com`의 정확한 `/v2/folders/0/all`과 단일 `.mail_list`만 허용한다. query는 허용하고 hash는 허용하지 않는다. 다른 화면은 지원한다고 주장하지 않는다.
- 실제 식별자는 격리 world 메모리 안에서만 사용한다. SN 마지막 숫자를 3으로 나눈 나머지에 따라 1은 `Mock · 합성 태그`, 2는 매칭/태그 없음, 0은 미매칭으로 계산한다. 이는 합성 테스트 규칙이며 운영 분류와 무관하다. 영구 매핑/캐시·네트워크·스토리지·페이지 postMessage·운영 API는 없다.
- 기존 strict identity, 배치·렌더링·취소 및 응답 적용 전 행/context 재검사를 재사용한다. 링크와 클래스가 일치하지 않으면 배지를 붙이지 않는다.
- MutationObserver를 데모 root 및 Naver 목록 root에 한정했다. Naver root의 직접 부모에는 subtree 없는 childList 감시를 추가해 루트 교체/재삽입 수명을 구분한다. Navigation API와 컨텍스트 점검은 경로 변경·루트 교체를 감지한다. CSS는 지원 root 표시 아래의 확장 배지만 대상으로 한다.
- 상위 조상이 통째로 교체되는 경우에는 150ms 컨텍스트 점검으로 발견한다. 이 경우 복제된 배지의 제거가 즉시 이루어진다고 보장하지 않는다. 실제 SPA의 조상 교체 패턴과 계정 변경 감지는 live 검증이 필요하다.

## 합성 자동 검증

실행 환경은 Node.js 22.22.1, Playwright bundled Google Chrome for Testing 156.0.8078.4, headless Chromium, 임시 사용자 프로필이다. Naver E2E의 HTTPS 요청은 모두 합성 HTML로 대체했고 다른 외부 요청은 차단했다. 확장 코드를 페이지 평가로 넣는 대신 임시 프로필에 실제 MV3 확장을 로드했다. **URL이 Naver여도 실제 Naver 서버·로그인·운영 메일로 시험한 것이 아니다.**

- Node: 기존 identity/bridge/Mock 검증에 허용 경로·로컬 합성 조회/취소·무관한 localhost에서 observer 미연결 검증을 추가했다.
- Naver 합성 E2E: 배지/빈 결과/미매칭/식별 불가·중복 SN, 지연 중 행 재바인딩, 루트 교체와 식별자 변경, 미지원 경로 이동/빠른 복귀를 확인했다.
- 합성 UI: 선택·읽음·중요 토글, 제목 href/클릭, 360px에서 제목·배지·첨부 요소의 비겹침을 확인했다. 실제 Naver의 native UI 동작·말줄임·아이콘 스타일을 재현했다는 증거는 아니다.
- 개인정보 경계: 합성 Naver 페이지가 받은 postMessage는 없었고, 초기 합성 문서 이외 조회 요청은 없었다. 기본 manifest의 Naver 미포함과 별도 실험 빌드 생성도 확인했다.
- localhost 회귀: 무관한 페이지의 유사 태그 요소는 스타일이 바뀌지 않고 상태/루트 표기도 삽입되지 않는다. 기존 데모의 bridge·실패/복구·계정/reset·검색/페이지·100개 배치·늦은 응답·행/제목 링크 재사용 테스트를 유지했다.

최종 재실행: `npm test` **25/25 통과**, `npm run test:e2e` **38/38 통과**(23.8초). 기존 데모 33개를 모두 유지하고 합성 Naver 4개와 무관한 localhost 회귀 1개를 추가했다. `npm run build:experimental-naver`, 문서 상대 링크 확인, `git diff --check`도 통과했다. 초기 E2E는 로컬 서버 가용성 확인에서 대기해 명시적으로 데모 서버를 시작한 뒤 재실행했다. 개발 중 중복 E2E 실행의 결과물 경합은 순차 재실행으로 해소했으며 위 결과는 단독 전체 실행 결과다.

코드·명세·개인정보 경계 검토에서 주요 결함은 없었다. 실험 빌드의 출력 경계(저장소 root와 하위 경로 거부) 및 문서의 스크립트 개수 지적은 수정하고 회귀 테스트와 재검토를 마쳤다. 최종 Node 테스트에는 빌드 출력 경계/원본 manifest 보존 검증 2개가 포함된다.


## 2026-11-06 KST 읽기 전용 재관찰

### 환경과 안전 경계

사용자의 재확인 요청 후 es2003 SSH와 loopback CDP가 응답했다. 기존 `essmt-mail-chrome.service`는 조사 전후 `active`였다. 브라우저는 **Chrome 151.0.7922.77 / CDP 1.3**, 기존 열린 탭은 `https://mail.naver.com`의 `/v2/folders/0/all` 받은메일함 한 개였다. 프로세스의 알려진 profile 플래그를 boolean으로만 검사해 이 연결이 기존 수집 프로필임을 확인했다. 전체 수집 파이프라인의 건강 검증을 수행한 것은 아니다.

다른 접근 가능한 CDP 연결(Chrome 151.0.7922.75)에는 Naver 메일/로그인 탭이 없었다. 그 탭의 내용은 읽지 않았고 이동시키지 않았다. 다른 위치에 테스트 프로필이 전혀 없다는 뜻은 아니며, **이번 조사에서 접근 가능한 분리 로그인 테스트 세션은 확보하지 못했다.** Windows의 기존 로그인 세션을 복제하거나 인증정보를 가져오지 않았다.

임시 probe는 저장소 밖에서 SSH 표준입력으로 Node.js에 전달했다. CDP `Target.getTargets` → 대상 한 개 `attachToTarget` → `DOM.getDocument(depth=0)`, `DOM.querySelectorAll`, `DOM.getAttributes`, `CSS.getComputedStyleForNode`, `DOM.getBoxModel`, `Page.getLayoutMetrics`만 사용하고 detach/연결 종료했다. **Runtime.evaluate, isolated world 생성, 페이지 스크립트·확장 주입, DOM 쓰기, fetch/XHR 또는 Naver API 호출은 하지 않았다.** CDP 연결 확인용 localhost `/json/version`·`/json/list`는 Naver 메일 API와 별개다.

실제 href/class 값은 원격 Node 프로세스 메모리에서만 비교했다. `extension/identity.js`의 동일한 `identifyMail` 함수를 그 Node 프로세스에 로드해 비교했으며, 페이지에 확장을 설치하거나 content script를 실행한 검증은 아니다. 출력은 아래의 집계/허용된 CSS 수치뿐이었다. 실제 SN·메일 텍스트·주소·쿠키·토큰·원본 HTML·네트워크 body·화면 캡처는 공개 파일이나 외부 서비스에 저장/전송하지 않았다.

### 직접 확인한 DOM 집계

| 항목 | 관찰 결과 |
| --- | --- |
| `.mail_list` | 1개 |
| `.mail_list > .mail_item` | 80행 |
| 각 행의 단일 `a.mail_title_link` | 80/80 |
| `/v2/popup/read/{folderSN}/{mailSN}` 경로 형식 | 80/80 |
| 단일 `mail-{mailSN}` 클래스와 링크 SN 일치 | 80/80 |
| 고유 SN / 확장 식별 함수 성공 | 80개 / 80행 |
| 링크 누락·다중 링크·형식 오류·충돌 | 0행 — 현재 목록 한 화면의 결과 |
| `.mail_inner > .mail_title > a.mail_title_link` | 80개 |
| 제목 영역 하위 첨부 아이콘 | 48개 |
| 제목 영역 하위 preview / popup 버튼 | 각각 80개 |
| 목록 내부 선택 / 읽음 / 중요 input | 각각 80개 |
| 데모 root / 확장 root·배지 표식 | 모두 0개 |

세 차례의 수동 조작 없는 집계에서 같은 건수와 크기를 확인했다. 실제 SN 집합/행 순서의 시점 간 동일성을 비교하지 않았으므로 갱신·재정렬·가상화가 없었다고 단정하지 않는다. 전체메일·보낸메일·검색·상세는 열린 탭이 없어 조사하지 않았다. 클릭하지 않았으므로 제목 링크의 실제 탐색 방식이나 읽음 변경 여부도 확인하지 않았다.

### 현재 레이아웃과 합성 fixture의 차이

viewport는 기존 **800×457**을 유지했다. 행은 708×39px, `.mail_item > .mail`은 flex였다. `.mail_inner`는 content 폭 236px, 오른쪽 padding 8px, `flex: 1 1 0%`였다. 제목 영역은 **236×21px**, `display:flex`, `align-items:flex-start`, `overflow:hidden`이었다.

제목 링크는 `display:block`, `flex:0 1 auto`, `max-width:100%`, `min-width:0`, nowrap/hidden/ellipsis였고 첫 행에서 195×21px였다. 첨부 아이콘은 18×18px와 `position:absolute`, preview/popup은 18×18px, shrink 0이었다. 이 값은 현재 요소에서 읽은 computed style이며 모든 행/반응형/hover 상태의 규격을 뜻하지 않는다.

기존 합성 Naver fixture는 링크를 `flex:1`로 두고 첨부를 일반 flow의 형제로 단순화했다. 따라서 그 fixture의 360px 비겹침 검증은 **실제 제목 말줄임·절대 위치 첨부·preview/popup과 배지가 충돌하지 않는다는 증거가 아니다.** 링크 뒤 형제 컨테이너를 둘 수 있는 DOM 구조는 재확인했지만, 실제 삽입의 시각적 안전성은 별도 로그인 테스트 프로필에서 확인해야 한다. 이 읽기 전용 조사만으로 CSS나 지원 경로를 추측해 확장하지 않았다.

### 읽기 전용 재관찰 당시 판정

- 실제 목록의 DOM 식별 계약: **현재 받은메일함 한 화면에서 확인**.
- 실제 MV3 격리 world·Mock 배지 삽입·메일별 표시 정확성: **미검증**.
- 원래 메일 UI에 미치는 영향·화면 전환·스크롤·실제 좁은 화면: **미검증**.
- 실제 API/인증/DB·다른 화면 지원: 기존 비범위/후속 작업 유지.

11월 6일 후속 자동 검증도 `npm test` **25/25**, `npm run test:e2e` **38/38**(23.5초) 통과했다. 문서 상대 링크와 `git diff --check`, 집계/개인정보 및 검증 범위에 대한 별도 문서 검토도 통과했다. 확장 소스는 이번 재관찰에서 변경하지 않았다.

이후 사용자가 기존 로그인 세션 사용을 허용하여 실제 MV3 Mock 삽입을 수행했다. 이 기록의 과거 미검증 판정은 [후속 실제 검증 보고서](naver-live-mock-validation.md)에서 확인된 항목에 한해 갱신된다.
