---
title: Frequency Tutorial
editUrl: true
head: []
template: doc
sidebar:
  hidden: false
  attrs: {}
pagefind: true
draft: false
---

Frequency Tutorial은 그래프 위에 Sub Bass, Bass, Lower Mids, Upper Mids, Presence, Brilliance 대역을 라벨로 표시하고, 각 대역이 소리에 어떤 역할을 하는지 짧게 설명합니다. 아직 FR 그래프 읽기에 익숙하지 않은 방문자를 위한 기능입니다. 사용법은 [외관 및 언어](../guide-for-users/appearance-and-language.mdx#frequency-tutorial)를 참고하세요.

그래프 공간을 확보하기 위해 기본적으로 숨겨져 있습니다. 모바일에서는 그래프와 모든 패널 사이에 자리를 차지하기 때문입니다. 방문자는 그래프 툴바(모바일에서는 그래프 패널)의 **주파수 가이드** 버튼으로 표시하며, 이 선택은 기기에 기억됩니다. 라벨은 UI 문자열이므로 방문자가 고른 언어를 따릅니다.

처음 방문한 사용자에게 보여주고 싶다면 [`INTERFACE.SHOW_FREQUENCY_TUTORIAL_ON_INITIAL_LOAD`](../guide-for-admins/customize-page.mdx#show_frequency_tutorial_on_initial_load)를 `true`로 설정하세요. 방문자가 직접 끈 경우에는 꺼진 상태가 유지됩니다. 문구는 앱 번역과 함께 배포되므로, 바꾸려면 소스에서 빌드해야 합니다. [국제화](../guide-for-developers/i18n.mdx#frequency-tutorial-text)를 참고하세요.