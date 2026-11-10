# ESSMT Mail Overlay

네이버 웹메일 화면 위에 ESSMT의 이메일별 공유 태그를 표시하기 위한 **독립 Chromium 브라우저 확장 프로젝트**입니다.

> **현재 상태: 로그인 없는 데모·Mock API와 설치 가능한 MV3 태그 표시 확장이 구현되어 있습니다.** 기본 확장은 로컬 합성 데모용이며, 별도 테스트 빌드로 네이버 받은메일함의 로컬 Mock 어댑터를 시험할 수 있습니다. **실제 받은메일함 80행의 식별과 MV3 Mock 배지 삽입을 검증했습니다.** 화면·브라우저·좁은 너비의 검증 한계는 [실제 검증 보고서](docs/research/naver-live-mock-validation.md)에 구분했습니다. 합성 데모는 선택적으로 개발 ESSMT 읽기 전용 API에 연결할 수 있습니다. 운영 연결과 스토어 배포는 후속 범위입니다.
> 이 저장소는 ESSMT의 기존 이메일 수집 확장과 별개입니다.

## 데모 실행

저장소 루트에서 아래 명령을 실행하고 <http://127.0.0.1:4173/>를 엽니다. Python 3만 있으면 되며 설치·빌드·외부 로그인이 필요하지 않습니다.

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory demo
```

가상 메일 목록·검색·페이지 이동·상세와 합성 실패/지연 시나리오를 조작할 수 있습니다. **메일 행에는 태그 배지를 미리 삽입하지 않습니다.** Mock 결과는 별도 진단 패널에 표시합니다.

실행 방법, Mock API v1, 확장용 메시지 bridge와 DOM 수명 규칙은 [데모 연동 문서](demo/README.md)를 참고하세요. 테스트: Node.js 22+에서 `npm ci && npm test`, 이후 `npx playwright install chromium && npm run test:e2e`.

## 확장 설치

Chrome의 `chrome://extensions` 또는 Edge의 `edge://extensions`에서 개발자 모드를 켜고 **압축해제된 확장 프로그램 로드**로 `extension/` 폴더를 선택합니다. 위 데모를 연 뒤 새로고침하면 확장이 제목 옆에 Mock 태그를 표시합니다. [설치·실행·디버깅·검증 안내](extension/README.md)를 참고하세요.

개발 ESSMT를 연결하려면 [로컬 생성·로그인·모드 선택 안내](extension/README.md#essmt-개발-서버-연결-7)를 따르세요. 기본 설치는 계속 Mock입니다. [통합 검증 기록](docs/research/essmt-integration-validation.md)에서 실제 앱 검증과 합성 서버 검증을 구분합니다.

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

**DOM 관찰 추가:** 2026-11-05 UTC, 열린 받은메일함 목록 한 화면의 80행에서 제목 링크의 popup 경로와 `mail-{mailSN}` 클래스가 일치했습니다. 화면 전환·다른 메일함·상세·노드 재사용에 걸친 안정성은 미검증입니다. 과거 백필 메일 일부의 serial이 NULL일 수 있고, 동일 메시지가 폴더별로 중복된 DB 행으로 존재할 수 있습니다.

## 문서

- [`docs/DECISIONS.md`](docs/DECISIONS.md): 확정 사항 / 제안 / 미결정 사항
- [`docs/RESEARCH.md`](docs/RESEARCH.md): ESSMT 실제 코드 및 네이버 메일 구조 사전조사 요약
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): 구조 제안, 식별자 연결, API·보안 설계
- [`docs/DISTRIBUTION.md`](docs/DISTRIBUTION.md): Chrome/Edge 스토어 등록 및 사내 배포 비교
- [`docs/ROADMAP.md`](docs/ROADMAP.md): 검증 순서와 수용 기준
- [`docs/research/naver-live-mock-validation.md`](docs/research/naver-live-mock-validation.md): 실제 로그인 화면의 MV3 Mock 삽입 결과·UI·남은 제한
- [`docs/research/naver-compatibility-validation.md`](docs/research/naver-compatibility-validation.md): 이슈 #3의 환경 접근 결과, 합성 테스트와 실제 미검증 항목
- [`docs/research/naver-webmail-dom.md`](docs/research/naver-webmail-dom.md): 읽기 전용 DOM 관찰, 재현 절차와 한계
- [`docs/research/demo-input-contract.md`](docs/research/demo-input-contract.md): 합성 데모 입력 스키마와 시나리오별 기대 결과
- [`demo/fixtures/mails.json`](demo/fixtures/mails.json), [`tags.json`](demo/fixtures/tags.json), [`mail-list.fragment.html`](demo/fixtures/mail-list.fragment.html): 실제 메일을 포함하지 않는 오프라인 입력

## 구현 시작 전 가장 먼저 확인할 것

1. 관찰 대상은 `mail.naver.com`임을 확인했으나, 다른 운영 환경과 NAVER WORKS 지원 여부는 별도 확인
2. 목록 한 화면의 식별 단서를 바탕으로 다른 화면·화면 전환에서도 **개별 메일의 `mailSN`**을 안정적으로 얻을 수 있는지 확인
3. ESSMT의 `naver_mail_sn` 보유율·중복 여부를 읽기 전용 집계로 확인
4. 직원별 ESSMT 인증 및 브라우저/스토어 배포 방식 결정

> 이 프로젝트는 네이버/네이버웍스 공식 서비스가 아니며, 내부 웹메일 API·DOM 구조는 사전 예고 없이 바뀔 수 있습니다.
