# 오프라인 데모 입력 계약

이 문서는 합성 fixture와 시험 시나리오의 입력 계약이다. 이슈 #1에서 정적 데모·비동기 Mock adapter가 구현되었으며 실행/연동 계약은 [demo/README.md](../../demo/README.md)에 정리했다. 확장과 운영 API는 아직 구현하지 않았고 이 문서가 운영 API 계약을 확정하지 않는다. [DOM 관찰](naver-webmail-dom.md)에서 확인된 것은 한 목록 화면의 링크 경로와 클래스뿐이다. 아래 화면·전환·실패 상태는 새로 만든 합성 시험 요구사항이다.

## 파일과 데이터 경계

- [mails.json](../../demo/fixtures/mails.json): 합성 메시지별 모의 조회 결과와 DOM 행 입력.
- [tags.json](../../demo/fixtures/tags.json): 합성 태그 사전.
- [mail-list.fragment.html](../../demo/fixtures/mail-list.fragment.html): 위 행 입력과 대응하는 최소 HTML 골격. 실행 JavaScript·외부 리소스·실제 메일을 포함하지 않는다. 렌더러나 완성된 네이버 UI 복제물이 아니다.

제목·표시 이름·ID는 전부 새로 지었다. 실제 날짜·고객명·계정·운영 serial은 없다. fixture의 상대 popup 경로도 발명한 작은 ID만 사용한다. 네이버 URL로 열거나 실제 네트워크 조회를 수행하는 용도가 아니다. fragment는 오프라인 parser 입력으로 취급한다.

## 키와 스키마

메시지 키는 `(namespace, mail_sn)`이다. namespace는 공급자와 계정 범위를 데모가 구분하는 불투명 문자열이고 fixture에서는 `demo:naver:account-a`다. `folder_sn`은 현재 표시 컨텍스트로 키와 독립적으로 전달한다. 운영 계정 namespace를 어떤 방식으로 확정할지는 별도 설계다.

| 파일/필드 | 타입·규칙 |
| --- | --- |
| 공통 `schema_version` | 정수 `1`; 이 fixture 형식의 버전 |
| 공통 `namespace` | 비어 있지 않은 문자열; 두 JSON 파일에서 동일 |
| mails `messages[]` | namespace 안에서 `mail_sn` 유일; 모의 조회 데이터 |
| `mail_sn` | `101`, `102`처럼 0으로 시작하지 않는 양의 숫자 **문자열** |
| `title` | 합성 표시 문자열; 항상 text로 렌더링 |
| `status` | `matched` / `unmatched` / `ambiguous` |
| `tag_ids` | 태그 사전 참조 배열; matched에서만 허용, 중복 없음 |
| `candidate_count` | matched=1, unmatched=0, ambiguous≥2 |
| mails `dom_rows[]` | `row_id` 유일; 메시지 키는 여러 행에 반복 가능 |
| `link_path` | 상대 경로 문자열 또는 null; 식별 경로 입력 |
| `class_mail_sn` | 행 `mail-*` 클래스의 접미사 문자열 또는 null |
| `expected_mail_sn` | 유효하고 상호 일치할 때 SN, 그 외 null |
| `expected_status` | 조회 상태 또는 `unidentified` |
| tags `tags[]` | `id` 유일 문자열, `name` 비어 있지 않은 표시 문자열 |

SN을 문자열로 정한 것은 정밀도 손실을 피하기 위한 **데모 계약의 선택**이다. 실제 네이버 API의 타입이나 최대 길이를 보증하지 않는다. 기존 [아키텍처 초안](../ARCHITECTURE.md)의 숫자형 예시는 과거 API 제안이며 이번 문자열 계약으로 운영 API를 바꾼 것이 아니다.

미래 모의 요청은 namespace와 messages의 `mail_sn`, 독립 `folder_sn`을 일괄 전달하고 응답도 namespace와 `mail_sn`별 결과를 돌려주는 형태로 작성한다. 제목·행 위치·threadId는 조회 키가 아니다. 실제 인증 방식·endpoint·정책은 이 fixture로 정하지 않는다.

## 결과의 의미와 표시 기준

| 상태 | 의미 | 데모 기대 결과 |
| --- | --- | --- |
| matched + 태그 | 정확한 단일 매칭 | 해당 태그만 표시 |
| matched + 빈 배열 | 정확한 단일 매칭, 태그 없음 | 정상적인 빈 결과로 처리 |
| unmatched | 식별은 됐으나 모의 저장소에 매칭 없음 | 미매칭 상태; 태그 없음과 내부적으로 구별 |
| ambiguous | 같은 키에 저장소 후보 여러 개 | 자동 병합/우선 선택 없이 태그 보류 |
| unidentified | 링크 누락·형식 오류·클래스 충돌 | 조회하지 않고 기존 배지 제거/미표시 |

