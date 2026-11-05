# ESSMT Mail Overlay: 데모용 MV3 확장

로그인 없는 합성 메일 데모에서만 사용하는 독립 Chromium 확장입니다. 기존 ESSMT 수집 확장과 연결되지 않습니다. 빌드 없이 이 폴더를 그대로 설치합니다. Chrome/Edge 공통 Manifest V3 구조이며 운영 API·인증·스토리지·service worker·외부 라이브러리가 없습니다.

## Chrome / Edge 설치 및 실행

1. 저장소 루트에서 `python3 -m http.server 4173 --bind 127.0.0.1 --directory demo` 또는 `npm run demo`를 실행합니다.
2. Chrome은 `chrome://extensions`, Edge는 `edge://extensions`에서 **개발자 모드**를 켭니다.
3. **압축해제된 확장 프로그램을 로드합니다**를 눌러 이 `extension/` 폴더(manifest.json이 직접 들어 있는 폴더)를 선택합니다. 저장소 루트나 demo 폴더를 선택하지 않습니다. WSL 저장소를 Windows 브라우저에서 열 경우 탐색기의 해당 WSL 배포판에서 `home/jeong/essmt-mail-overlay/extension`을 찾거나 이 폴더 전체를 Windows 폴더로 복사합니다.
4. <http://127.0.0.1:4173/>를 엽니다. 이미 열린 데모는 새로고침합니다. 기본 목록의 합성 메일 하나(101)에 `합성 분류 가`, `합성 분류 나`가 표시됩니다.
5. 코드 변경 후 확장 관리 화면의 **새로고침**을 누르고 데모 탭도 새로고침합니다. 중지는 확장을 비활성화/삭제하고 탭을 새로고침합니다.

허용 페이지는 HTTP `127.0.0.1`/`localhost`뿐입니다(Chromium match pattern 특성상 모든 포트). 실제로는 `#demo-root`의 ready/namespace/generation 계약과 `.mail_list`가 있는 합성 데모만 처리합니다. 네이버 및 운영 ESSMT 호스트에는 주입하지 않습니다. `file://`와 HTTPS는 지원하지 않습니다. 페이지와 bridge가 같은 origin이어야 합니다.

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

- `manifest.json`: 격리 world content scripts 세 개와 배지 CSS를 순서대로 로드합니다. 추가 권한, 원격 코드, web-accessible resources 없음.
- `identity.js`: 관찰된 상대 경로 `/v2/popup/read/{folderSN}/{mailSN}` 및 단일 `mail-{SN}` 클래스의 엄격한 교차 검사. ID는 문자열로 유지합니다. 데모 참고 구현과 같은 fixture로 테스트하며, 향후 화면 지원은 이 어댑터에서 분리합니다.
- `bridge.js`: 기존 postMessage v1 계약으로 고유 ID를 사용해 요청합니다. source/origin/channel/version/id와 응답 namespace/generation/스키마를 확인합니다. 응답 누락 시 5초 후 `BRIDGE_TIMEOUT`; 취소·성공·실패 시 listener/timer를 정리합니다. bridge는 공개 합성 데이터 통신이며 인증 경계가 아닙니다.
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

실제 네이버 메일의 다른 URL·화면·계정 식별·virtualized DOM·스레드·상세 지원과 호환성은 검증하지 않았습니다. 운영 화면에서의 좁은 너비, 말줄임, 첨부/답장/전달 아이콘, 확대/축소, 접근성 및 배지 수가 많을 때의 가독성은 이슈 #3에서 확인해야 합니다. 관찰된 URL 외 패턴을 추측하여 지원하지 않습니다. 현재 CSS는 데모에서만 검증했으며, 운영 호스트를 manifest에 추가하는 것만으로 지원이 완료되지 않습니다.

운영 DB와의 ID 연결, 인증·권한·API, 실제 네트워크 실패, 운영 배포/스토어 등록은 별도 작업입니다. 401/403/offline 등의 테스트는 기존 Mock의 합성 실패입니다. 영구 캐시/태그 편집/메일 수집 기능은 없습니다.
