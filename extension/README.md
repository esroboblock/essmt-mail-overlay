# ESSMT Mail Overlay: 데모용 MV3 확장

합성 메일 데모용 독립 Chrome/Edge Manifest V3 확장입니다. 이 폴더를 빌드 없이 설치하면 기본 Mock 모드로 동작합니다. Service Worker가 조회 모드를 관리하고, 확장 옵션에서 선택한 모드는 `chrome.storage.local`에 저장됩니다. 개발 ESSMT 조회는 별도 생성 빌드에서 활성화할 수 있습니다. 네이버 받은메일함용 실험 빌드는 로컬 Mock을 사용합니다.

## Chrome / Edge 설치 및 실행

1. 저장소 루트에서 `python3 -m http.server 4173 --bind 127.0.0.1 --directory demo` 또는 `npm run demo`를 실행합니다.
2. Chrome은 `chrome://extensions`, Edge는 `edge://extensions`에서 **개발자 모드**를 켭니다.
3. **압축해제된 확장 프로그램을 로드합니다**를 눌러 이 `extension/` 폴더(manifest.json이 직접 들어 있는 폴더)를 선택합니다. 저장소 루트나 demo 폴더를 선택하지 않습니다. WSL 저장소를 Windows 브라우저에서 열 경우 탐색기의 해당 WSL 배포판에서 `home/jeong/essmt-mail-overlay/extension`을 찾거나 이 폴더 전체를 Windows 폴더로 복사합니다.
4. <http://127.0.0.1:4173/>를 엽니다. 이미 열린 데모는 새로고침합니다. 기본 목록의 합성 메일 하나(101)에 `합성 분류 가`, `합성 분류 나`가 표시됩니다.
5. 코드 변경 후 확장 관리 화면의 **새로고침**을 누르고 데모 탭도 새로고침합니다. 중지는 확장을 비활성화/삭제하고 탭을 새로고침합니다.

허용 페이지는 HTTP `127.0.0.1`/`localhost`뿐입니다(Chromium match pattern 특성상 모든 포트). 실제로는 `#demo-root`의 ready/namespace/generation 계약과 `.mail_list`가 있는 합성 데모만 처리합니다. 기본 manifest는 네이버 및 운영 ESSMT 호스트에는 주입하지 않습니다. 별도 실험 빌드는 아래를 참고합니다. `file://`와 HTTPS는 지원하지 않습니다. 페이지와 bridge가 같은 origin이어야 합니다.

## 수동 확인

- 정상 101: 두 태그. 102: 정상 매칭이나 태그 없음. 103: 미매칭. 104: 다중 매칭이므로 태그 보류. 105: 중복 DOM 두 행 각각 같은 태그 한 벌. 식별 불가 3행에는 태그를 붙이지 않습니다.
- 검색, 페이지당 2행 및 다음 페이지, 메일함, 상세 진입/복귀, 새로고침, 계정 B/초기화를 사용합니다. 선택/읽음/중요/제목 링크는 그대로 동작해야 합니다.
- `행 재사용` 시나리오에서 101↔102를 반복합니다. `지연`을 선택한 직후에도 반복합니다. 이전 태그가 다른 메일에 남지 않아야 합니다.
- Mock 응답 401/403/500/offline/timeout에서 배지가 없어지고 원래 메일 조작은 동작해야 합니다. normal로 바꾸면 새 화면 수명에서 재조회합니다. 같은 모드로 다시 시도하려면 데모의 **새로고침**(목록 새로고침)을 누릅니다. `현재 메일 태그 조회`는 기존 진단 패널 전용 버튼입니다.

DOM에 연결된 행의 ID만 바꾸는 추가 확인: 정상 시나리오를 고른 후 개발자 도구의 **페이지 콘솔**에서 다음을 실행합니다. 행과 제목·링크·배지 하위 노드를 교체하지 않고 generation도 그대로 둡니다. 101의 배지가 즉시 사라지고 정상 빈 결과가 됩니다. `sn`을 `'101'`로 바꾸어 복구할 수 있습니다.

```js
const row = document.querySelector('.mail_item');
const sn = '102';
row.classList.remove(...[...row.classList].filter(c => c.startsWith('mail-')));
row.classList.add(`mail-${sn}`);
row.querySelector('a.mail_title_link').setAttribute('href', `/v2/popup/read/0/${sn}`);
```

