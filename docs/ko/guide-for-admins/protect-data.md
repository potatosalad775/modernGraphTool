---
title: 데이터 무단 수집 방지
description: 그래프와 사이트 간 검색은 그대로 두면서, 측정 파일을 한꺼번에 내려받기 어렵게 만드는 서버 규칙을 안내합니다.
editUrl: true
head: []
template: doc
sidebar:
  order: 6
  hidden: false
  attrs: {}
pagefind: true
draft: false
---

modernGraphTool은 정적 페이지라서, 브라우저가 그래프에 그리는 측정 데이터를 CrinGraph와 마찬가지로 평범한 `.txt` 파일로 내려받습니다. 아쉽게도 이 때문에 데이터베이스를 통째로 복사하기가 쉬워집니다. 스크립트 하나로 `phone_book.json`을 읽고, 파일 이름을 만들어 몇 분 만에 전부 내려받을 수 있습니다.

**이를 완전히 막을 수는 없습니다.** 브라우저가 내려받을 수 있는 것은 작정한 스크립트도 내려받을 수 있고, 그래프의 수치는 어차피 브라우저 개발자 도구에서 보입니다. 어떤 마법을 써서 수치를 모두 숨긴다 해도, usytrace 같은 도구로 그래프를 따라 그려 데이터를 뽑아낼 수 있습니다.

대신 할 수 있는 일은 손쉬운 스크립트를 돌려보내고, 대량 다운로드를 수고에 비해 얻을 게 없을 만큼 느리게 만드는 것입니다. 아래의 모든 방법은 서버에서 동작합니다. 데이터 파일이나 `phone_book.json`은 전혀 바뀌지 않으므로 CrinGraph 동시 운영도 그대로 유지됩니다.

:::caution[`phone_book.json`은 막지 마세요]
사이트 간 검색과 사이트 선택기는 스크립트로 각 데이터베이스의 `phone_book.json`을 읽어 만들어집니다. 이 페이지의 모든 규칙은 `.txt` 파일만 대상으로 합니다. `phone_book.json`까지 막으면 squig.link를 포함한 모든 사이트의 사이트 간 검색에서 내 기기가 사라질 수 있습니다.
:::

## Apache (`.htaccess`) \{#apache-htaccess\}

`.htaccess` 파일을 허용하는 Apache 호스팅이라면 어디서든 동작하며, 대부분의 공유 호스팅이 여기에 해당합니다. **`data/` 폴더 안에** (사이트 루트에 있는 것이 아니라 `phone_book.json` 옆에) `.htaccess` 파일을 만들고 다음 내용을 넣으세요.

```apache
# /data/phones/ 를 직접 열었을 때 폴더 내용 목록을 보여주지 않습니다.
Options -Indexes

<IfModule mod_rewrite.c>
	RewriteEngine On

	# 1. 흔히 쓰이는 다운로드 도구와 스크립트 라이브러리를 User-Agent로 차단합니다.
	#    모든 브라우저는 User-Agent를 보내므로, 빈 User-Agent도 차단합니다.
	RewriteCond %{HTTP_USER_AGENT} ^-?$ [OR]
	RewriteCond %{HTTP_USER_AGENT} (curl|wget|python|aiohttp|httpx|scrapy|go-http-client|node-fetch|axios|undici|okhttp|libwww-perl|java/|headlesschrome) [NC]
	RewriteRule \.txt$ - [F,NC]

	# 2. 측정 파일은 페이지 자신에게만 제공합니다. 그래프가 파일을 불러올 때 브라우저는
	#    "Sec-Fetch-Site: same-origin"을 보냅니다. 파일 URL을 직접 열면 "none"을,
	#    다른 웹사이트가 불러오면 "cross-site"를 보냅니다.
	#    이 헤더를 아예 보내지 않는 오래된 브라우저에는 그대로 제공됩니다.
	RewriteCond %{HTTP:Sec-Fetch-Site} ^(none|cross-site)$ [NC]
	RewriteRule \.txt$ - [F,NC]
</IfModule>
```

차단된 요청은 **403 Forbidden**을 받고, 페이지는 평소처럼 동작합니다. 규칙이 적용됐는지 확인하려면 측정 파일 하나를 브라우저 주소창에서 직접 열어 보세요. 수치 대신 403 오류가 보이면 됩니다.

각 부분이 막는 것은 다음과 같습니다.

- **`Options -Indexes`** 는 `phone_book.json`을 읽지도 않고 `phones/` 폴더 목록을 통째로 보고 내려받는 것을 막습니다. 많은 호스팅이 이미 목록 표시를 꺼 두지만, 이 줄을 넣으면 확실해집니다.
- **규칙 1** 은 자신을 `curl`, `wget`, Python 등으로 밝히는 스크립트를 돌려보냅니다. 급하게 만든 수집 스크립트는 대부분 이 헤더를 바꾸지 않습니다.
- **규칙 2** 는 브라우저로 파일을 하나씩 내려받는 것과, 다른 사이트가 내 서버에서 측정 데이터를 불러가는 것을 막습니다.

