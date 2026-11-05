# 사전조사: ESSMT 이메일 수집, 식별자, 태그 및 네이버 웹메일

조사 기준: **2026-11-05**. 기존 ESSMT 비공개 저장소 `main`의 커밋 `ea7021503f6374418afe8178ad509d7520da7e3a`에서 코드/문서를 읽어 확인한 내용입니다. 공개 문서에는 운영 계정·인입 토큰·비밀값·고객/메일 데이터를 옮기지 않습니다.

## 1. 이메일 수집 방식과 확장 분리 근거

ESSMT에는 Chromium Manifest V3 기반의 별도 메일 **인입 확장**이 이미 존재합니다. 백그라운드에서 네이버 메일 목록의 새로운 메시지를 주기적으로 감지하고 RFC 822 EML 원본을 수집 서버에 전송합니다. 수집용 확장은 메일 원본 전달과 성공/실패 감시, 커서 관리를 담당합니다.

새 프로젝트의 목표는 반대 방향입니다: **기존 웹메일 화면에 ESSMT가 보유한 메타데이터를 조회하여 렌더링**합니다. 따라서 수집용 확장을 통합·복제할 필요가 없으며, 특히 인입 전용 토큰을 다수 직원 PC에 복제하는 구조를 피해야 합니다.

## 2. 확인된 DB 자료 모델

`emails` 모델에 다음이 있습니다.

| 필드 | 역할 및 주의 |
| --- | --- |
| `id` | ESSMT 이메일 행 PK. 내부 연결/태그 FK의 기준 |
| `message_id` | MIME/RFC Message-ID. 꺾쇠 괄호 정규화 후 저장. 없는 경우 fallback 해시 ID |
| `folder_path` | 인입 시 논리 메일함 경로 |
| `naver_mail_sn` | 네이버 개별 메일 serial, NULL 가능 |
| `naver_folder_sn` | 네이버 웹메일 폴더 serial, NULL 가능 |
| `naver_thread_id` | 네이버 목록의 `threadId` 보조 자료. 개별 메시지 ID 아님 |
| `in_reply_to_message_id`, `reference_message_ids` | RFC 답장·스레드 메타데이터 |

`(message_id, folder_path)`에 유니크 제약이 있습니다. **동일한 실제 메일이 다른 메일함 컨텍스트에 있으면 서로 다른 `emails.id` 행으로 남을 수 있습니다.** `naver_mail_sn`에 조회 인덱스가 있지만 해당 값에 전역 UNIQUE 제약이 있다는 의미는 아닙니다. 실데이터 카디널리티·NULL 비율은 별도 읽기 전용 DB 조회가 필요합니다.

태그:

- `email_tags`: 태그 정의. 주요 컬럼 `id`, `name`, `normalized_name`.
- `email_tag_assignments`: `(email_id, tag_id)` 연결. 하나의 태그를 여러 메일에 재사용할 수 있으며 두 값의 조합은 유니크.
- `app/services/email_tags.py`의 `list_tags_for_emails(session, email_ids)`가 이미 여러 ESSMT 이메일 ID에 대한 태그를 한 번의 쿼리로 로드합니다.
- `app/routers/emails.py`는 HTML 메일 목록·상세와 태그 검색·부착·해제 경로를 구현합니다. 다만 **네이버 `mailSN` 목록을 입력받아 JSON으로 태그를 반환하는 신규 확장 전용 API는 별도로 설계해야 합니다.**
- 태그는 일반 공유 메타데이터입니다. 메일 인입 사건, 자동 판독 결과, 고객·견적·수주 연결 및 처리 완료 상태를 대체하지 않습니다.

## 3. 저장된 네이버 웹메일 식별자

수집 확장은 메일 목록 응답에서 `mailSN`, `folderSN`, `threadId`를 읽어 ESSMT로 보내며, ESSMT는 다음 필드에 기록합니다.

```text
Naver mailSN   → emails.naver_mail_sn
Naver folderSN → emails.naver_folder_sn
Naver threadId → emails.naver_thread_id
```

ESSMT 메일 상세의 '네이버에서 열기' 기능은 다음 원문 URL 형식을 이미 사용합니다.

```text
https://mail.naver.com/v2/read/{folderSN}/{mailSN}
```

`folderSN`이 없으면 전체메일 컨텍스트(-1)를 사용합니다. **ESSMT → 네이버 원문 이동은 구현되어 있으나, 네이버 메일 목록의 모든 개별 행에서 `mailSN`을 읽는 역방향 동작이 보장된 것은 아닙니다.**

## 4. 네이버 내부 목록 API 사전분석

기존 수집 파이프라인의 네트워크 캡처/기술 문서에는 `mail.naver.com`의 내부 API가 다음과 같이 정리되어 있습니다.

| 경로 | 조사에서 확인된 의미 |
| --- | --- |
| `/json/newmail` | 신규 메일 여부 및 마지막 serial |
| `/json/list` | 페이지별 `mailData[]` 목록 (`mailSN`, `folderSN`, 경우에 따라 `threadId`) |
| `/json/read` | 본문·메타데이터·첨부 목록 |
| `/json/read/viewMime` | RFC 822 EML raw 반환 (기존 수집용) |
| `/json/folder/list` | 폴더 ID/트리 조회 |