## 구조와 진단

- `manifest.json`: 격리 world content scripts 다섯 개와 배지 CSS를 순서대로 로드합니다. 기본 빌드에는 Service Worker와 옵션 화면이 있으며 조회 방식만 storage 권한으로 보존합니다. 실험용 빌드에서는 이 권한과 Worker, 옵션을 제외합니다. 원격 코드와 web-accessible resources는 없습니다.
- `identity.js`: 관찰된 상대 경로 `/v2/popup/read/{folderSN}/{mailSN}` 및 단일 `mail-{SN}` 클래스의 엄격한 교차 검사. ID는 문자열로 유지합니다. 데모 참고 구현과 같은 fixture로 테스트하며, 향후 화면 지원은 이 어댑터에서 분리합니다.
- `bridge.js`: 기존 postMessage v1 계약으로 고유 ID를 사용해 요청합니다. source/origin/channel/version/id와 응답 namespace/generation/스키마를 확인합니다. 응답 누락 시 5초 후 `BRIDGE_TIMEOUT`; 취소·성공·실패 시 listener/timer를 정리합니다. bridge는 공개 합성 데이터 통신이며 인증 경계가 아닙니다.
- `adapters.js`: Naver의 지원 inbox 경로를 제한하고 격리 world 안에서만 합성 Mock 결과를 계산합니다. 네트워크·페이지 메시지·저장소·매핑 캐시를 사용하지 않습니다.
- `content.js`: MutationObserver와 데모 contextchange/ready를 관찰합니다. 같은 SN은 한 배치 안에서 한 번만 조회하고 한 번에 최대 100개, 동시 요청은 하나입니다. 캐시는 없고 현재 행 바인딩의 결과만 메모리에 보유합니다. 오류를 자동 반복하지 않습니다.
- `badges.css`: 확장 소유 요소만 스타일링합니다. 배지는 제목 링크 바로 뒤의 형제 span이며 텍스트로 렌더링합니다. 링크·버튼·체크박스를 감싸거나 이벤트를 가로채지 않습니다.

행의 `data-essmt-state`는 `loading`, `matched`, `no-tags`, `unmatched`, `ambiguous`, `unidentified`, `error` 중 하나입니다. 오류는 `data-essmt-error`에서 코드로 확인합니다. 정상 태그 이외의 상태는 메일 제목 주변을 추가 문구로 채우지 않습니다. `[data-essmt-tags]`는 태그가 있을 때만 한 개 생성합니다. 확장 관리 화면의 오류, 개발자 도구 Elements의 상태 속성을 확인하세요. content script의 `ESSMTOverlay`는 페이지 world와 격리되어 페이지 콘솔에서 바로 보이지 않습니다.

응답 적용 직전 namespace·generation·행의 현재 mailSN/folderSN·연결 여부·행별 바인딩 객체를 모두 검사합니다. 행 제거/재삽입도 새 바인딩입니다. 연결된 행의 ID가 바뀌면 이전 배지를 제거하고 새 조회를 예약합니다. 이전 요청이 끝나기까지 새 조회는 대기할 수 있지만, 오래된 결과는 새 바인딩에 적용하지 않습니다. 단순 읽음 클래스 변경에는 재조회하지 않습니다.

## 자동 검증

Node.js 22+와 Python 3:

```sh
npm ci
npx playwright install chromium
npm test
npm run test:e2e
```

Linux의 브라우저 시스템 라이브러리가 없으면 `npx playwright install --with-deps chromium`을 사용합니다. 테스트는 4173에서 데모 서버를 자동 실행하며, 이미 실행 중인 데모를 재사용할 수도 있습니다. 연결 확인이 오래 대기하는 로컬 환경에서는 먼저 `npm run demo`로 서버를 실행합니다.