:::caution[사이트에 "500 Internal Server Error"가 뜬다면]
일부 호스팅은 `.htaccess`에서 `Options` 변경을 허용하지 않습니다. `Options -Indexes` 줄을 지우고 페이지를 새로고침하세요. 재작성 규칙은 이 줄 없이도 동작합니다.
:::

이 규칙들은 잠금장치가 아니라 과속방지턱입니다. 스크립트도 Chrome인 척하며 브라우저와 똑같은 헤더를 보낼 수 있습니다. 그런 스크립트까지 느리게 만드는 것은 아래의 요청 속도 제한입니다.

:::note[다른 앱이 `.txt` 파일을 직접 읽나요?]
측정 파일을 내려받는 별도 도구(앱, 직접 만든 스크립트, 협력 사이트 등)를 운영한다면 규칙 1과 2가 그 도구도 차단합니다. 각 규칙의 첫 번째 조건으로 `RewriteCond %{HTTP_USER_AGENT} !MyTool` 처럼 예외를 추가하세요. `[OR]` 플래그가 없으면 조건은 다음 조건과 AND로 묶입니다.
:::

### Apache에서 요청 속도 제한 \{#rate-limiting-on-apache\}

Apache는 `.htaccess` 파일만으로 방문자별 요청 수를 셀 수 없으므로, 공유 호스팅에서는 자체적으로 속도 제한을 걸 수 없습니다. 공유 호스팅이라면 사이트 앞에 [Cloudflare](#cloudflare)를 두세요.

서버를 직접 운영한다면 `mod_evasive`나 `mod_qos` 모듈로 너무 빠르게 많은 요청을 보내는 주소를 차단할 수 있습니다. 둘 중 무엇을 조정하든, 일반적인 페이지 로드도 1~2초 안에 수십 개의 파일을 불러온다는 점을 기억하세요. 샘플이 여러 개인 기기는 샘플마다 파일이 두 개씩 늘고, 기기를 비교하는 사람은 몇 초마다 파일을 추가로 불러옵니다. 일반적인 웹 페이지 기준이 아니라 이 사용 패턴을 기준으로 한도를 정하세요.

## `robots.txt` \{#robotstxt\}

`robots.txt`는 차단이 아니라 정중한 요청입니다. 검색 엔진과 주요 AI 크롤러는 이를 따르지만, 수집 스크립트는 무시합니다. 그래도 측정 데이터가 검색 결과나 규칙을 지키는 AI 학습용 크롤링에 들어가지 않게 해 줍니다. 사이트 루트의 `robots.txt`에 다음 줄을 추가하세요.

```text
User-agent: *
Disallow: /data/phones/
Disallow: /data/target/
```

`phone_book.json`은 계속 크롤링될 수 있도록, **`/data/` 전체가 아니라** 두 폴더만 막으세요. 사이트가 하위 디렉터리에 있다면 경로에 그 디렉터리도 포함하세요(예: `/iems/data/phones/`).

## Cloudflare \{#cloudflare\}

도메인이 [Cloudflare](https://www.cloudflare.com/)를 거친다면(무료 요금제로 충분합니다), 어떤 호스팅에서든 브라우저인 척하는 스크립트의 대량 다운로드까지 막을 수 있습니다.

- **요청 속도 제한 규칙** (_Security → WAF → Rate limiting rules_). URI 경로가 `.txt`로 끝나는 요청을 IP 주소별로 세고, 한도를 넘으면 일정 시간 차단하세요. 10초에 약 50개 정도로 잡으면, 샘플 세트를 불러오고 여러 기기를 빠르게 비교하는 사람에게도 충분한 여유가 있습니다. 데이터베이스 전체를 내려받는 스크립트는 이 한도를 훨씬 넘깁니다. 무료 요금제는 짧은 집계 기간만 허용하니, 대시보드에서 요금제별 한도를 확인하세요.
- **봇 차단** (_Security → Bots_). _Bot Fight Mode_ 와 _Block AI bots_ 는 알려진 자동화 클라이언트를 서버에 닿기 전에 사이트 전체에서 돌려보냅니다.

이 페이지 맨 위에서 설명한 이유로, 사이트 전체에 적용되는 규칙은 `phone_book.json`에 걸리지 않게 하세요. 규칙을 바꾼 뒤에는 사이트를 열어 기기 몇 개를 추가해 그래프가 여전히 불러와지는지 확인하고, 사이트 간 검색도 한 번 써 보세요.

## GitHub Pages \{#github-pages\}

GitHub Pages는 `.htaccess` 파일이나 별도 서버 규칙을 지원하지 않으므로 [`robots.txt`](#robotstxt) 단계만 적용됩니다. 요청 속도 제한을 쓰려면 사이트에 사용자 지정 도메인을 연결하고 [Cloudflare](#cloudflare)를 거치도록 하세요.