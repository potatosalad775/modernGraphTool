---
title: 테스트
editUrl: true
head: []
template: doc
sidebar:
  order: 2
  hidden: false
  attrs: {}
pagefind: true
draft: false
---

modernGraphTool은 **Vitest**와 **Playwright 브라우저 모드**를 사용합니다. 스펙 파일은 대상 코드 옆에
`*.spec.ts` 이름으로 함께 둡니다.

## 테스트 실행하기 \{#running-tests\}

| 명령어                  | 설명                                                       |
| ----------------------- | ---------------------------------------------------------- |
| `npm run test`          | 전체 스위트 — `client`와 `server` 두 프로젝트 모두         |
| `npm run test:unit`     | 같은 스위트를 감시(watch) 모드로 실행                      |
| `npm run test:coverage` | 전체 스위트 + v8 커버리지 리포트를 `coverage/`에 생성      |
| `npm run test:smoke`    | 빌드된 `dist/`를 세 엔진에서 부팅 (먼저 `build` 필요)      |

## 두 개의 프로젝트 \{#the-two-projects\}

**파일 이름이 어느 프로젝트에서 실행될지 결정합니다.**

- `*.svelte.spec.ts` → `client` 프로젝트. Playwright를 통해 실제 Chromium에서 실행
- 그 외 전부 → `server` 프로젝트. node에서 실행

대부분의 스펙은 스토어와 서비스를 직접 다룹니다. 컴포넌트 스펙은 `vitest-browser-svelte`의
`render()`로 마운트하고 `vitest/browser`의 `page.getBy*`로 조회합니다.

:::tip[함정은 어디에 문서화되어 있나요]
계층별 테스트 함정은 코드 옆의 디렉터리별 `AGENTS.md` 파일에 있습니다. 컴포넌트와 부팅 테스트 관련
함정은 `src/lib/components/`, d3/rAF 관련 함정은 `src/lib/graph/`, 연결 흐름 모킹 방식은
`src/lib/device-peq/`에 있습니다. 코드가 옮겨져도 내용이 정확하게 유지되도록 이 문서가 아니라 해당
위치에 두고 있습니다.
:::

## 커버리지 \{#coverage\}

설정은 `vite.config.ts`의 `test.coverage` 아래에 있으며, 그중 두 항목이 핵심입니다.

- **`src` 전체를 포괄하는 `include` 글로브**가 있어야 어떤 테스트도 불러오지 않는 파일이 집계에
  포함됩니다. 이것이 없으면 테스트되지 않은 모듈이 0%로 표시되는 대신 분모에서 아예 사라집니다.
  eqcaps bridge로 대체되기 전 `device-peq/`에 있던 약 25개의 기기 핸들러·커넥터 모듈 때문에 보고되는
  수치가 그렇게 약 10포인트 낙관적으로 나왔습니다. (Vitest 4에서 기존
  `coverage.all` 플래그가 제거되었습니다. 이제 `include`가 그 역할을 하며, `all`을 넘기면 타입
  오류입니다.)
- **`exclude`는 Paraglide 산출물을 제외합니다.** `src/lib/paraglide/`는 Paraglide Vite 플러그인이
  생성하며 gitignore 대상입니다. 이를 집계에 넣으면 기계가 작성한 구문 약 3800개 — 전체의 3분의 1 —
  가 더해져, 사람이 작성한 소스의 실제 수치보다 한참 낮은 값이 나옵니다. `src/lib/types/**`(타입
  전용)와 `src/routes/**`(부팅 테스트가 커버하는 셸)도 "의미 있게 측정할 수 없다"는 같은 이유로
  제외됩니다.

:::caution[`thresholds`는 목표치가 아니라 래칫입니다]
이 값은 마지막으로 개선했을 때 측정된 수치를 담고 있습니다. 커버리지가 올라가면 함께 올리되,
**빨간 실행을 초록으로 만들려고 낮추지 마세요.** CI는 Linux 레그에서만 커버리지를 실행하며 이는
차단 조건입니다. 래칫 아래로 떨어진 PR은 원래 있던 커버리지를 없앤 것입니다.
:::

## 스모크 테스트 \{#smoke-test\}

```bash
npm run build && npm run test:smoke
```

유닛 스위트는 컴포넌트를 소스 기준으로 마운트하므로, 빌드 산출물을 불러오는 일이 전혀 없습니다.
adapter-static 설정 오류, Vite 플러그인이 복사하지 않게 된 `defaults/` 파일, 애셋 URL 회귀, 번들 이후
해석에 실패하는 워커 — 이 모두는 전체 스위트가 초록인 채로 빈 페이지를 배포하게 만듭니다.

`scripts/smoke-dist.js`는 `dist/`를 실제 HTTP로 서빙하고(`.htaccess`가 제공하는 SPA 폴백 포함),
Playwright로 Chromium, WebKit, Firefox에서 부팅한 뒤 콘솔 오류, 처리되지 않은 예외, 4xx 응답,
그려지지 않는 그래프, 곡선이 하나도 나타나지 않는 `?share=` 링크에 대해 실패합니다. 권장 보안 헤더를
Trusted Types까지 켠 채로 보내고, 각 엔진이 이를 실제로 적용하는지 확인합니다. AutoEQ도 실행하여
워커가 응답하지 않거나 wasm 엔진 대신 폴백이 돌면 실패하며, 비활성 버튼의 툴팁도 열어 봅니다.

