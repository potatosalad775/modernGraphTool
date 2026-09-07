---
title: 빌드 및 배포 내부 구조
editUrl: true
head: []
template: doc
sidebar:
  order: 3
  hidden: false
  attrs: {}
pagefind: true
draft: false
---

세 가지 빌드 산출물이 어떻게 만들어지는지 설명합니다. modernGraphTool을 _배포_ 하는 방법만 알고
싶다면 [운영자 가이드 → 배포](../guide-for-admins/deployment/prebuilt.mdx)를 보세요. 이 문서는 빌드
자체가 어떻게 동작하는지를 다룹니다.

## 산출물 \{#outputs\}

| 명령어                        | 산출물                | 내용                                                     |
| ----------------------------- | --------------------- | -------------------------------------------------------- |
| `npm run build`               | `dist/`               | 정적 SPA. 사전 렌더링되며 `.htaccess`로 SPA 폴백 제공    |
| `npm run build:cdn`           | `dist-cdn/`           | jsDelivr에 올린 애셋을 불러오는 얇은 로더                |
| `npm run build:site-template` | `dist-site-template/` | GitHub Pages 템플릿 저장소                               |

CDN 빌드는 얇은 `cdn-index.html` 로더와 `cdn/loader.js`를 생성합니다. `_app/` URL을 바꾸려면
`MGT_CDN_BASE`를 설정하세요.

## `defaults/` 메커니즘 \{#the-defaults-mechanism\}

Vite 플러그인이 개발 중에는 `defaults/`를 폴백으로 서빙하고, 빌드 시에는 그 내용을 `dist/`로
복사합니다. 이때 `static/` 아래에 이미 존재하는 파일은 **덮어쓰지 않습니다.** 운영자가 직접 수정한
내용이 업그레이드 후에도 살아남는 이유가 바로 이것입니다.

운영자가 `dist/`에서 수정할 것으로 예상되는 파일은 `config.js`, `theme.css`, `data/`,
`assets/strings/`입니다.

:::caution
**`static/`이나 `defaults/`에서 모듈을 import하지 마세요.** 런타임에 `fetch()`로 읽어야 합니다.
이들은 빌드 입력이 아니라 운영자가 편집하는 배포 산출물입니다. import하면 사본이 번들에 구워져,
운영자의 수정이 아무 반응 없이 적용되지 않게 됩니다.
:::

## GitHub Pages 템플릿 \{#github-pages-template\}

[potatosalad775/modernGraphTool_site](https://github.com/potatosalad775/modernGraphTool_site)는
운영자가 "Use this template"으로 복사하는 별도 저장소입니다.

이 저장소는 **손으로 관리하는 저장소가 아니라 생성된 산출물입니다.** `npm run build:site-template`이
조립하며, `.github/workflows/sync-site-template.yml`이 `defaults/`, `site-template/`, 또는 해당
스크립트를 건드리는 `main` 푸시마다 결과를 강제로 동기화합니다. 원본은 메인 저장소에서 수정하세요.
템플릿 저장소에 직접 커밋한 내용은 다음 동기화 때 덮어쓰입니다.

- 대부분은 `defaults/`를 그대로 옮긴 것입니다(`theme.css`, `data/`, `assets/`). 이 내용은
  `defaults/`가 바뀌는 즉시 어긋나므로, 동기화가 존재하는 이유 자체가 여기에 있습니다.
- `config.js`는 `defaults/config.js`에서 주석 처리된 `CDN_MODE` 스텁을 잘라내고
  `site-template/config-cdn-mode.js`를 끼워 넣은 결과입니다. 덕분에 새로운 설정 옵션이 별다른 작업
  없이 템플릿까지 전달됩니다. 이 치환은 스텁의 첫 줄과 마지막 줄을 기준으로 이뤄지며, 더 이상
  일치하지 않으면 **예외를 던집니다.** `CDN_MODE`가 살아 있지 않은 템플릿은 빈 페이지가 되는데,
  `index.html`이 로더에 불과하기 때문입니다. 이 파일은 JS _조각_ 이라서 `.prettierignore`와 ESLint
  무시 목록에 들어 있고, 대신 생성된 `config.js`를 빌드 스크립트가 구문 검사합니다.
- `site-template/index.html`은 소스이며 `cdn/cdn-index.html`에서 파생된 것이 **아닙니다.** 공통
  부분은 손으로 맞춰 주세요. 의도적으로 다른 점이 두 가지 있습니다.
  1. 언제나 jsDelivr에서 `loader.js`를 불러옵니다(localhost 분기 없음 — 운영자가 로더를 고쳐 가며
     작업할 일은 없습니다).
  2. `*.github.io` 호스트에서 첫 경로 세그먼트로 `CDN_MODE.BASE_PATH`를 설정하는 인라인 기준 경로
     감지기를 담고 있습니다. 덕분에 `username.github.io/<repo>/`와 `username.github.io/` 모두 설정을
     고치지 않고 동작하며, 저장소 이름을 바꿔도 유지됩니다. 명시적인 `BASE_PATH`가 있으면 그쪽을
     따릅니다. 이 코드가 `cdn/loader.js`가 아니라 템플릿에 있는 이유는, 로더를 고쳐도 다음 `cdn`
     브랜치 배포 이후에야 실제 배포본에 반영되기 때문입니다.
- 이 워크플로에는 `SITE_TEMPLATE_TOKEN` 시크릿이 필요합니다(세분화된 PAT, 템플릿 저장소에 대한
  `Contents: write`). `GITHUB_TOKEN`으로는 다른 저장소에 푸시할 수 없습니다.