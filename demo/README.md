# 로그인 없는 메일 데모

이슈 #1의 합성 테스트 환경입니다. 메일 목록과 Mock 조회만 구현하며, **메일 행에 ESSMT 배지를 삽입하지 않습니다.** 조회한 태그는 목록 밖의 진단 패널에서만 확인합니다. 이슈 #2의 확장이 실제 배지 삽입을 담당합니다. 네이버 공식 UI나 실제 메일 호환성 검증물이 아닙니다.

## 실행

저장소 루트에서 Python 3만으로 실행할 수 있습니다. 설치·빌드·로그인은 필요하지 않습니다.

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory demo
```

브라우저에서 <http://127.0.0.1:4173/>를 엽니다. Node/npm이 있으면 `npm run demo`도 같은 명령입니다. 중지는 Ctrl+C입니다. `file://`로 직접 열면 JSON fetch와 ES module의 브라우저 보안 규칙 때문에 동작하지 않습니다.

`demo/` 폴더 전체를 정적 호스팅해도 됩니다. 외부 JS, 폰트, 이미지, 운영 API를 불러오지 않습니다. HTTP 서버는 파일만 제공하며 별도 애플리케이션 백엔드는 없습니다. 여기서 '오프라인'은 인터넷 없이 로컬 파일 서버만으로 실행 가능하다는 의미입니다.

## 화면에서 확인하기

- 전체메일·받은메일함·보낸메일함, 제목/발신자 검색, 페이지당 2/5/10행, 이전/다음 페이지, 새로고침.
- 선택 체크박스, 중요 표시, 읽음 전환은 현재 렌더링 수명 동안만 유지됩니다. 메모리 전용이며 새로고침/화면 전환 시 fixture 상태로 돌아갑니다.
- 제목 클릭은 합성 상세 화면을 엽니다. `/v2/popup/read/...`는 ID 추출용 단서이며 네이버로 이동하지 않습니다. 실제 본문·첨부·새 팝업 창은 없습니다.
- 시나리오 선택: 정상 101, 태그 없음 102, 미매칭 103, 다중 매칭 104, 중복 DOM 105, 식별 불가 3행, HTML 형태 제목 106, 합성 대화 101+102, 행 재사용 101↔102.
- `행 재사용` 시나리오에서 버튼을 누르면 **같은 li 객체**의 클래스·링크·내용이 101↔102로 바뀝니다. 하위 노드는 교체하므로 이전 확장 배지도 사라집니다.
- Mock 응답은 정상(80ms), 지연(1800ms), 401, 403, 500, offline, timeout(1200ms) 중 선택합니다. 오류는 태그 조회에만 적용하므로 메일 조작은 계속 가능합니다. 정상으로 바꾼 뒤 조회 버튼으로 재시도합니다.
- 계정 A는 기존 fixture, 계정 B는 메일·태그 사전이 비어 있는 별도 합성 계정입니다. 계정 B의 같은 SN 조회는 `unmatched`입니다.
- 초기화는 기본 계정/목록/검색/페이지/응답 모드를 복구하고 대기 중인 진단/bridge 요청과 이전 DOM 수명을 무효화합니다. 캐시·영구 저장은 없습니다.

## Mock API v1

**HTTP endpoint는 없습니다.** `src/mock-api.js`의 `createMockApi({ mails, tags })`가 비동기 adapter를 반환합니다. 브라우저 콘솔에서는 페이지 준비 후 `window.essmtDemo.api`와 `window.essmtDemo.getContext()`를 사용할 수 있습니다. fixture JSON은 시작할 때 동일 origin에서만 읽습니다.

### 목록 조회

```js
await window.essmtDemo.api.listMails({
  namespace: 'demo:naver:account-a',
  folder: 'all',       // all | inbox (folder 0 및 식별 불가) | sent (folder 1)
  query: '',          // 제목/발신자 부분 일치, trim, 대소문자 무시, 최대 500자
  scenario: 'all',    // all | normal | no-tags | unmatched | ambiguous |
                      // duplicate | unidentified | safe-title | thread | reuse
  page: 1,            // 1부터 시작하는 정수; 끝을 넘으면 마지막 페이지
  page_size: 10       // 1~100 정수
});
// { schema_version: 1, namespace, folder, query, scenario, page, page_size,
//   total, total_pages, rows: [{row_id, link_path, class_mail_sn, title, sender, read}] }
```

빈 결과는 `rows: [], total: 0, total_pages: 1, page: 1`입니다. 순서는 fixture 순서입니다. 폴더·시나리오·검색은 교집합으로 적용합니다. 중복 SN 행은 목록에서 유지합니다. `reuse` adapter 입력은 최초 101이며 102 전환은 UI가 수행합니다. 누락된 필드는 위 기본값을 사용합니다.

### 일괄 태그 조회