ambiguous fixture의 `tag_ids=[]`는 후보들에 태그가 없다는 뜻이 아니다. 후보별 업무 데이터는 제공하지 않으며 정책 미결정 상태에서 노출을 보류한다. DOM에 같은 키가 두 번 있는 것은 저장소 후보 다중 매칭과 다른 현상이다. `105`의 두 DOM 행에는 동일한 정상 결과를 각각 한 번씩 표시한다.

누락/비정상/충돌 ID에 제목·발신자·행 순서·`threadId` fallback을 적용하지 않는다. 클래스 단독 추출도 이 데모에서는 허용하지 않는다. title 안의 `<em>` 같은 문자열은 텍스트여야 하며 HTML로 해석하지 않는다.

## 합성 시나리오와 기대 결과

`demo:*` 이름은 데모 소유 화면 이름이며 실제 네이버 route를 발명한 것이 아니다. 아래 실제 화면을 조사했다는 뜻도 아니다. 이슈 #1의 실행기는 목록·검색·페이지·합성 상세·대화 안내·노드 재사용·계정 전환·오류/지연/초기화를 제공한다. 새 팝업 창과 실제 가상 스크롤, 확장 배지의 표시·제거는 구현 범위 밖이며 아래 표의 관련 기대 결과는 후속 확장 시험 요구사항이다.

| 시나리오 | 입력/변화 | 기대 결과·fixture 근거 |
| --- | --- | --- |
| `demo:all` 정상 목록 | 101, 102 | 101에 두 태그, 102는 matched 빈 결과 |
| 미매칭 / 다중 매칭 | 103, 104 | 각각 unmatched / ambiguous로 구분; 태그 보류 |
| 중복 DOM | row-105-a, row-105-b | 105로 조회 중복 제거 가능, 두 행에 같은 태그; 배지는 행마다 한 벌 |
| 안전한 제목 | 106 | `<em>합성</em>`를 문자로 표시; 요소 생성 없음 |
| 식별 불가 | row-missing, row-malformed, row-conflict | null / 비숫자 SN / 링크107·클래스108 충돌; 조회·태그 없음 |
| `demo:inbox`, `demo:sent` | 같은 namespace+105, folder 0→1 | folder 컨텍스트 별도 보존; 메시지 키로 같은 결과 |
| `demo:search` | 101·105를 재정렬/필터 | 제목·위치에 의존하지 않고 같은 태그 |
| `demo:page` | 페이지를 101·102에서 103·104로 교체 | 이전 행 배지 제거, 현재 키에만 결과 적용 |
| `demo:detail`, `demo:popup` | 101 하나를 다른 데모 컨테이너에 표시 | 키가 유효하면 같은 결과; 실제 상세 DOM adapter는 별도 조사 |
| `demo:thread` | 101·102를 하나의 대화로 묶음 | 각 메시지를 별도 식별; 스레드 키로 태그 합치지 않음 |
| 가상화/노드 재사용 | 같은 row node를 101→102로 변경 | 101 배지 제거 후 102의 빈 결과; 늦은 101 응답 무시 |
| route/계정 전환 중 지연 | generation 변경 또는 namespace를 `demo:naver:account-b`로 변경 | 이전 namespace/SN/generation 응답 무시; 다른 계정 결과 재사용 금지 |
| 인증·권한 실패 | 모의 401 / 403 | 각각 인증 필요 / 권한 없음 상태; 태그 미표시, 원본 행 사용 가능 |
| 통신 실패 | 모의 timeout / 500 / offline | 실패 상태를 매칭 상태와 분리; 원본 행 유지, 이전 키 태그 잔류 없음 |
| 재시도·초기화 | 실패→retry→성공, reset | retry는 현재 키만 재조회, reset은 배지/캐시/실패/대기 응답을 무효화 |

지연 응답을 적용하기 직전에 **현재 namespace + 추출 SN + generation**을 다시 확인한다. generation은 모의 화면/행 바인딩 수명 토큰으로, route 전환·reset·노드 재바인딩 때 바뀐다. 행이 문서에서 제거됐는지도 확인한다. 메모리 캐시·응답의 키와 현재 DOM 키가 일치하지 않으면 적용하지 않는다. 여러 namespace를 시험할 때 tags와 메시지 사전도 각각 분리한다.

오류·지연·재시도는 실행기 내부 모의 이벤트로 만들어야 하며 네이버/ESSMT에 실요청을 보내지 않는다. 실제 메일 로그인·계정 데이터·토큰 없이 모든 시나리오를 재현할 수 있어야 한다.

## 오프라인 개발 완료 기준

JSON 파싱과 tag ID 참조, 메시지·행 ID, 상태별 배열/후보 수, fragment의 href/class 일치를 먼저 확인한다. 실행기 구현 시에는 위 시나리오의 결과를 확인하고 배지 중복, 원본 제어 요소 침범, 늦은 응답에 의한 오표시를 검사한다. 이 자료만으로 실제 네이버 DOM의 화면 전환·가상화·배지 위치가 검증됐다고 판단해서는 안 된다.