`tests/e2e/extension.spec.js`는 임시 사용자 프로필의 bundled Chromium persistent context에 `--load-extension`으로 **실제 확장을 설치**합니다. headless에서도 확장 지원을 위해 `channel: 'chromium'`을 사용합니다. 테스트가 페이지 스크립트로 배지를 주입하지 않습니다. 테스트의 직접 DOM 조작은 가상 목록 재바인딩 재현에만 사용합니다. 기존 demo E2E는 확장 없는 별도 context에서 배지 미삽입을 계속 확인합니다. Chrome/Edge 제품판의 수동 설치와 UI 검증을 자동화 결과로 대체했다고 주장하지 않습니다.

## 한계 / 이슈 #3

실제 로그인된 네이버 받은메일함의 MV3 Mock 삽입·선택/스크롤·제목 클릭과 800/1280px 배지 기하를 검증했습니다. 다른 화면의 태그 지원, 계정 식별·virtualized DOM·스레드·확대/축소·접근성 및 읽음/중요 직접 토글은 별도 검증이 필요합니다. 360px에서는 원본 데스크톱 UI의 제목 영역 자체가 화면 밖이며 배지도 보이지 않아, 모바일 호환성을 주장하지 않습니다. 지원 경로는 받은메일함으로 유지하며 [실제 검증 보고서](../docs/research/naver-live-mock-validation.md)의 범위를 참고하세요.

실제 네이버 메일과 운영 DB 연결 및 운영 배포/스토어 등록은 별도 작업입니다. 401/403/offline 등의 테스트는 기존 Mock의 합성 실패입니다. 영구 캐시/태그 편집/메일 수집 기능은 없습니다.

## 실험용 Naver 로컬 Mock 빌드 (이슈 #3)

기본 `extension/manifest.json`은 계속 localhost 데모 전용입니다. 별도 실험 빌드는 다음 명령으로 저장소 밖 임시 폴더에 생성하며, 출력된 경로의 manifest에만 `https://mail.naver.com/*`를 추가합니다.

```sh
npm run build:experimental-naver
```

일반 설치는 기존 수집 프로필 대신 분리된 테스트 프로필에서 진행합니다. 2026-11-06 실제 검증은 사용자의 명시적인 추가 지시에 따라 기존 로그인 세션을 한시적으로 사용하고 원래 서비스·확장을 복구한 예외입니다. 이를 일반 설치 절차로 적용하지 않습니다. 아래 자동 E2E의 합성 화면 검증과 실제 서버 검증 결과도 구분합니다. 임시 산출물은 사용 후 삭제할 수 있습니다.

지원 범위는 HTTPS `mail.naver.com`의 정확한 `/v2/folders/0/all` 경로와 하나의 `.mail_list` 루트뿐입니다(쿼리 허용, hash 불허). 다른 화면으로 이동하면 배지와 상태를 지웁니다. 이 Mock 빌드는 페이지 bridge, postMessage, 외부 서비스, 네트워크, 저장소를 사용하지 않습니다. 격리 world 안에서 현재 배치에 대해서만 합성 결과를 계산합니다. SN 마지막 숫자를 3으로 나눈 나머지가 1이면 `Mock · 합성 태그`, 2이면 매칭되지만 태그 없음, 0이면 미매칭입니다. 운영 DB·계정·실제 분류와 관계없는 테스트 규칙입니다. 식별 불가 행은 조회하지 않습니다. 매핑 캐시는 없으며 루트/URL 변경 시 현재 행 바인딩을 폐기합니다.

데모와 Naver는 렌더러, 최대 100개 고유 SN 배치 및 오래된 응답 차단을 공유합니다. 하위 변경 MutationObserver는 지원 루트 안에만 연결하고 Naver 루트 부모에는 직접 자식 교체만 관찰하며 CSS도 지원 루트 표시와 확장 소유 배지에 한정합니다. Chromium Navigation API와 150ms 컨텍스트 점검으로 URL/루트 교체를 감지합니다. 정기 점검은 컨텍스트가 달라질 때만 행을 다시 검색합니다. Naver 루트 제거/재삽입은 새 수명으로 취급합니다. 부모 자체가 교체되는 경우 정기 점검에서 새 루트를 감지합니다.