이 API는 **공식적으로 보장된 확장 API가 아니라 사내 조사 당시 캡처한 비공개 웹 UI 내부 호출**입니다. 동작, 스키마, 쿠키/CSRF 정책은 변경될 수 있습니다. 새 확장의 1차 목표는 메일 본문 수집 없이 **필요한 `mailSN`만 안전하게 얻는 방법**을 검증하는 것입니다. 내부 API를 다시 호출하거나 응답을 가로채는 방식은 권한·정책·유지보수 비용을 평가하고 선택합니다.

주의: 이전 대화에서는 네이버 메일과 네이버웍스가 혼용되어 언급되었습니다. 실제로 조사된 호스트는 **`mail.naver.com`**이며, NAVER WORKS의 별도 웹메일 도메인에서 동일하게 동작한다는 뜻이 아닙니다.

## 5. 과거 인입 및 중복 사례

- 과거 ZIP/EML 백필 데이터에는 `naver_mail_sn`/`naver_folder_sn`이 없을 수 있습니다.
- 현재 인입 중복 판정은 `(message_id, folder_path)` 기준이고 `naver_mail_sn`은 교차 메일함 중복 제거의 키가 아닙니다.
- 한 메시지가 `전체메일`/`보낸메일함`에 별도로 수집되는 사례가 있어 태그를 ESSMT 행별로 부착하면 중복 행마다 태그 상태가 다를 수 있습니다.
- 내부 운영 문서는 2026년 9월 수집 복구 당시 최근 메일 48건의 `naver_mail_sn`이 DB에 존재함을 확인했다고 기록합니다. 이는 **전체 이력이나 현재 운영 범위의 100% 보유율을 의미하지 않습니다.**

## 6. 검증하지 않은 사항

1. 실제 이용 중인 웹메일의 버전·호스트와 각 메일 행의 DOM `data-*`/URL 속성
2. `mailSN`의 계정 간 전역 유일성 및 폴더 이동·복사 후 안정성
3. ESSMT 운영 DB의 `naver_mail_sn` NULL 비율과 중복 분포
4. 기존 사용자 로그인에서 API를 어떻게 안전하게 호출할지 (쿠키의 SameSite/CORS/CSRF 포함)
5. Chrome/Edge 스토어 심사에서 로그인 필요 웹메일을 검증하는 절차

## 7. 검토 코드 위치 (참조용 식별자)

| 역할 | 비공개 ESSMT 기준 파일 경로 |
| --- | --- |
| 이메일 모델 | `app/models/email.py` |
| 태그 모델 | `app/models/email_tag.py` |
| 태그 서비스 | `app/services/email_tags.py` |
| 이메일 목록/상세 라우터 | `app/routers/emails.py` |
| 메일 인입 서비스 | `app/services/email_ingest.py` |
| 메일 인입 webhook | `app/api/internal/email_ingest.py` |
| 기존 인입 확장 매니페스트/워커 | `extension/manifest.json`, `extension/background.js` |
| 웹메일 내부 API 조사 | `doc/domain/참고-네이버메일-API.md` |
| 시스템 도메인 개요 | `doc/domain/업무-이메일.md` |
| 메일 목록·뷰어 설명 | `doc/context/컨텍스트-이메일-목록-뷰어.md` |
| 파이프라인 운영 문서 | `doc/ops/이메일-인입-파이프라인.md` |

이 문서는 위 문서에 접속할 권한이 없어도 핵심 조사 사실을 이해하도록 작성했습니다.

## 8. 후속 DOM 관찰 추가 (2026-11-05 UTC)

위 3절의 역방향 보장 부족과 6절 1번은 최초 코드/문서 조사 당시의 미검증 상태를 기록한 것이다. 이후 기존 로그인 세션의 `/v2/folders/0/all` 한 화면을 DOM만 읽어 관찰했다. 80개 `.mail_item` 행 모두 제목 링크에서 `/v2/popup/read/{folderSN}/{mailSN}` 경로를 확인했고 `mail-{mailSN}` 클래스와 일치했으며, 화면 내 SN은 80개 모두 달랐다. 실제 클릭 결과·다른 화면·SPA 전환·노드 재사용·계정/폴더 간 유일성·현재 운영 DB 매칭은 검증하지 않았다. 기존 `/v2/read` 원문 링크 설계와 이번 popup href 관찰은 구분해야 한다.

관찰 범위·집계 절차·행 구조·상태 변화·배지 위치 후보와 한계는 [DOM 관찰 문서](research/naver-webmail-dom.md)에 정리했다. [데모 입력 계약](research/demo-input-contract.md)과 [합성 fixture](../demo/fixtures/mails.json)는 이를 바탕으로 오프라인 실험을 준비하는 자료이며 실제 데이터나 작동하는 확장이 아니다. 이번 추가 조사에서 내부 목록 API 호출이나 신규 DB 대조는 수행하지 않았다.
