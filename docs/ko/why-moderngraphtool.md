---
title: 왜 modernGraphTool인가?
editUrl: true
head: []
template: doc
sidebar:
  order: 2
  label: 왜 modernGraphTool인가?
  hidden: false
  attrs: {}
pagefind: true
draft: false
---

오디오 측정 커뮤니티의 눈높이는, 한때 제 몫을 충실히 해낸 도구들이 감당할 수 있는 선을 이미 넘어섰습니다.

modernGraphTool은 최신 웹 기술과 모듈화된 아키텍처 위에 처음부터 새로 작성한 도구입니다. 측정 데이터베이스 운영자와 오디오 애호가를 비롯한 커뮤니티의 요구에 맞춰 함께 진화하도록 설계했습니다.

## CrinGraph의 유산

[CrinGraph](https://github.com/mlochbaum/CrinGraph)는 2019년경 등장한 주파수 응답 곡선 시각화 도구로, 오디오 애호가 커뮤니티에서 사실상 표준으로 자리잡았습니다.

측정값을 불러오고, 곡선을 겹치고, 헤드폰을 비교하는 작업을 단순하면서도 효과적으로 해내며 본래의 역할을 훌륭히 수행했습니다.

squig.link 네트워크의 측정 데이터베이스 대부분은 지금도 CrinGraph나 그 파생 버전을 씁니다. CrinGraph가 FR 데이터 시각화 방식에 남긴 영향은 누구도 부정하기 어렵습니다.

:::note[완전한 데이터 호환]
modernGraphTool은 CrinGraph를 '부정'하는 도구가 아닙니다. 오히려 **계승**하는 도구에 가깝습니다.

데이터 형식, 폴더 구조, `phone_book.json`을 비롯한 데이터 구조를 그대로 유지했습니다. 기존 측정 데이터를 변환할 필요 없이 곧바로 사용할 수 있습니다.
:::

## 한눈에 비교하기

오늘날 'CrinGraph'라고 하면 보통 세 가지 코드베이스 중 하나를 가리킵니다. [Vanilla CrinGraph](https://github.com/mlochbaum/CrinGraph)는 원조 버전이고, [squiglink lab](https://github.com/squiglink/lab)은 squig.link 데이터베이스 대부분이 쓰는 가벼운 포크입니다. [PublicGraphTool](https://github.com/HarutoHiroki/PublicGraphTool)은 커뮤니티의 추가 기능을 가장 많이 담은 포크입니다.

|                            | Vanilla CrinGraph         | squiglink lab             | PublicGraphTool                      | modernGraphTool                                                                                    |
| -------------------------- | ------------------------- | ------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| **코드베이스**             | 약 2,500줄 단일 스크립트  | 스크립트 3개, 약 4,100줄  | 번들링 없는 스크립트 40여 개, 약 14,400줄 | 번들링된 TypeScript 컴포넌트                                                                  |
| **파라메트릭 EQ + AutoEQ** | —                         | ✓                         | ✓                                    | ✓ [실행 취소/다시 실행 지원](./features/equalizer.mdx)                                             |
| **EQ A/B 테스트**         | —                         | —                         | —                                    | ✓ 이력 및 비교 패널, 누르는 동안만 우회하는 단축키                                                 |
| **채널별(L / R) EQ**       | —                         | —                         | 밸런스 슬라이더만 제공               | ✓ [공통 밴드 + 좌우 개별 밴드](./features/equalizer.mdx#채널별-eq)                            |
| **실시간 EQ 미리 듣기**    | —                         | 톤 제너레이터             | ✓                                    | ✓ 오디오 파일, 노이즈, 톤, 사인 스윕                                                    |
| **Preference Bound**       | —                         | —                         | ✓                                    | ✓ [기본 내장](./features/preference-bound.mdx)                                                     |
| **타겟 커스터마이징**      | —                         | —                         | 틸트, 저음, 이어 게인, 고음          | ✓ [필터 구성, 프리셋, 타겟별 기본값 설정 가능](./features/target-customizer.mdx)                   |
| **인터페이스 언어**        | 영어                      | 영어                      | 영어                                 | 영어, 한국어, 체코어, 러시아어, 우크라이나어                                                       |
| **테마**                   | CSS와 JS 직접 수정        | 여러 CSS 파일 직접 수정   | 여러 CSS 파일 직접 수정              | 단일 `theme.css` + [테마 생성기](/theme-generator)                                                 |
| **설정**                   | `config.js` 직접 수정     | `config.js` 직접 수정     | `config.js` 직접 수정                | 구조화된 `config.js` + [설정 편집기](/config-generator), [phone_book 편집기](/phone-book-editor)   |
| **업데이트**               | 파일 재업로드             | 파일 재업로드             | 파일 재업로드                        | [CDN 모드](./guide-for-admins/deployment/cdn.mdx)에서 자동                                          |
| **데이터 형식**            | `phone_book.json` + FR `.txt` | 동일                  | 동일                                 | 동일 — 그대로 호환                                                                                 |

아래에서 이 차이들이 실제로 어떤 의미인지 하나씩 살펴봅니다.

## 모든 기능을 한곳에

CrinGraph 생태계에서 기능은 포크마다 흩어져 있습니다. Preference Bound와 Device PEQ 브리지는 PublicGraphTool에 있고, 대부분의 사이트는 squiglink lab을 씁니다. 내 포크에 없는 기능이 필요하면 직접 옮겨와야 합니다. 애초에 합쳐질 것을 고려하지 않은 수천 줄의 JavaScript를 손으로 병합하면서, 다른 곳이 망가지지 않기를 바라야 하죠.

modernGraphTool은 모든 기능을 하나의 빌드에 담았고, 각각 `config.js`에서 켜고 끌 수 있습니다.

- **[이퀄라이저](./features/equalizer.mdx)** — AutoEQ, 채널별 밴드, 실행 취소/다시 실행, 수정 이력을 A/B로 비교하는 이력 및 비교 패널, 가져오기/내보내기를 갖춘 파라메트릭 EQ.
- **실시간 미리 듣기** — 직접 올린 오디오 파일, 화이트·핑크 노이즈, 테스트 톤, 사인 스윕을 EQ를 적용한 채 재생하며, 패널을 옮겨도 재생이 끊기지 않습니다.
- **[Device PEQ](./features/device-peq.mdx)** — USB, 시리얼, 블루투스, 네트워크로 연결된 20여 종의 기기에 필터를 바로 전송합니다.
- **[타겟 커스터마이저](./features/target-customizer.mdx)** — 모든 타겟에 틸트, 저음, 고음, 이어 게인 필터를 적용하고, 프리셋과 타겟별 기본값을 설정할 수 있습니다. 운영자가 필터 구성을 통째로 바꿀 수도 있습니다.
- **[Preference Bound](./features/preference-bound.mdx)**, **[평균 곡선](./features/average-curves.mdx)**, 그리고 평균·회차별·최소/최대 범위로 표시되는 다중 샘플 측정값.
- **[사이트 간 검색](./features/cross-site-search.mdx)**과 **[사이트 선택기](./features/site-selector.mdx)** — 네트워크의 모든 데이터베이스에서 기기를 찾고, 사이트 사이를 오갈 수 있습니다.
- **[주파수 튜토리얼](./features/frequency-tutorial.mdx)**, 공유 URL, 스크린샷, 워터마크.

## 코드를 건드리지 않는 업데이트

CrinGraph 사이트는 업로드한 날의 모습에서 멈춰 있습니다. 버그 수정이나 새 기능을 반영하려면 파일을 받고, 직접 수정했던 부분을 다시 적용한 뒤, 또 업로드해야 합니다. 대부분의 사이트가 아예 업데이트하지 않는 이유입니다.

[CDN 모드](./guide-for-admins/deployment/cdn.mdx)에서는 운영자 서버에 데이터, `config.js`, `theme.css`만 남습니다. 앱 자체는 CDN에서 불러오기 때문에, 새 릴리스가 나오면 몇 분 안에 아무 작업 없이 사이트에 반영됩니다.

그리고 릴리스는 꾸준히 나옵니다. modernGraphTool은 2025년 3월부터 개발을 이어오고 있으며, v2는 2026년 4월 출시 이후 20번의 릴리스를 거쳤습니다. 그중 몇 가지를 꼽으면 다음과 같습니다.

- **채널별 EQ** — 좌우 귀에 별도 밴드를 적용해, AutoEQ로 채널 불균형 보정과 타겟 맞추기를 한 번에 할 수 있습니다.
- **이력 및 비교** — EQ 수정 이력 간 A/B 비교와 완전한 실행 취소/다시 실행.
- **새 인터페이스 언어 3종** — 커뮤니티가 기여한 체코어, 러시아어, 우크라이나어.

나머지 내용은 [변경 기록](./changelog.mdx)에서 확인하세요.

## 코드 없이 설정하기

CrinGraph의 `config.js`는 흩어진 JavaScript 변수의 나열이고, 페이지의 외관은 여러 스타일시트와 스크립트 속 인라인 스타일에 퍼져 있습니다. 둘 중 무엇을 바꾸든 소스 코드를 읽어야 합니다.

modernGraphTool은 관심사마다 한 곳에 모아 두었고, 텍스트 편집기를 열 일이 거의 없도록 도구도 함께 제공합니다.

- **[`config.js`](./guide-for-admins/customize-page.mdx)** — 초기 기기와 타겟, 정규화, 라벨, 워터마크, 패널 배치, 랭킹, 언어, 모든 기능 토글을 담은 하나의 구조화된 객체.
- **[설정 편집기](/config-generator)** — 모든 옵션을 폼으로 제공합니다. 현재 파일을 가져와 필요한 부분만 바꾸고 다시 내보내면 됩니다.
- **[테마 생성기](/theme-generator)** — 색상 몇 개만 고르면 라이트·다크 테마를 모두 담은 `theme.css`를 만들어 줍니다.
- **[phone_book.json 편집기](/phone-book-editor)** — JSON을 직접 쓰지 않고 브랜드, 기기, 변형을 관리합니다.

## 데이터도, 선택지도 그대로

전환한다고 해서 발이 묶이지 않습니다.

- **같은 데이터** — `data/` 폴더와 `phone_book.json`을 그대로 씁니다. modernGraphTool 전용 필드는 CrinGraph 형식을 대체하지 않고 덧붙는 방식이라, 같은 파일을 CrinGraph에서도 계속 읽을 수 있습니다.
- **이중 호스팅** — 기존 CrinGraph와 같은 도메인에서 함께 운영하며 [점진적으로 전환](./database-tips/dual-hosting/main-cringraph.mdx)할 수 있습니다.
- **배포 방식 선택** — 자동 업데이트를 원하면 CDN 모드, 버전 교체 시점을 직접 정하고 싶다면 [사전 빌드 릴리스](./guide-for-admins/deployment/prebuilt.mdx), 서버가 없다면 [GitHub Pages](./guide-for-admins/deployment/github-pages.mdx)를 고르세요.

:::note[시작해 볼까요?]
CrinGraph에서 넘어오신다면 [CrinGraph에서 마이그레이션하기](./migrating-from-cringraph.mdx)를, 새로 시작한다면 [환경 구성 가이드](./guide-for-admins/setup-env.mdx)를 참고하세요.
:::