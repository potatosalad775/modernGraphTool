---
title: squig.link 연동
editUrl: true
head: []
template: doc
sidebar:
  hidden: false
  attrs: {}
pagefind: true
draft: false
---

`*.squig.link` 도메인에서 운영하는 사이트에는 기본 기능 외에 네트워크 전체를 위한 기능이 몇 가지 더해집니다. squig.link에서는 자동으로 켜지고, 다른 호스트에서는 동작하지 않습니다.

- **쇼핑 링크** — 불러온 기기가 squig.link 쇼핑 데이터베이스에 있으면 스폰서 판매 페이지로 가는 **Buy Now** 버튼을 표시합니다.
- **스폰서 배너** — 첫 방문 시 squig.link 네트워크가 제공하는 스폰서 대화상자를 띄웁니다.
- **분석** — 사용 이벤트를 squig.link의 공용 Google Tag Manager 컨테이너(CrinGraph 사이트들이 보고하는 바로 그 컨테이너)와, 직접 추가한 GA4 속성이나 컨테이너로 보냅니다.

각 기능을 끄거나 본인의 분석 ID를 추가하는 것은 `config.js`의 [`SQUIGLINK`](../guide-for-admins/customize-page.mdx#squiglink)에서 합니다.

## 분석과 동의 \{#analytics-and-consent\}

분석은 사이트 이름(`ANALYTICS_SITE`), 그래프에 추가하거나 제거한 기기(브랜드, 모델, 변형), 그리고 두 가지 클릭 이벤트(스크린샷 다운로드, 쇼핑 링크)를 보냅니다.

이벤트는 squig.link의 공용 Tag Manager 컨테이너로 전송되며, ID를 따로 지정할 필요가 없습니다. CrinGraph의 `graphAnalytics.js`가 불러오는 것과 같은 컨테이너이고, 이벤트도 같은 형식으로 받습니다(그래프에 기기를 추가하면 `phone_displayed`). 자체 통계도 함께 보려면 GA4 측정 ID(`G-…`)나 Tag Manager 컨테이너(`GTM-…`)를 `ANALYTICS_MEASUREMENT_IDS`에 넣으세요. 그 외 형식은 콘솔 경고와 함께 건너뜁니다. 컨테이너는 CrinGraph 형식의 이벤트를, GA4 ID는 `gtag` 이벤트(`phone_added`, `phone_removed`, `clicked_download`, `shoplink_click`)를 받습니다.

모든 방문자에 대해 끄려면 `ENABLE_ANALYTICS: false`로 설정하세요.

누가 어떻게 측정되는지는 다음과 같습니다.

- **브라우저가 [Global Privacy Control](https://globalprivacycontrol.org/)을 보내는 방문자**에게는 분석을 아예 불러오지 않습니다.
- **그 밖의 모든 방문자**는 기타 패널의 **설정**에서 **사용 통계** 스위치를 볼 수 있습니다. 이를 끄면 이벤트 전송이 즉시 멈추고, 다음 방문부터는 Global Privacy Control과 마찬가지로 아무것도 불러오지 않습니다. 선택은 해당 브라우저에 저장되며 운영자의 기본값보다 우선합니다.
- **방문자가 선택하기 전에는** [Consent Mode](https://developers.google.com/tag-platform/security/guides/consent)가 `ANALYTICS_CONSENT`에서 시작합니다. 기본값인 `"granted"`는 `_ga` 쿠키를 사용해 평소처럼 측정합니다. `"denied"`는 쿠키를 설정하지 않고 쿠키 없는 핑만 보내며, Google Analytics는 이를 모델링된 데이터로만 보고합니다. 방문자가 설정을 켜기 전까지 그렇습니다.

광고 신호 세 가지(`ad_storage`, `ad_user_data`, `ad_personalization`)는 이 도구가 광고를 표시하지 않으므로 항상 거부됩니다. 페이지는 표준 `gtag` 함수를 정의하므로, 직접 만든 동의 배너에서 `gtag('consent', 'update', { analytics_storage: 'granted' })`를 호출하면 컨테이너와 GA4 ID 모두에 그대로 적용됩니다. 컨테이너는 `dataLayer`와 분리된 자체 데이터 레이어(`gtmDataLayer`)를 읽으므로 이벤트가 두 번 집계되지 않습니다.

이 스위치는 동의 배너가 아닙니다. 측정 전에 동의를 받아야 하는 지역의 방문자에게서 데이터를 수집한다면 동의를 받을 책임은 여전히 운영자에게 있습니다. 그런 경우를 위한 설정이 `ANALYTICS_CONSENT: "denied"`에서 시작하는 것입니다.

:::note[크로스 사이트 검색과 사이트 선택기는 어디서나 동작합니다]
크로스 사이트 검색은 예전에는 squig.link 전용이었습니다. 지금은 사이트 선택기와 함께 어떤 호스트에서나 동작하며, 각자 별도의 설정 섹션이 있습니다. [크로스 사이트 검색](./cross-site-search.mdx)과 [사이트 선택기](./site-selector.mdx)를 참고하세요. squig.link에서는 통합 인덱스에 접근할 수 없을 때 여전히 각 사이트의 `phone_book.json`을 직접 수집하는 방식으로 대체합니다.
:::