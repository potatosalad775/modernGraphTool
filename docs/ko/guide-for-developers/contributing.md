---
title: 기여하기
description: modernGraphTool을 로컬에서 설정하는 방법, CI가 강제하는 코드 스타일, 풀 리퀘스트를 여는 방법을 다룹니다.
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

규모와 상관없이 어떤 기여든 언제나 환영합니다. 이 페이지는 첫 풀 리퀘스트 전에 알아야 할 내용을
다룹니다. 아키텍처와 프로젝트 구조는 [개요](./overview.mdx)를 보세요.

## 기여할 수 있는 것 \{#what-to-contribute\}

- **버그 수정**: 언제나 환영합니다.
- **접근성 개선**: 목표는 WCAG AAA입니다.
- **번역**: 코드를 몰라도 됩니다. [번역하기](./translating.mdx)를 보세요.
- **문서**: 오타 수정, 설명 보완, 새 가이드. 소스는 `docs/src/content/docs/`에 있습니다.
- **기능**: 먼저 [이슈를 열어](https://github.com/potatosalad775/modernGraphTool/issues) 접근 방식을
  논의해 주세요.

## 설정 \{#setup\}

[Node.js](https://nodejs.org/) 24 이상(CI는 최신 24.x를 사용)과 함께 설치되는 npm이 필요합니다.

```bash
git clone https://github.com/potatosalad775/modernGraphTool.git
cd modernGraphTool
npm install
npm run dev        # http://localhost:5173
```

`npm run lint`를 실행하려면 `cd docs && npm ci`로 문서 사이트의 의존성도 한 번 설치하세요. 루트 lint는
`docs/` 아래 파일까지 검사하는데, ESLint가 그 설정을 `docs/tsconfig.json`을 통해 읽으며, 이 파일은
`docs/node_modules` 없이는 불러올 수 없습니다.

## 코드 스타일 \{#code-style\}

**Prettier**와 **ESLint**가 기준입니다. 탭 들여쓰기, 작은따옴표, 후행 쉼표 없음, 한 줄 100자.

```bash
npm run lint       # 검사
npm run format     # 수정
```

CI가 Linux와 Windows에서 `npm run lint`를 실행하므로, Prettier 기준에 맞지 않는 PR은 병합되지
않습니다.

### 줄바꿈 \{#line-endings\}

모든 텍스트 파일은 `.gitattributes`로 **LF**에 고정되어 있습니다. Git for Windows 설치 프로그램이
기본으로 켜는 `core.autocrlf`보다 이 설정이 우선하므로 로컬에서 설정할 것은 없습니다. CRLF만 커밋하지
마세요. `.editorconfig`도 에디터에 같은 내용을 알려 줍니다. 에디터가 기본으로 읽지 못한다면
EditorConfig 확장을 설치하세요.

### git blame \{#git-blame\}

저장소 전체를 다시 포맷한 커밋이 하나 있습니다. `git blame`이 그 커밋이 아니라 실제 작성자를
가리키도록, 클론마다 한 번 다음을 실행하세요.

```bash
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

GitHub의 blame 화면은 이미 이 파일을 반영합니다.

## Svelte 5 규칙 \{#svelte-5-conventions\}

프로젝트는 **Svelte 5 룬**을 쓰며, 전역으로 강제됩니다.

| 사용                      | 사용하지 않음     |
| ------------------------- | ----------------- |
| `let x = $state(value)`   | `writable(value)` |
| `let y = $derived(expr)`  | `$: y = expr`     |
| `$effect(() => { ... })`  | `afterUpdate`     |
| `let { prop } = $props()` | `export let prop` |

스토어는 일반 `.ts`가 아니라 `.svelte.ts` 파일 안의 반응형 클래스 인스턴스입니다. `src/lib/` 아래
대부분의 디렉터리에는 그 영역에만 해당하는 규칙을 담은 `AGENTS.md`가 있으니, 코드를 바꾸기 전에
읽어 보세요.

## 공용 컴포넌트 \{#shared-components\}

UI는 HTML 요소를 그대로 쓰지 말고 `src/lib/components/atoms/`의 래퍼(`Button`, `Input`, `Switch`,
`Accordion`, `PopoverPanel`, `ScrollArea`, `Skeleton` 등)로 만드세요. 래퍼에는 focus-visible 링,
트랜지션, 비활성 스타일, 운영자가 바꿀 수 있는 팔레트가 들어 있습니다. 그냥 `<button>`을 쓰면 이 모든
것이 빠지고, 테마가 바뀔 때 어긋나게 됩니다.

- `Button`은 클래스 목록 대신 `variant`와 `size` 속성을 받습니다. 패딩 클래스를 직접 쓰기 전에 이미
  맞는 크기(`toolbar`, `icon`, `icon-sm`, `icon-xs`)가 있는지 확인하세요. 필수인 `title`은
  `aria-label`도 되므로, title과 화면에 보이는 텍스트가 같은 내용을 말하게 하세요.
- `Button`의 `class`로 넘긴 값은 [tailwind-merge](https://github.com/dcastil/tailwind-merge)로
  병합되므로, `!` 수식어 **없이도** 기본 스타일을 덮어씁니다. `class="rounded-full!"`이 아니라
  `class="rounded-full"`로 쓰세요. 일반 요소에서는 충돌하는 유틸리티의 우선순위가 같아서 여전히 `!`가
  필요합니다.
- 체크박스와 라디오는 예외입니다. 해당하는 atom이 없으므로 그대로 둡니다. bits-ui가 `child` 스니펫으로
  다루는 요소도 bits-ui가 렌더링하는 대로 둡니다.

색상은 `text-zinc-500` 같은 고정 팔레트 값이 아니라 항상 의미 토큰(`bg-base-100`,
`text-base-content/60`, `text-primary` 등)을 거치게 하세요. 그래야 운영자 테마가 일관되게 유지됩니다.

## 풀 리퀘스트 \{#pull-requests\}

1. `main`에서 **브랜치를 만들고**, PR 하나에는 한 가지 주제만 담으세요.
2. 푸시하기 전에 **검사를 실행**하세요.
   ```bash
   npm run check    # TypeScript + Svelte 타입 검사
   npm run lint     # ESLint + Prettier
   npm run test     # 전체 테스트
   ```
   CI는 Linux와 Windows에서 정확히 이 명령들을 실행하고, 앱·CDN 배포판·문서 사이트도 빌드합니다. 두
   테스트 프로젝트와 커버리지 래칫은 [테스트](./testing.mdx)를 보세요.
3. 사용자에게 보이는 것, 운영자가 설정하는 것, 개발자가 기여하는 방식에 영향을 주는 변경이라면 같은
   PR에서 **문서도 갱신**하세요.
4. 무엇을 왜 바꿨는지 명확히 적어 **PR을 여세요**. 커밋 메시지는 짧게 쓰고, 자세한 이유는 PR 설명에
   적으세요.

기여하면 기여한 내용이 [MIT 라이선스](https://github.com/potatosalad775/modernGraphTool/blob/main/LICENSE)로
배포되는 데 동의하는 것으로 간주됩니다.