```js
await window.essmtDemo.api.lookupTags({
  namespace: 'demo:naver:account-a',
  messages: [
    { mail_sn: '101', folder_sn: '0' },
    { mail_sn: '102', folder_sn: '0' },
    { mail_sn: '103', folder_sn: '0' },
    { mail_sn: '104', folder_sn: '0' }
  ]
}, { fault: 'normal' });
```

```json
{
  "schema_version": 1,
  "namespace": "demo:naver:account-a",
  "results": [
    {"mail_sn":"101","status":"matched","candidate_count":1,"tags":[{"id":"tag-1","name":"합성 분류 가"},{"id":"tag-2","name":"합성 분류 나"}]},
    {"mail_sn":"102","status":"matched","candidate_count":1,"tags":[]},
    {"mail_sn":"103","status":"unmatched","candidate_count":0,"tags":[]},
    {"mail_sn":"104","status":"ambiguous","candidate_count":2,"tags":[]}
  ]
}
```

- 요청당 최대 100개 입력. 빈 배열도 허용합니다. 중복 SN은 첫 등장 순서로 한 번만 반환합니다. 동일 SN의 folder가 달라도 키는 `(namespace, mail_sn)`입니다.
- `mail_sn`은 `/^[1-9]\d*$/`, `folder_sn`은 `/^(0|[1-9]\d*)$/`의 **문자열**입니다. 숫자로 변환하지 않습니다. folder는 필수 표시 컨텍스트이며 조회 키와 독립적입니다.
- namespace는 `demo:naver:account-a`, `demo:naver:account-b`만 지원합니다. 누락/비정상 요청은 `MockError {code:'INVALID_REQUEST',status:400,message}`로 reject합니다.
- 알 수 없는 정상 형식의 SN은 `unmatched`. `matched` 빈 태그와 구분합니다. `ambiguous`는 후보 태그를 합치거나 우선 선택하지 않습니다.
- 호출 시 입력과 설정을 캡처합니다. 반환 객체를 바꿔도 다음 조회와 fixture는 바뀌지 않습니다.
- 옵션: `fault`는 UI와 같은 `normal | slow | 401 | 403 | 500 | offline | timeout`, `delay_ms`는 0~10000(기본 normal 80, slow 1800), `timeout_ms`는 1~10000(기본 1200), `signal`은 AbortSignal입니다. `timeout`은 지정 시간 뒤 실패를 만드는 별도 합성 모드이며 `slow`의 성공을 자동으로 timeout 처리하지 않습니다.
- 오류 매핑: 401→`UNAUTHORIZED`, 403→`FORBIDDEN`, 500→`SERVER_ERROR`, offline→`OFFLINE`/status 0, timeout→`TIMEOUT`/status 0. 취소는 `AbortError`입니다. 실제 HTTP 실패나 브라우저 네트워크 차단을 만들지 않습니다.
- **직접 adapter 호출은 페이지의 Mock 선택값을 자동 사용하지 않고 기본 normal로 실행합니다.** UI/bridge가 현재 선택값을 옵션으로 전달합니다. 직접 호출자는 수명 확인·취소를 직접 담당합니다.

## 이슈 #2: DOM 계약

```text
#demo-root[data-demo-namespace][data-demo-generation][data-demo-ready]
  .contents_area > .mail_list_wrap
    ul.mail_list.single_line.font_small[data-demo-namespace][data-demo-generation]
      li.mail_item.mail-{SN}[data-demo-row][data-demo-generation]
        div.mail
          .button_checkbox_wrap > input.button_checkbox
          .toggle_bookmark_wrap > button.toggle_bookmark
          .mail_sender > .toggle_read_wrap + button.button_sender
          .mail_inner > .mail_title > a.mail_title_link[href] > span.text
          .mail_date_wrap > span.mail_date
```

DOM 계층과 제목 링크·클래스는 관찰 문서/기존 fragment를 참고했으며, 체크박스는 접근성을 위해 네이티브 input을 사용합니다. 원본 네이버의 전체 HTML·자산·readonly/label 제어 체계를 복제하지 않습니다.