`tests/e2e/naver.spec.js`는 합성 inbox에서 태그/빈 태그/미매칭/식별 불가, 중복 SN, 지연 중 재바인딩, 루트 복제 교체, 지원 밖 경로 및 빠른 복귀, 360px 제목/배지/첨부 배치, 선택/읽음/중요 버튼을 검증합니다. 이 합성 테스트 결과와 실제 세션의 검증 결과는 별개입니다. 실제 확인한 동작·배치와 첨부 클릭/읽음·중요 토글 등 미검증 항목은 [실제 검증 보고서](../docs/research/naver-live-mock-validation.md)에 명시했습니다.

## ESSMT 개발 서버 연결 (#7)

소스의 `extension/`는 기본 Mock 전용이며 외부 호스트 권한이 없습니다. 아래 생성 단계는 주소와 namespace를 확장 내부 설정으로 고정하고 해당 HTTPS 호스트 하나에만 권한을 부여합니다. Node.js 22+가 필요합니다. 주소는 끝 슬래시·경로·사용자정보 없이 HTTPS origin만 받습니다. 실제 주소는 공개 파일에 적지 말고 로컬 환경변수로 전달하세요.

```sh
# 아래는 예약된 합성 예시입니다. 허가된 격리 개발 서버의 값으로 로컬에서만 설정합니다.
ESSMT_ORIGIN=https://essmt.example.test ESSMT_NAMESPACE=synthetic:naver:team \
  node scripts/build-extension.mjs
```

1. 생성된 `dist/extension/`를 압축해제 확장으로 설치합니다. 기본 모드는 여전히 Mock입니다.
2. 확장 관리 화면에서 실제 확장 ID를 확인해 개발 ESSMT의 `MAIL_OVERLAY_ALLOWED_EXTENSION_ORIGINS`에 `chrome-extension://<확장 ID>`를 정확히 허용합니다. 서버의 namespace와 직원 grant도 별도로 설정해야 합니다. 서버 설정 변경은 #238의 개발 환경 절차를 따릅니다.
3. 같은 브라우저 프로필에서 개발 ESSMT의 기존 로그인 화면으로 직원 본인 비밀번호 로그인을 합니다. 비밀번호·쿠키·인입 토큰을 확장에 입력하지 않습니다.
4. 확장 **옵션**에서 `ESSMT 개발 서버`를 선택합니다. `http://127.0.0.1:4173/` 또는 `http://localhost:4173/`의 기존 데모 계정 A에 실제 API 태그를 표시합니다. 계정 B는 연결하지 않으며, 남은 행이 있어도 `ACCOUNT_NOT_BOUND`로 거부합니다. 데모 자체의 진단 패널과 Mock 오류 선택은 계속 Mock 전용입니다.
5. Mock으로 되돌리면 외부 조회가 중단되고 기존 합성 bridge를 사용합니다. 연결 주소를 바꾸려면 다시 생성하고 확장을 다시 로드합니다. `dist/`는 Git에서 제외되며 공유하거나 커밋하지 않습니다.

Chrome의 압축해제 확장 ID는 경로/공개 key에 영향을 받으므로 설치 경로를 고정하세요. 경로를 옮기거나 Chrome/Edge에서 다시 설치하면 실제 ID를 재확인하고 서버 origin 허용 목록을 맞춥니다. 이 버전은 배포용 key나 스토어 ID를 포함하지 않습니다. 서버의 origin 허용은 직원 인증과 grant를 대체하지 않습니다.

### 요청 및 표시 수명

요청은 Service Worker만 고정된 `/api/browser-overlay/email-tags/lookup`에 JSON POST로 전송합니다. `credentials: include`, `X-ESSMT-Overlay: 1`, `cache: no-store`, redirect 거부, 4.5초 제한을 적용합니다. 서버 namespace는 빌드 설정에서 고정하며 데모의 합성 계정 A와 명시적으로 연결합니다. 페이지가 endpoint·헤더·서버 namespace를 선택하는 bridge는 없습니다. 응답 namespace/전체 결과/태그를 검증한 뒤 데모 context로 정규화합니다. ESSMT 식별자는 int32 범위를 넘으면 요청 전 거부합니다. Mock은 기존 큰 문자열 ID 동작을 유지합니다.

