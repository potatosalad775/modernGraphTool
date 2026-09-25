---
title: 개발자 가이드
description: modernGraphTool에 기여하기 위한 아키텍처, 프로젝트 구조, 빌드 명령을 다룹니다.
editUrl: true
head: []
template: doc
sidebar:
  order: 1
  label: 개요
  hidden: false
  attrs: {}
pagefind: true
draft: false
---

이 가이드는 modernGraphTool 자체를 개발하는 분들을 위한 문서입니다. 데이터베이스를 운영하려는 것이라면 [운영자 가이드](../guide-for-admins/index.mdx)를 보세요.

기여를 환영합니다. 코드 스타일과 PR 가이드라인은 [CONTRIBUTING.md](https://github.com/potatosalad775/modernGraphTool/blob/main/CONTRIBUTING.md)에서 확인하세요. 이 섹션의 나머지 문서는 다음을 다룹니다.

- **[테스트](./testing.mdx)** — 두 개의 Vitest 프로젝트, 커버리지, 스모크 테스트.
- **[빌드 및 배포 내부 구조](./build-and-deploy.mdx)** — 빌드 산출물과 `defaults/`가 그 안에 들어가는 방식.
- **[국제화](./i18n.mdx)** — UI 문자열, 언어 추가, 번역 기여 흐름.

## 기술 스택

- **언어**: TypeScript (strict)
- **프레임워크**: SvelteKit 2 + Svelte 5 (Runes)
- **스타일링**: Tailwind CSS 4 + bits-ui (헤드리스 접근성 컴포넌트)
- **그래프 렌더링**: D3.js (SVG 기반)
- **i18n**: Paraglide JS (컴파일 타임 국제화)
- **테스트**: Vitest, 컴포넌트 스펙은 Playwright 브라우저 모드
- **빌드 출력**: `adapter-static`을 통한 정적 SPA → `dist/`

## 프로젝트 구조

```
src/
├── routes/              # SvelteKit 라우트 (단일 페이지 SPA) + layout.css (Tailwind 진입점)
├── lib/
│   ├── components/      # UI: atoms, controls, equalizer, features, graph, layout, panels
│   ├── stores/          # 클래스 인스턴스 형태의 반응형 상태 (.svelte.ts)
│   ├── services/        # 데이터 제공자, 명령, 크로스 사이트 인덱스, 오디오, 분석
│   ├── graph/           # D3.js 그래프 엔진과 오버레이
│   ├── device-peq/      # 하드웨어 EQ 전송 계층과 기기별 핸들러
│   ├── workers/         # 메인 스레드 밖에서 도는 AutoEQ (turboEQ wasm + 대체 엔진)
│   ├── utils/           # 파싱, 정규화, 스무딩, URL 인코딩, 설정
│   ├── types/           # TypeScript 타입 정의
│   └── paraglide/       # 자동 생성된 i18n 함수 (수정 금지)
└── app.html             # HTML 템플릿 (config.js와 theme.css 로드)
defaults/                # 운영자가 수정하는 config.js, theme.css, 샘플 데이터
messages/                # Paraglide 원본, 로케일마다 JSON 파일 하나
cdn/                     # CDN 배포 템플릿 (얇은 index.html + loader.js)
scripts/                 # CDN·사이트 템플릿 빌드, 부트 매니페스트, i18n 도구
site-template/           # GitHub Pages 템플릿 저장소의 원본
docs/                    # 이 문서 사이트 (Astro + Starlight)
```

`src/lib/` 아래 대부분의 디렉터리에는 해당 영역의 규칙을 정리한 `AGENTS.md`가 있습니다. 그 영역의 코드를 바꾸기 전에 먼저 읽어 보세요.

## 빌드 명령

| 명령                          | 설명                                                 |
| ----------------------------- | ---------------------------------------------------- |
| `npm run dev`                 | 개발 서버 실행 (http://localhost:5173)               |
| `npm run build`               | `dist/`로 프로덕션 빌드                              |
| `npm run build:cdn`           | `dist-cdn/`으로 CDN 최적화 빌드                      |
| `npm run build:site-template` | `dist-site-template/`으로 GitHub Pages 템플릿 빌드   |
| `npm run preview`             | 빌드된 결과물 미리 보기                              |
| `npm run check`               | TypeScript + Svelte 타입 체크                        |
| `npm run test`                | 모든 Vitest 테스트 실행                              |
| `npm run lint`                | ESLint + Prettier 검사                               |
| `npm run format`              | 코드 자동 포매팅                                     |