# 네이버 웹메일 목록 DOM 관찰

이 문서는 선행 조사 기록이다. 이후 이슈 #3 작업의 접근 결과와 실제/합성 검증 구분은 [호환성 검증 기록](naver-compatibility-validation.md)을 참고한다.

관찰일: **2026-11-05 UTC**. 이 문서는 기존 로그인 세션의 목록 DOM을 읽은 관찰 기록이다. 확장 구현·운영 API·전체 화면 호환성 검증은 아직 없다. 예시 데이터는 [데모 입력 계약](demo-input-contract.md)과 [합성 fixture](../../demo/fixtures/mails.json)에만 새로 작성했다.

## 관찰 범위와 방법

- `mail.naver.com`의 기존 열린 메일 탭 하나, 받은메일함 `/v2/folders/0/all` 화면만 관찰했다. 전체메일·보낸메일·검색·페이지 이동·상세·팝업·스레드 화면은 조사하지 않았다.
- 기존 개발 환경 연결을 통해 Puppeteer CDP를 사용했다. `defaultViewport: null`로 기존 viewport를 유지하고, 첫 관찰은 `Page.createIsolatedWorld`로 만든 격리 실행 컨텍스트에서 DOM만 `Runtime.evaluate`로 읽었다. 두 번째 스냅샷도 DOM만 읽었으며 `page.evaluate`의 기본 실행 컨텍스트를 사용했다. 연결은 조사 후 detach/disconnect했다. 격리 컨텍스트도 같은 DOM을 읽으므로 DOM에 민감한 값이 없다는 뜻은 아니다.
- 클릭·스크롤·탐색·새로고침·fetch·API 호출·스토리지·쿠키·네트워크 payload 접근은 하지 않았다. 이 작업에서 `/json/list`를 호출하지 않았다.
- 원본 DOM 덤프·화면 캡처를 보관하거나 공개하지 않았다. 실제 제목·발신자·시각·메일 serial·href 값, `title`/`aria-label` 값, 요소 `id` 값은 이 문서에 포함하지 않는다. 운영 DB와의 신규 매칭 검증도 하지 않았다.

아래는 같은 범위의 집계만 재현하기 위한 **의사 절차**다. 실행 스크립트가 아니며 브라우저 조작이나 추가 화면 접근을 지시하지 않는다.

```text
기존 연결에서 열린 탭의 origin/path만 확인 → 대상 탭 하나를 선택
viewport 변경 없이 격리 world 생성 → 해당 context에서 DOM 집계
rows := .mail_item 요소들
각 row에서 a.mail_title_link[href] 개수와 상대 경로 형식을 검사
경로 /v2/popup/read/{folderSN}/{mailSN}에서 SN을 메모리 안에서만 추출
row의 mail-{mailSN} 클래스와 일치하는지 boolean으로 비교
출력 := 행 수, 링크 수, 고유 SN 수, 경로 일치 수, 클래스 일치 수,
        read 행 수, 읽음 input 체크 수, 선택 input 체크 수,
        선택 label의 aria-checked=false 수
실제 SN·href·텍스트·outerHTML·속성 원문은 출력하지 않음
평가 종료 → context/session detach → 클라이언트 disconnect
```

재현 시에도 이미 허용된 세션과 범위를 먼저 확인해야 한다. 이 절차는 관찰 당시 수행 범위의 설명이며 수집 확장이나 내부 API에 대한 건강 진단 절차가 아니다.

## 확인된 식별 단서

| 집계/단서 | 관찰 결과 | 해석 한계 |
| --- | --- | --- |
| `.mail_item` | 80행 | 한 화면의 현재 DOM 개수 |
| `a.mail_title_link[href]` | 80개 | 각 관찰 행에 링크 존재 |
| 추출 SN | 80개 고유 값 | 이 화면 내부만의 유일성 |
| 링크 경로 | 80개 모두 `/v2/popup/read/{folderSN}/{mailSN}` | href 관찰이며 실제 클릭 결과 미확인 |
| 행 클래스 | 80개 모두 `mail-{mailSN}`과 href SN 일치 | 클래스 단독 추출은 미검증 |

`target` 속성은 없었다. 경로에 `popup`이 있다는 이유만으로 클릭 핸들러가 새 창을 연다고 결론 내릴 수 없다. `/v2/read/{folderSN}/{mailSN}`는 [기존 설계 조사](../RESEARCH.md)의 원문 링크 형식이며, 이번 화면에서 관찰한 경로가 아니다. 계정 간·폴더 간·이동/복사 후 SN 안정성은 확인하지 않았다.