1. `.mail_item`당 `a.mail_title_link`가 정확히 하나이고 href가 `/v2/popup/read/{folderSN}/{mailSN}`에 정확히 일치하는지 검사합니다. `mail-*` 클래스도 정확히 하나이고 SN이 같아야 합니다. `src/identity.js`는 이 규칙의 참고 구현입니다.
2. 링크 누락, 비숫자/선행 0, 링크107·클래스108 충돌 시 **조회하지 않습니다**. 제목·발신자·행 순서·스레드로 추정하거나 클래스 단독 fallback을 적용하지 않습니다.
3. 확장 배지 컨테이너는 `.mail_title`의 **제목 링크 뒤 형제**로 삽입합니다. 링크 안이나 체크박스/버튼 안에 삽입하지 않습니다. 예를 들어 확장 소유의 `[data-essmt-tags]`를 행마다 하나만 관리합니다. 데모는 이 컨테이너를 만들지 않습니다.
4. `data-demo-row`는 합성 행 테스트 ID입니다. 메일 ID가 아니며 중복105 두 행은 독립적인 DOM 대상입니다. `data-demo-generation`과 namespace도 **데모 전용 보조 계약**이고 실제 네이버에 있는 속성이 아닙니다.
5. 시작 중/전환 중 root의 `data-demo-ready`는 false입니다. `essmt-demo:contextchange`에서 이전 작업·배지·캐시를 무효화하고 `essmt-demo:ready` 또는 DOM 준비를 관찰한 뒤 현재 행을 수집합니다. 두 이벤트는 window에 발행됩니다. 초기 ready 이벤트를 놓쳤으면 root 속성을 읽습니다.
6. 검색·페이지·폴더·상세·계정·새로고침·reset·노드 재바인딩·오류모드 변경 때 generation이 증가합니다. **응답 적용 직전 namespace + generation + 현재 추출 SN + row.isConnected를 다시 검사**합니다. reset 후에도 generation은 0으로 되돌아가지 않습니다.
7. 상세는 `#detail[data-demo-mail-sn][data-demo-folder-sn][data-demo-generation]`이라는 별도 합성 DOM이며 목록 adapter와 분리합니다. 실제 네이버 상세/popup 호환성에 관한 근거가 아닙니다. `thread`도 목록의 각 메시지를 유지하는 합성 안내이며 스레드 키를 만들지 않습니다.

## 이슈 #2: 격리된 content script에서 호출

content script의 격리 world에서는 `window.essmtDemo`가 보이지 않을 수 있습니다. 같은 창의 `window.postMessage` bridge를 사용합니다. **운영용 통신/인증 경계가 아니며 합성 데이터 전용입니다.**

요청:

```js
window.postMessage({
  channel: 'essmt-demo:request', version: 1,
  id: crypto.randomUUID(), // 비어 있지 않은 100자 이하 문자열, 요청마다 고유
  method: 'lookupTags',   // getContext | listMails | lookupTags
  payload: {
    namespace: 'demo:naver:account-a',
    messages: [{ mail_sn: '101', folder_sn: '0' }]
  }
}, location.origin);
```

응답:

```js
// 성공
{ channel: 'essmt-demo:response', version: 1, id, ok: true,
  context: { namespace, generation, ready, folder, scenario, page, query, view, fault },
  result: { schema_version: 1, namespace, results: [...] } }
// 실패
{ channel: 'essmt-demo:response', version: 1, id, ok: false,
  context: { /* 요청 시점 컨텍스트 */ },
  error: { code: 'STALE_CONTEXT', status: 409, message: '...' } }
```

- 응답 listener를 **요청보다 먼저** 등록하고 `event.source === window`, `event.origin === location.origin`, channel/version/id를 확인합니다. 완료/실패/클라이언트 timeout 때 listener를 제거합니다. 기본 slow보다 긴 5초 정도의 클라이언트 timeout을 권장합니다.
- `getContext`는 payload 없이 현재 화면 컨텍스트를 반환합니다. `listMails`의 payload는 위 목록 입력입니다. `lookupTags`는 현재 화면과 namespace가 같아야 하며 **현재 UI의 Mock 응답 모드**를 사용합니다.
- 화면 전환 도중은 `NOT_READY`/409, 대기 중 화면 수명이 바뀌면 `STALE_CONTEXT`/409로 실패합니다. 동시 요청 최대 20개를 넘으면 `BUSY`/429입니다. 잘못된 버전/method/payload는 `INVALID_REQUEST`/400. 잘못된 source/origin/channel 또는 유효하지 않은 id는 응답하지 않습니다.
- stale 응답은 호출 당시 context를 포함하며 클라이언트도 반드시 현재 root/행과 재비교해야 합니다. Mock 성공 응답 수신 이후 DOM이 바뀔 수 있기 때문입니다.
- bridge에는 HTTP 경로, 인증 토큰, 저장소나 운영 서버 주소가 없습니다. 원한다면 확장 service worker에 `createMockApi`와 fixture를 별도로 번들링해도 되지만 그 경우 UI 오류 선택값과 별도 설정 동기화가 필요합니다.

## 테스트

테스트에만 Node.js 22+ 및 npm 의존성이 필요합니다.

```sh
npm ci
npm test
npx playwright install chromium
npm run test:e2e
```

Linux에서 브라우저 시스템 라이브러리가 없다면 `npx playwright install --with-deps chromium`으로 설치합니다. E2E는 임시 로컬 정적 서버를 자동 실행합니다. 4173 포트를 쓰는 다른 서버가 있으면 중지 후 실행합니다. 테스트 결과/trace는 git에서 제외됩니다.

Node 테스트는 fixture 참조·식별·목록·배치·상태·계정 격리·오류·취소를, Chromium 테스트는 실제 DOM·검색·페이지·기본 제어·상세·bridge·행 재사용·지연 중 전환을 검증합니다. 실제 네이버 메일, 실제 확장 설치, ESSMT 운영 API는 이슈 #1의 검증 대상이 아닙니다.