모드·계정·화면·행 연결이 바뀌면 기존 배지와 대기 응답을 무효화합니다. 태그 응답은 저장하지 않습니다. ESSMT 모드에서 30초마다, 그리고 탭이 다시 보일 때 기존 배지를 지우고 재조회합니다. 로그아웃·grant 철회는 다음 조회에서 감지합니다. 배경 탭의 브라우저 타이머 제한 때문에 **즉시 또는 엄격한 30초 내 회수를 보장하지 않습니다**. 즉시 확인하려면 데모 새로고침 버튼을 누르세요. 이미 서버 인증을 통과한 진행 중 요청은 서버가 회수하지 않습니다. 합성 계정 전환은 ESSMT 직원 계정 전환과 별개입니다.

Chrome의 [확장 네트워크 요청](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests) 및 [쿠키 정책](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies)에 따라 host permission과 같은 프로필의 로그인 세션을 함께 사용합니다. 추가 `cookies` 권한은 없습니다. 직원 브라우저의 타사 쿠키 차단·정책에 따라 실패할 수 있으므로 개별 환경에서 확인해야 합니다. HTTP 허용이나 인증 완화로 우회하지 않습니다.

### 오류 확인

메일 행의 `data-essmt-state="error"` 및 `data-essmt-error`에서 확인합니다. 오류이면 이전 태그는 제거하며 메일 조작은 유지합니다.

| 코드 | 의미/조치 |
|---|---|
| `HTTP_401` | 같은 프로필에서 직원 비밀번호 재로그인 후 새로고침 |
| `HTTP_403` | 직원 grant, 서버 namespace, 확장 origin, 계정 상태 확인 |
| `HTTP_422` | 서버 요청 계약 불일치 |
| `HTTP_500`, `HTTP_503` 등 | 서버 오류 또는 API 비활성; 상태값을 보존 |
| `NOT_CONFIGURED` | 연결 설정이 없는 소스 확장; 로컬 생성 필요 |
| `ACCOUNT_NOT_BOUND` | 합성 계정 A 외 context; 서버로 전송하지 않음 |
| `INVALID_REQUEST`, `INVALID_SENDER` | 허용하지 않은 입력·호출자; 서버로 전송하지 않음 |
| `NETWORK_ERROR`, `NETWORK_TIMEOUT` | 네트워크·TLS·redirect·권한·쿠키 정책 또는 시간 초과 확인 |
| `INVALID_RESPONSE` | 서버 namespace/스키마/결과 검증 실패 |

Mock의 `UNAUTHORIZED`, `FORBIDDEN`, `SERVER_ERROR`, `OFFLINE`, `TIMEOUT`, `BRIDGE_TIMEOUT`과 실제 HTTP/네트워크 오류를 구분합니다. 서버 오류 본문은 페이지나 로그에 전달하지 않습니다.

### 자동 검증

```sh
npm ci
npm test
npx playwright install chromium
npm run test:e2e
```

브라우저 검증에는 임시 자체서명 HTTPS 인증서를 만드는 OpenSSL이 필요합니다. 테스트에서만 인증서 검증을 무시하며 제품 코드는 HTTPS 검증을 유지합니다. `essmt.spec.js`는 실제 MV3 worker·HTTPS·Secure/HttpOnly/SameSite=Lax 합성 쿠키를 사용합니다. 이 테스트만으로 ESSMT 직원 인증 성공을 주장하지 않습니다.

`essmt-live.spec.js`는 격리된 실제 ESSMT 서버가 있을 때만 실행하며 일반 실행에서는 명시적으로 skip합니다. #238의 합성 101(태그 `합성 HTTP 태그`), 102(빈 태그), 103(미매칭), 104(모호함) 데이터를 사용하세요. 로컬 환경변수 `ESSMT_TEST_ORIGIN`(HTTPS), `ESSMT_TEST_NAMESPACE`, `ESSMT_TEST_FULL_NAME`, `ESSMT_TEST_PASSWORD`를 설정해 `npm run test:e2e -- tests/e2e/essmt-live.spec.js`로 실행합니다. 실제 운영 서버/계정에는 실행하지 않습니다. 선택적으로 `ESSMT_TEST_UNGRANTED_NAME`은 같은 합성 비밀번호를 가진 무권한 직원을 검증합니다. 테스트용 공개 DER key(base64)를 `ESSMT_TEST_EXTENSION_KEY`로 주면 임시 확장 ID를 고정할 수 있습니다. 서버에서 해당 ID를 허용해야 합니다. 로그인 trace/screenshot/video를 저장하지 않습니다.

