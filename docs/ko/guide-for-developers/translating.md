---
title: 번역하기
description: Fink로 브라우저에서 modernGraphTool을 번역하세요. 코드도 git도 필요 없고, GitHub 계정만 있으면 됩니다.
editUrl: true
head: []
template: doc
sidebar:
  order: 5
  hidden: false
  attrs: {}
pagefind: true
draft: false
---

modernGraphTool의 인터페이스는 사용자들이 번역합니다. 코드를 알거나 git을 쓰거나 무언가를 설치할
필요는 없습니다. 번역은 [Fink](https://fink.inlang.com)에서 합니다. 브라우저에서 돌아가는 무료
편집기로, 수정한 내용을 풀 리퀘스트로 만들어 줍니다.

**[Fink에서 modernGraphTool 열기 →](https://fink.inlang.com/?repo=potatosalad775/modernGraphTool&project=project.inlang)**

:::tip[일부만 번역해도 환영합니다]
번역하지 않은 부분은 영어로 표시됩니다. 문자열 열 개만 번역해도 보낼 가치가 있고, 이어서 할 사람은
멈춘 곳부터 이어 갈 수 있습니다.
:::

## 필요한 것 \{#what-you-need\}

- 무료 [GitHub 계정](https://github.com/signup). 계정 없이도 편집기를 써 볼 수는 있지만, 로그인하기
  전까지 수정 내용은 브라우저에만 남습니다.
- 내 계정에 설치한 **Inlang GitHub App**:
  [github.com/apps/inlang/installations/new](https://github.com/apps/inlang/installations/new).
  Fink가 저장소의 내 사본(포크)에 작업을 저장할 수 있게 해 줍니다. Fink 계정 메뉴의
  **Grant repository access**에서도 같은 페이지가 열립니다.

## 기존 언어 번역하기 \{#translating-an-existing-language\}

1. [Fink에서 프로젝트](https://fink.inlang.com/?repo=potatosalad775/modernGraphTool&project=project.inlang)를
   엽니다.
2. 언어 메뉴에서 **From**은 영어로 두고, **Translate into**에서 내 언어를 고릅니다.
3. **To do** 필터를 고릅니다. 내 언어에 빠져 있거나 문제가 있는 문자열이 모두 나열됩니다.
4. 문자열을 클릭하고 입력합니다. **Start from English**를 누르면 영어 원문이 복사되어 덮어쓸 수
   있습니다. 작업 내용은 입력하는 대로 브라우저에 저장됩니다.
5. 다 끝나면 [번역 보내기](#sending-your-translation)를 따라 하세요.

## 새 언어 추가하기 \{#adding-a-new-language\}

누구에게 먼저 물어볼 필요가 없습니다. 어떤 언어든 Fink에서 직접 추가할 수 있습니다.

1. 로그인한 뒤 아래쪽 막대에서 **Fork**를 고릅니다. 2단계보다 **먼저** 하세요. Settings 탭의 변경은
   포크로 옮겨지지 않습니다.
2. **Settings** 탭에서 언어 목록에 내 언어 코드를 추가합니다. 독일어는 `de`, 일본어는 `ja`, 브라질
   포르투갈어는 `pt-BR` 같은 식입니다. 내 언어의
   [IETF 언어 태그](https://en.wikipedia.org/wiki/IETF_language_tag)를
   쓰세요.
3. 위와 같이 번역합니다. 그 언어의 파일은 첫 번역을 푸시할 때 만들어집니다.

풀 리퀘스트가 병합되면 새 언어가 앱의 언어 선택기에 그 언어의 이름으로 나타나고, 브라우저가 그
언어를 선호하는 방문자에게는 자동으로 선택됩니다.

## 번역 보내기 \{#sending-your-translation\}

1. 아직 하지 않았다면 아래쪽 막대에서 **Fork**를 고릅니다. Fink가 저장소의 내 사본을 만들고 수정
   내용을 그리로 옮깁니다.
2. **Review**로 모든 변경을 확인한 뒤 **Push**를 누릅니다.
3. **Open pull request**를 고릅니다. 내용이 채워진 GitHub 페이지가 열리면, 무엇을 번역했는지 적고
   제출하세요.

이것으로 끝입니다. 메인테이너가 검토하고, 번역은 다음 릴리스에 포함됩니다. 자세한 내용은 Fink의
[포크와 풀 리퀘스트 안내](https://fink.inlang.com/docs/branches-forks-and-pull-requests)(영어)에
있습니다.

## 그대로 둘 것 \{#what-to-keep-as-is\}

- **중괄호 안의 자리표시자**, 예를 들어 `{count}`나 `{name}`. 문법에 맞게 위치는 옮겨도 되지만,
  번역하거나 이름을 바꾸지 마세요. 하나가 빠지면 Fink가 경고합니다.
- **제품 이름**: modernGraphTool, squig.link, uniPEQ, AutoEQ, CrinGraph.
- **메시지 자체.** Fink에서 메시지를 추가·삭제하거나 이름을 바꾸지 마세요. 그런 변경은 코드 변경과
  함께 가야 하므로 일반 풀 리퀘스트로 보내야 합니다.

**개수 표현.** 영어 문장이 숫자에 따라 바뀌면("1 band", "2 bands") Fink는 그 메시지를 여러 형태로
보여 줍니다. 내 언어에 영어와 다른 형태가 필요하면 **Split by \{count\}**를 고르세요. Fink가 필요한
형태를 추가합니다. 예를 들어 체코어나 우크라이나어는 1, 2–4, 5 이상에 각각 다른 형태를 씁니다. 한국어는
형태가 하나라 나눌 필요가 없습니다. Fink의
[복수형 안내](https://fink.inlang.com/docs/plurals-and-selects)(영어)를 참고하세요.

## 오프라인으로 번역하기 \{#translating-offline\}

텍스트 편집기로 작업하고 싶거나 Fink로 GitHub를 쓸 수 없다면, 파일 기반 대안이 있습니다. 언어마다
아직 빠진 키를 영어 원문으로 채워 둔 `messages/_missing_translations_<locale>.json` 파일이 있을 수
있습니다. 번역할 수 있는 값은 바꾸고, 못 하는 값은 지운 뒤, 그 파일로 풀 리퀘스트를 여세요. 자세한
내용은 [번역 기여 흐름](./i18n.mdx#translation-contribution-flow)에 있습니다.