**제안:** 제목 링크의 경로를 식별 근거로 삼고 행 클래스는 일치 검증에 사용한다. 링크가 없거나 비정상인 경우, 링크와 클래스가 충돌하는 경우에는 식별 불가로 처리해 태그를 붙이지 않는다. 제목·위치·`threadId`로 추정하지 않는다. 클래스만 사용하는 fallback은 별도 검증이 필요한 후보다.

## 관찰된 계층과 행 구조

```text
div.wrap
├─ header.header
└─ div.container
   └─ div.contents
      ├─ .smart_channel
      ├─ .contents_header
      ├─ .mail_toolbar
      └─ div.contents_area.is_normal
         └─ div.mail_list_wrap
            └─ ul.mail_list.single_line.font_small
               └─ li.mail_item.mail-{mailSN}[draggable]
                  └─ div.mail
                     ├─ div.button_checkbox_wrap
                     │  ├─ input.button_checkbox.blind[type=checkbox][readonly]
                     │  └─ label[role=checkbox][tabindex][aria-checked][aria-label][draggable]
                     ├─ div.toggle_bookmark_wrap
                     │  ├─ input.toggle_bookmark.blind[readonly]
                     │  └─ label[role][aria-pressed][aria-label][title][tabindex]
                     ├─ div.mail_sender
                     │  ├─ .toggle_read_wrap > input.toggle_read[type=checkbox][readonly] + label
                     │  ├─ button.button_sender[title]
                     │  ├─ span.mail_date
                     │  └─ span.mail_volume
                     ├─ div.mail_inner > div.mail_title
                     │  ├─ a.mail_title_link > span.blind + span.text
                     │  ├─ em.icon_attachments (있을 때)
                     │  ├─ button.button_preview
                     │  └─ button.button_popup
                     ├─ div.mail_date_wrap > span.mail_date
                     └─ span.mail_volume
```

답장/전달 관련 `svg_replied_mail`, `svg_forwarding_mail` 클래스도 관찰했다. 아이콘 에셋은 복사하지 않았다. 선택 label의 `id` 속성 이름만 확인하고 값은 수집하지 않았다. 위 트리는 관찰한 구조의 요약이며 전체 DOM 복제본이 아니다.

## 상태와 시간에 따른 차이

첫 수동 조작 없는 스냅샷에서는 `read` 클래스가 79/80행, 두 번째에서는 80/80행이었다. 두 번째의 `input.toggle_read` 체크도 80/80이었다. 선택 input은 0/80 체크, 선택 label은 80/80 `aria-checked=false`였다. 선택된 행이 없었으므로 선택 클래스는 알 수 없다.

두 스냅샷 사이 읽음 개수가 달라진 원인은 모른다. 다른 사용자/세션이나 앱 동작 가능성이 있으며, 조사 행위가 읽음을 바꿨다고 주장하지 않는다. 두 시점의 ID·행 순서를 비교하지 않았고 SPA 전환·가상화·노드 재사용·재정렬도 검증하지 않았다.

## 배지 위치 후보와 레이아웃 한계

기존 viewport는 800×457이었다. 첫 측정값은 다음과 같다.

| 요소 | 측정 |
| --- | --- |
| `.mail_item` | 높이 39px, 너비 708px |
| `.mail_title` | flex, 너비 236px, 높이 21px, overflow hidden |
| `.mail_title_link` | block, 너비 198px, 높이 21px, 글자 16px/행높이 21px, nowrap/hidden/ellipsis |
| `.mail_list` | 너비 773px, 높이 219px, 좌우 padding 25px, overflow hidden auto |
| 글꼴 | 맑은 고딕 및 시스템 한국어 sans fallback |

단일 viewport와 내용에 따른 측정값이며 반응형 규격으로 사용할 수 없다. 배지는 `.mail_title` 안에서 제목 링크 뒤에 **확장 소유 형제 컨테이너**로 두거나 `.mail_inner` 아래 인접 컨테이너에 두는 안을 검토할 수 있다. 링크·체크박스·label·버튼 내부는 후보에서 제외한다. 실제 삽입은 하지 않았으며 말줄임·첨부/답장/전달 아이콘 충돌·행 높이·접근성·좁은 화면 영향은 미검증이다. 안전한 삽입 위치가 검증됐다는 뜻이 아니다.

## 남은 검증

목록 이외 화면, 화면 전환/스크롤/페이지 이동, 노드 재사용과 늦은 응답, 중복 행, 여러 폴더/계정, 식별자와 DB 연결, 실제 배지 삽입과 기본 UI 동작을 별도 검증해야 한다. [오프라인 데모 계약](demo-input-contract.md)은 이 중 일부를 합성 시나리오로 먼저 다루기 위한 입력 자료이며 실제 네이버 동작의 증거가 아니다.