Chromium 밖에서 도는 테스트는 이것뿐입니다. 컴포넌트 스펙은 Chromium에서만 실행됩니다. 나머지 두
엔진은 `npx playwright install webkit firefox`로 한 번 설치하고, 엔진 하나만 돌리려면
`npm run test:smoke -- --browser firefox`를 사용하세요.

:::note[WebKit은 Safari가 아닙니다]
Playwright의 WebKit은 데스크톱 Safari와 가깝지만 같지는 않으며, iOS에서만 나타나는 동작은 보여 주지
않습니다. 여기서 통과했다고 실제 iPhone 확인을 대신할 수는 없습니다. WebHID와 Web Bluetooth는
Chromium에만 있으므로, 하드웨어 EQ 경로는 테스트 결과와 무관하게 단일 엔진입니다.
:::

확장할 때 유념할 세 가지입니다.

- **어떤 엔진에 적용할 수 없는 검사는 그 엔진에서만 건너뛰고, 건너뛰는 자리에 이유를 적습니다.**
  현재 건너뛰는 검사는 없습니다.
- **200 응답이 파일의 존재를 증명하지는 않습니다.** SPA 폴백은 디스크에 없는 요청에 `index.html`로
  응답하며, 실제 Apache 호스트에서도 마찬가지입니다. 그래서 애셋 검사는 상태 코드를 믿는 대신 본문을
  HTML 셸과 비교합니다.
- 별도의 `smoke` CI 잡에서 실행되며, 빌드 산출물이 필요하므로 잡이 먼저 앱을 빌드합니다. 이 잡은 세
  엔진이 들어 있는 Playwright Docker 이미지에서 실행됩니다. 이미지 태그는 `package-lock.json`의
  `playwright` 버전과 같아야 하며, 다르면 잡이 설정해야 할 태그를 알려 주며 실패합니다.

## 지속적 통합 \{#continuous-integration\}

`.github/workflows/ci.yml`은 모든 PR과 `main`으로의 모든 푸시에서 실행됩니다. ubuntu-latest에서
`lint` → `check` → `test`를 돌리고, 앱 빌드, 세 브라우저 엔진에서의 스모크 테스트, CDN 배포본과 문서
사이트 빌드를 수행합니다. CI는 운영 체제가 아니라 브라우저 엔진을 가로질러 테스트합니다.

Windows 레그는 줄바꿈 문자 때문에만 남아 있습니다. 설치와 린트, 작업 트리 검사만 하고 타입 검사와
테스트는 실행하지 않습니다. Git for Windows는 시스템 설정에서 `core.autocrlf=true`를 켜기
때문에, `.gitattributes`로 모든 텍스트 파일을 `eol=lf`로 고정하기 전에는 같은 커밋이 macOS에서는
Prettier 기준으로 깨끗하고 Windows에서는 더럽게 나왔습니다. 린트 단계와 **Working tree must be clean**
단계가 이 문제의 재발을 막습니다. 후자는 체크아웃과 설치만 했는데 무언가 수정된 상태로 남거나 CRLF가
인덱스나 작업 트리에 들어가면 실패합니다.

`npm run lint`는 0으로 종료해야 하며, ESLint _경고_도 오류처럼 실패로 처리됩니다(`--max-warnings 0`). 규칙 재정의는 `eslint.config.js`에 있으며 각각 이유를 주석으로
달아 두었습니다. 특히 `no-useless-assignment`는 `$bindable()` prop 기본값을 잘못 읽기 때문에
`*.svelte`에서 꺼져 있고, `no-explicit-any`는 설정 마이그레이션 도구가 운영자가 작성한 임의의 설정을
파싱하기 때문에 `docs/` 아래에서 꺼져 있습니다.

`src/`에서는 타입 정보를 쓰는 두 규칙이 앱 코드를 타입에 맞춥니다. `no-unnecessary-condition`은
타입상 절대 실행될 수 없는 가드를 실패로 처리하므로, 타입 바깥에서 오는 값(운영자 설정, 가져온 JSON,
스토리지, DOM 조회, 범위를 벗어날 수 있는 인덱스)은 들어오는 지점에서 `| undefined`로 타입을 붙이고
그 가드는 남겨 둡니다. `no-non-null-assertion`은 `!`를 실패로 처리합니다. 대신 타입을 좁히거나, 값이
없는 것이 버그라면 예외를 던지세요. 스펙과 테스트 픽스처에서는 `!`를 계속 쓸 수 있습니다.

스펙을 제외한 앱 코드에는 typescript-eslint의 `strict-type-checked`와 `stylistic-type-checked`
프리셋과, 함수당 `complexity` 한도 15도 적용됩니다. 일괄 억제는 쓰지 않습니다. 빨간 lint를
통과시키려고 `eslint --suppress-all`을 실행하지 마세요. 한도를 넘는 함수는 스펙을 기준으로 삼아
나눕니다.

이 프리셋 때문에 `src/lib/utils/`에 헬퍼 두 개가 있습니다. `track(a, b)`는 `$effect`가 의존하지만 달리
쓰지는 않는 반응형 값을 명시합니다(`void a;`만 쓰면 `no-meaningless-void-operator`에 걸립니다).
`noop`은 아무 동작도 필요 없는 콜백 자리를 채웁니다. 무시해도 되는 거부에 붙이는 `.catch(noop)`이
그 예입니다(빈 화살표 함수는 `no-empty-function`에 걸립니다).