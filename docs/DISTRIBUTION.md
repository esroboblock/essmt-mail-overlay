# 배포 조사: Chrome vs Edge (2026-11-05)

이 문서는 사내 직원의 Windows PC 여러 대에 **독립적인** 메일 태그 표시 확장을 배포한다는 전제로 작성했습니다. 최초 운영 브라우저/스토어는 미확정입니다.

## 1. 개발/스토어 선택

| 항목 | Chrome Web Store | Microsoft Edge Add-ons |
| --- | --- | --- |
| 개발 방식 | Chromium Manifest V3 | Chromium Manifest V3, 대부분 공통 코드 |
| 개발자 등록 | Chrome 웹 스토어 **별도** 개발자 등록 및 일회성 등록비 | Microsoft Edge 프로그램/Partner Center 등록, 확장 개발자 등록비 없음 |
| 기존 Google Play Console 계정 | Google 계정은 재사용 가능하나 **Play 개발자 등록으로 Chrome Web Store 등록을 대체할 수 없음** | 무관 |
| 검색에 나타나지 않는 등록 | **Unlisted** | **Hidden** |
| Unlisted/Hidden 보안 | URL을 아는 제삼자도 설치 가능. **비공개 액세스 제어 수단 아님** | 동일 |
| 버전 업데이트 | 스토어 심사 후 자동 업데이트 | 스토어 심사 후 자동 업데이트 |
| Windows 정책 배포 | 지원 | 지원 |
| 별도 자체 호스팅 | 가능하나 강제 설치 제약 있음 | 가능하나 강제 설치 제약 있음 |

**평가:** 등록 과정의 단순함만 보면 Chrome가 유리할 수 있으나 Chrome의 별도 등록비가 있습니다. Windows PC 강제 설치 정책과 Edge Add-ons를 중심으로 운영한다면 Edge도 유리합니다. 둘 중 어느 것도 아직 확정하지 않았습니다.

## 2. PC 배포

- 개발/PoC: 각 PC의 개발자 모드에서 unpacked 확장 로드. 자동 업데이트/일관된 버전 운영에는 불리.
- 스토어 등록: Chrome Unlisted 또는 Edge Hidden으로 배포. 자동 업데이트 가능. 스토어 심사 및 테스트 환경 제공 필요.
- 관리 정책: `ExtensionInstallForcelist` 또는 `ExtensionSettings`를 활용한 자동/강제 설치. 정책 적용 권한 및 실제 관리 수단은 조직별 확인 필요.
- **도메인에 가입하지 않은 Windows PC의 Edge**에서는 강제 설치 가능한 확장이 Edge Add-ons에 등재된 것에 제한됩니다. 자체 호스팅 CRX를 강제 배포하려면 별도 AD 관련 가입 조건을 검토해야 합니다.
- **도메인에 가입하지 않은 Windows PC의 Chrome**에서도 스토어 외부 확장 강제 설치는 제한됩니다. Chrome Web Store 호스팅 확장의 정책 설치는 지원됩니다.
- 강제 설치만으로 직원이 다른 브라우저 또는 비인가 메일 클라이언트를 쓰지 못하게 하는 것은 아닙니다. 이를 제한하려면 별도 PC/브라우저 운영 정책이 필요합니다.

## 3. 스토어 심사 준비

- 확장 목적(현재 열린 웹메일에 ESSMT 태그 표시)과 요청 권한의 관계를 간결하게 설명.
- 실제 공용 네이버 계정/운영 ESSMT DB를 심사자에게 제공하지 않고 검증하도록 **익명 테스트 모드, 데모 환경 또는 테스트 계정** 제공 방안을 검토.
- 웹메일 페이지 접근, 호스트 권한, 콘텐츠 수집 범위, 개인정보 처리, 저장 데이터, 외부 서버 통신 목적을 고지.
- Hidden/Unlisted도 일반 스토어 정책과 심사 요구를 적용받음.
- 소스 코드 저장소가 public이어도 확장 자체를 공개 설치 대상으로 제한 없이 운영할 필요는 없고, 실사용 기능은 ESSMT 인증 뒤에만 제공.

## 4. 운영 권고 (미확정)

1. Chrome/Edge 공통 소스로 개발하여 특정 브라우저에 기술적으로 종속되지 않도록 함.
2. 실제 메일 UI 기술 PoC → 사내 PC 1~2대 unpacked 테스트 → 한 스토어 선정 및 등록 → 3~5대 사내 시험 → 전체 정책 배포.
3. 스토어에 올라간 확장은 **동일한 확장 ID**로 업데이트하고, 배포 후 버전/ESSMT API 연결 상태를 진단할 수 있는 기능을 둠.
4. 사용자 계정·PC 자산 관리, 장애 대응, 스토어 심사에 걸리는 시간은 실제 조직 정책에 따라 별도 검토.

## 5. 조사 당시 공식 문서 주소 (참고)

아래 주소는 사전조사 근거이며, 특정 브라우저 선택을 확정한 기록은 아닙니다.

- Chrome 등록: https://developer.chrome.com/docs/webstore/register/
- Chrome Visibility: https://developer.chrome.com/docs/webstore/cws-dashboard-distribution/
- Chrome Windows 정책: https://support.google.com/chrome/a/answer/7532015
- Edge 개발자 계정: https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/create-dev-account
- Edge Hidden 등록: https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension
- Edge 강제 설치 정책: https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/extensioninstallforcelist
- Edge 자체 호스팅 제약: https://learn.microsoft.com/en-us/deployedge/microsoft-edge-manage-extensions-webstore