데모 경로의 실행 근거는 [통합 검증 기록](../docs/research/essmt-integration-validation.md)을 참고하세요.

## 네이버 + 개발 ESSMT 빌드 (#9)

| 설치 경로 | 대상 | 조회 |
|---|---|---|
| `extension/` | localhost 합성 데모 | Mock |
| `npm run build:experimental-naver` 출력 | 네이버 받은메일함 및 localhost 데모 | 로컬 Mock |
| `dist/naver-essmt/` | 네이버 받은메일함 | 기본 로컬 Mock, 옵션과 목록 확인 후 ESSMT |

`dist/extension/`을 생성하는 #7 데모 ESSMT 명령도 계속 사용할 수 있습니다.

아래 예시는 예약된 주소와 합성 namespace를 사용합니다. 승인된 격리 개발 서버의 HTTPS origin과 단일 namespace를 로컬 환경변수로 전달합니다. 하나의 네이버 테스트 계정만 사용하는 전용 브라우저 프로필을 준비하고, 서버 데이터셋이 그 계정에서 온 것인지 확인한 뒤 빌드합니다.

```powershell
$env:ESSMT_ORIGIN = 'https://essmt.example.test'
$env:ESSMT_NAMESPACE = 'synthetic:naver:team'
$env:ESSMT_NAVER_PROFILE_CONFIRMED = '1'
npm run build:naver-essmt
```

1. 전용 프로필에 `dist/naver-essmt/`를 압축해제 확장으로 로드합니다. 기본 Mock이나 기존 실험용 확장과 같은 네이버 탭에서 함께 실행하지 않습니다.
2. 이 빌드의 실제 확장 ID를 개발 ESSMT의 허용 origin에 추가하고, 서버 namespace와 직원 grant를 확인합니다. 기존 데모 확장의 ID를 재사용하지 않습니다.
3. 같은 전용 프로필에서 개발 ESSMT에 테스트 직원 비밀번호로 로그인합니다. 이 창에는 대상 네이버 받은메일함 탭을 하나만 열어 둡니다.
4. 확장 옵션에서 ESSMT를 선택한 후, 현재 네이버 계정과 서버 데이터셋이 일치함을 확인하고 **현재 받은메일함과 데이터셋이 일치함을 확인**을 누릅니다. 확인 전에는 태그를 조회하지 않습니다. 페이지 새로고침, 목록 루트 교체, 받은메일함 이탈 또는 모드 전환 뒤에는 다시 확인합니다.
5. 401이면 같은 프로필에서 ESSMT에 다시 로그인합니다. 탭으로 돌아오면 재조회하며, 즉시 다시 시도하려면 옵션에서 받은메일함 확인을 다시 누릅니다. 네이버 계정 전환 전에 Mock으로 전환하거나 확장을 비활성화합니다.

Worker는 확장 ID, 최상위 Naver 문서, Chromium이 제공하는 현재 받은메일함 경로 및 옵션에서 확인한 문서 ID를 검사합니다. 브라우저 세션 저장소에는 문서 ID만 남습니다. URL·namespace·헤더는 신뢰된 빌드에서 결정합니다. 고정 namespace와 함께 전송하는 메일 데이터는 SN과 선택적 folder SN뿐입니다. 서버는 확장 origin, 직원 세션, grant, namespace를 각각 검사합니다. `folderSN`은 중복 해소에 쓰지 않습니다. 배지는 DOM에 표시되므로 해당 페이지의 스크립트에서도 읽을 수 있습니다.

네이버 계정과 ESSMT 데이터셋의 대응은 운영자가 확인합니다. 현재 DOM 계약에는 신뢰할 수 있는 계정 식별자가 없으므로, 동일 문서·동일 목록에서 계정이 바뀌는 경우 자동 감지할 수 없습니다. 운영 연결 전에는 신뢰 가능한 계정 식별/검증과 승인된 테스트 데이터 대응을 확인해야 합니다. 상세 결과는 [#9 검증 기록](../docs/research/naver-essmt-validation.md)을 참고하세요.
