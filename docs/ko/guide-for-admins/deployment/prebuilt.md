---
title: 사전 빌드 릴리스
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

사전 빌드된 modernGraphTool 릴리스를 내려받아 `dist/` 폴더 전체를 직접 호스팅하는 방식입니다. 수동 업데이트를 감수하는 대신, 어떤 버전이 언제 동작할지 완전히 통제할 수 있습니다.

## 개요

사전 빌드 릴리스는 그 자체로 완결된 정적 사이트입니다. 압축을 풀고 설정과 데이터를 채워 넣은 뒤 폴더 전체를 웹 서버에 올리면 끝입니다. jsDelivr에 대한 런타임 의존성도, 버전 감지 로직도, 자동 업데이트도 없습니다. 사용자에게 무엇을 보여줄지 운영자가 직접 정합니다.

## 추천 대상

**추천**

- 업데이트 시점을 직접 정하고 싶을 때
- 에어갭, 인트라넷처럼 jsDelivr에 닿을 수 없는 환경

**비추천**

- 릴리스마다 파일을 다시 업로드하고 싶지 않은 운영자

## 설치

1.  **다운로드** — [최신 릴리스 zip](https://github.com/potatosalad775/modernGraphTool/releases)을 내려받습니다.
2.  **압축 해제** — 압축을 푼 폴더가 곧 완전한 사이트입니다. 배포에 필요한 모든 파일이 들어 있습니다.
3.  **설정 파일 수정**
    - `config.js` — 애플리케이션 설정 ([페이지 커스터마이징](../customize-page.mdx) 참고)
    - `theme.css` — 그래프 색상 테마 ([페이지 스타일 커스터마이징](../customize-page.mdx#customizing-page-styles-themecss) 참고)
    - `data/` — 측정 데이터와 타겟 커브 ([데이터 관리](../manage-data.mdx) 참고)
4.  **폴더 전체 업로드** — FTP 등으로 폴더 전체를 웹 서버에 올립니다. 끝났습니다. 브라우저에서 페이지를 열어 잘 로드되는지 확인하세요.

## 폴더 구조

릴리스를 풀면 다음과 같은 구조가 보입니다.

```
dist/                     # (또는 압축을 푼 릴리스 폴더)
├── config.js             # 애플리케이션 설정 — 사용자 편집
├── theme.css             # 그래프 색상 테마 — 사용자 편집
├── index.html            # HTML 진입점 — 메타데이터 편집 가능
├── .htaccess             # Apache SPA 폴백, 캐시, 압축
├── data/
│   ├── phones/           # 측정 데이터 파일 (.txt) — 사용자 편집
│   ├── target/           # 타겟 커브 데이터 파일 (.txt) — 사용자 편집
│   ├── phone_book.json   # 기기 목록 정의 — 사용자 편집
│   ├── Bounds U.txt      # 선호도 경계 상한 (선택) — 사용자 편집
│   └── Bounds D.txt      # 선호도 경계 하한 (선택) — 사용자 편집
├── assets/               # 이미지, 문자열 등 — 사용자 편집
└── _app/                 # 빌드된 애플리케이션 번들 — 편집 금지
```

**사용자 편집** 표시가 붙은 파일은 자유롭게 수정해도 됩니다. `_app/` 폴더에는 빌드된 애플리케이션이 들어 있으니 손대지 마세요. 릴리스를 갱신할 때마다 통째로 덮어써집니다.

## 캐시와 압축 \{#caching-and-compression\}

Apache에서는 함께 들어 있는 `.htaccess`가 캐시 기간과 압축도 설정합니다. 모든 규칙이 `<IfModule>` 가드 안에 있으므로 해당 모듈이 없는 호스트는 그냥 무시하며, SPA 폴백은 그대로입니다. Apache가 아닌 호스트는 파일 전체를 무시합니다. squig.link가 그런 경우로, 캐시와 압축은 squig.link 쪽 설정을 따릅니다.

- **`_app/immutable/`** 는 1년간 캐시됩니다(`public, max-age=31536000, immutable`). 파일 이름에 내용 해시가 들어 있어, 새 릴리스는 새 URL이 됩니다.
- **`index.html`, `config.js`, `theme.css`, `_app/version.json`, `data/`** 는 `Cache-Control: no-cache`로 내려갑니다. 브라우저가 사본을 보관하되 매번 서버에 먼저 확인하므로, 업로드한 수정 사항이 다음 로드에 바로 반영되고 바뀌지 않은 파일은 `304` 응답만 받습니다.
- **텍스트 형식**(HTML, CSS, JavaScript, JSON, SVG, WebAssembly)은 `mod_brotli` / `mod_deflate`가 있으면 Brotli와 gzip으로 압축됩니다.

다른 서버에서도 같은 세 가지가 필요합니다. 경로는 배포하는 폴더 기준입니다.

| 경로                                                                | `Cache-Control`                       |
| ------------------------------------------------------------------- | ------------------------------------- |
| `_app/immutable/*`                                                  | `public, max-age=31536000, immutable` |
| `index.html`, `config.js`, `theme.css`, `_app/version.json`, `data/*` | `no-cache`                            |

nginx에서는 `root`로 사이트를 서빙하는 `server` 블록 안에 다음을 넣습니다.

```nginx
gzip on;
gzip_types text/css text/plain application/javascript application/json image/svg+xml application/wasm;

location /_app/immutable/ {
  add_header Cache-Control "public, max-age=31536000, immutable";
}
location ~ ^/(index\.html|config\.js|theme\.css|_app/version\.json)$ {
  add_header Cache-Control "no-cache";
}
location /data/ {
  add_header Cache-Control "no-cache";
}
location / {
  try_files $uri $uri/ /index.html;
}
```

헤더 파일을 지원하는 정적 호스팅(Netlify, Cloudflare Pages)에서는 같은 내용의 `_headers` 파일을 사용합니다.

```text
/_app/immutable/*
  Cache-Control: public, max-age=31536000, immutable
/index.html
  Cache-Control: no-cache
/config.js
  Cache-Control: no-cache
/theme.css
  Cache-Control: no-cache
/data/*
  Cache-Control: no-cache
```

이런 호스팅은 이미 텍스트 응답을 압축합니다. GitHub Pages는 자체적으로 짧은 캐시 기간을 지정하며 바꿀 수 없습니다.

## 앱 업데이트

사전 빌드 릴리스는 수동 업데이트가 필요합니다. 안전한 절차는 다음과 같습니다.

1.  **현재 배포 백업** — `config.js`, `theme.css`, `data/`, `assets/`, 그리고 직접 손본 `index.html`을 따로 보관해 두세요.
2.  **새 릴리스 다운로드** — [릴리스 페이지](https://github.com/potatosalad775/modernGraphTool/releases)에서 받아 압축을 풉니다.
3.  **수정한 파일을 다시 복사**
    - `config.js`
    - `theme.css`
    - `data/` (폴더 전체 — phones, targets, `phone_book.json`, bounds)
    - `assets/` (폴더 전체)
    - `index.html` — **직접 수정한 경우에만** 옮깁니다(OG 태그, 분석 등). 손대지 않았다면 업스트림 개선을 받기 위해 새 릴리스의 `index.html`을 그대로 쓰세요.
4.  **합쳐진 폴더를 서버에 업로드**해 기존 배포를 덮어씁니다.
5.  **[변경 이력](../../changelog.mdx)**에서 주의가 필요한 config 스키마 변경이 있는지 확인하세요.

:::caution[데이터를 덮어쓰지 마세요]
가장 흔한 업데이트 실수는 새 릴리스를 운영 중인 배포 위에 그대로 풀어버리는 것입니다. 이렇게 하면 `config.js`나 `data/`가 기본 템플릿으로 덮여버립니다. 반드시 먼저 백업하거나 복사해 두세요.
:::

## 보안 헤더 (선택)

릴리스의 `.htaccess`에는 권장 Content-Security-Policy와 보안 헤더 세 가지가 꺼진 상태로 함께 들어 있습니다. 하는 일과 켜는 방법은 [보안 헤더](./security-headers.mdx)를 참고하세요. 켰다면 업데이트할 때마다 새 릴리스의 `Content-Security-Policy` 줄을 가져와야 합니다. 이 줄은 해당 릴리스에 맞춰 만들어지기 때문입니다.

## 문제 해결

### 기기 선택기에 데이터가 보이지 않음

**원인** — `config.js`의 `PATH` 설정이 실제 폴더 구조와 맞지 않거나, `phone_book.json`이 없거나 잘못되었습니다.

**해결** — `PATH`의 `PHONE_MEASUREMENT`, `TARGET_MEASUREMENT`, `PHONE_BOOK`이 실제 파일을 가리키는지 확인하세요. 브라우저 네트워크 탭에서 어떤 요청이 404를 내는지도 확인할 수 있습니다. 예상 구조는 [데이터 관리](../manage-data.mdx)를 참고하세요.

### 로컬에서는 잘 되는데 서버에서는 안 됨

**원인** — 대소문자 구분 문제. Windows와 macOS 파일 시스템은 기본적으로 대소문자를 구분하지 않지만, 대부분의 Linux 웹 서버는 구분합니다. 디스크의 `Harman IE 2019v2.txt`는 `harman ie 2019v2.txt` 요청과 일치하지 않습니다.

**해결** — 파일명을 `phone_book.json` 항목과 정확히 일치시키세요. 대소문자까지 그대로요.

### 선호도 경계가 그려지지 않음

**원인** — `Bounds U.txt`와 `Bounds D.txt`가 `data/`에 없습니다.

**해결** — 두 파일을 `data/` 바로 아래(하위 폴더가 아니라)에 두세요. 파일 형식은 [선호도 경계 기능 문서](../../features/preference-bound.mdx)를 참고하세요.