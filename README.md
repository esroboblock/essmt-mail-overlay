# ESSMT Mail Overlay

네이버 웹메일 화면 위에 ESSMT의 이메일별 공유 태그를 표시하기 위한 **독립 Chromium 브라우저 확장 프로젝트**입니다.

> **현재 상태: 설계 및 사전조사 문서만 존재합니다.** 확장 프로그램, 조회 API, 스토어 배포물은 아직 구현/등록되지 않았습니다.
> 이 저장소는 ESSMT의 기존 이메일 수집 확장과 별개입니다.

## 배경과 목표

조직에서 **하나의 네이버 메일 계정**을 여러 직원이 서로 다른 Windows PC에서 사용하고 있습니다. 사용자는 기존 웹메일을 계속 이용하고, 브라우저 확장이 ESSMT DB에 저장된 메일별 태그를 읽어 **메일 목록 및 상세 화면에 덧붙여 보여주는 것**이 목표입니다. 태그 데이터는 네이버 메일 계정에 쓰지 않고 ESSMT에 남습니다.

### 핵심 원칙

- **독립 제품:** 기존 ESSMT 이메일 인입/수집 확장을 복제하거나 직원 PC에 배포하지 않습니다. 새 저장소, 별도 확장 ID, 독립 배포와 버전 관리.
- **읽기 전용 우선:** 초기 버전은 태그 표시만 수행. 태그 생성·수정·삭제, 업무 상태 변경은 후속 검토.
- **공유 메타데이터:** 같은 메일의 ESSMT 태그를 모든 직원에게 일관되게 표시하되, ESSMT 사용자 인증·접근권한은 별도로 설계합니다.
- **보안:** 네이버 로그인 정보, ESSMT 인입 토큰, 운영 메일 본문/첨부를 확장 또는 공개 저장소에 포함하지 않습니다.
- **Chromium 공통 코드:** Edge/Chrome 어느 쪽이든 동작하도록 설계하되, 최초 운영 브라우저와 스토어는 아직 최종 확정되지 않았습니다.

## 개략 구성

```text
여러 직원 PC (각자 지정 브라우저)
  └─ Chromium 확장: 메일 목록/상세 감지 → 메일 ID 추출 → 태그 배지 렌더링
          │ 사용자별 인증된 HTTPS 조회 (초기: 읽기 전용)
          ▼
      ESSMT 조회 API (신규, 인증·권한검사·일괄 조회)
          │
          ▼
      ESSMT DB: emails + email_tag_assignments + email_tags

기존 ESSMT 메일 수집 파이프라인은 위 확장과 무관하게 종전대로 운영.
```

## 확인된 ESSMT 연동 기반

2026-11-05 기준 ESSMT `main`의 코드 및 문서를 검토했습니다.

- `emails.id`: ESSMT 내부 이메일 PK
- `emails.message_id`: RFC Message-ID
- `emails.naver_mail_sn`: 네이버 개별 메일 일련번호
- `emails.naver_folder_sn`: 네이버 폴더 일련번호
- `emails.naver_thread_id`: 네이버 스레드 보조 식별자 (개별 메일 식별자로 사용하지 않음)
- `email_tags`, `email_tag_assignments`: 공유 태그 및 이메일-태그 연결
- 태그 일괄 조회 서비스(`list_tags_for_emails`)와 ESSMT 화면의 태그 조회/부착 기능 구현 확인
- 네이버 메일 내부 목록 응답의 `mailSN`/`folderSN` 및 ESSMT에 저장된 serial을 이용한 원본 링크 구성 확인

**주의:** 웹메일 화면의 DOM에서 각 행의 `mailSN`을 안정적으로 추출할 수 있는지는 아직 검증되지 않았습니다. 또한 과거 백필 메일 일부의 serial이 NULL일 수 있고, 동일 메시지가 폴더별로 중복된 DB 행으로 존재할 수 있습니다.

## 문서

- [`docs/DECISIONS.md`](docs/DECISIONS.md): 확정 사항 / 제안 / 미결정 사항
- [`docs/RESEARCH.md`](docs/RESEARCH.md): ESSMT 실제 코드 및 네이버 메일 구조 사전조사 요약
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): 구조 제안, 식별자 연결, API·보안 설계
- [`docs/DISTRIBUTION.md`](docs/DISTRIBUTION.md): Chrome/Edge 스토어 등록 및 사내 배포 비교
- [`docs/ROADMAP.md`](docs/ROADMAP.md): 검증 순서와 수용 기준

## 구현 시작 전 가장 먼저 확인할 것

1. 대상 웹메일이 `mail.naver.com`인지, 별도의 NAVER WORKS 도메인인지 운영 환경에서 확인
2. 실제 메일 목록·상세 DOM 또는 네트워크 흐름에서 **개별 메일의 `mailSN`**을 안정적으로 얻을 수 있는지 확인
3. ESSMT의 `naver_mail_sn` 보유율·중복 여부를 읽기 전용 집계로 확인
4. 직원별 ESSMT 인증 및 브라우저/스토어 배포 방식 결정

> 이 프로젝트는 네이버/네이버웍스 공식 서비스가 아니며, 내부 웹메일 API·DOM 구조는 사전 예고 없이 바뀔 수 있습니다.
