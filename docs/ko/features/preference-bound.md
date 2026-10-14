---
title: 선호도 경계
editUrl: true
head: []
template: doc
sidebar:
  hidden: false
  attrs: {}
pagefind: true
draft: false
---

선호도 경계는 청취 선호도 연구를 바탕으로, 대부분의 청취자가 선호하는 주파수 응답 범위를 그래프에 음영 띠로 그려 줍니다. "정확히 한 선에 맞는가"가 아니라 "이 튜닝이 무난한 범위에서 얼마나 벗어나 있는가"에 답하는 기능입니다.

방문자는 타겟 목록 맨 아래의 **선호도 경계** 줄에서 고릅니다. 한 번에 하나만 선택되며, 선택된 경계를 다시 누르면 띠가 꺼집니다. 해석하는 방법은 [타겟과 선호도](../guide-for-users/targets-and-preferences.mdx#preference-bound)를 참고하세요.

## 띠의 정렬 방식

이 띠는 다른 모든 커브처럼 그래프의 정렬 설정(Hz 또는 Avg), 스무딩, 기준선을 따릅니다. 정렬 기준은 띠를 정의하는 Diffuse Field 타겟이 아니라 띠의 **중심**, 즉 상한과 하한의 중간값입니다. DF 타겟이 모든 대역에서 띠 안에 있지는 않기 때문에 이 차이가 중요합니다. 저음역에서는 선호 범위가 DF보다 몇 dB 위에 있습니다.

측정값을 정렬하는 방식 그대로 띠를 정렬하므로, 선호 범위 한가운데에 있는 헤드폰은 어느 주파수에서 정렬하든 띠 한가운데에 놓입니다. 기본값인 500Hz 정렬에서는 띠의 중심과 DF 타겟이 거의 겹치므로, DF에 고정했을 때와 모양이 같아 보입니다.

기준 DF 타겟을 함께 띄우고 50Hz 같은 낮은 주파수에서 정렬하면, 띠는 DF 기준 경계값이 가리키는 자리에 놓이지 않습니다. 띠는 DF가 아니라 비교 중인 커브들에 맞춰 정렬되기 때문입니다.

:::tip
띠는 저음역에서 가장 넓습니다(50Hz에서 약 6dB, 500Hz에서 약 2dB). 측정값이 선호 범위 안에 드는지 가장 믿을 만하게 보려면 중음역에서 정렬하세요.
:::

## 설정하기

이 줄은 운영자가 데이터를 넣고 [`PREFERENCE_BOUND`](../guide-for-admins/customize-page.mdx#preference_bound)를 설정해야 나타납니다.

파일 세 개가 필요합니다.

- **`Bounds U.txt`**, **`Bounds D.txt`** — 기준 타겟에 대한 상한·하한 오프셋(dB)입니다. `phones/`, `target/`과 나란히 `data/` 바로 아래에 둡니다.

  ```
  20.0	2.5
  25.0	2.8
  31.5	3.1
  ...
  ```

- **기준 Diffuse Field 타겟** — `BOUND_LIST` 항목의 `target`에 `.txt` 확장자를 뺀 이름으로 지정합니다. 일반 타겟 폴더(`PATH.TARGET_MEASUREMENT`, 기본값 `./data/target/`)에서 그대로 읽으므로 다른 곳에 복사하지 마세요. `"KEMAR DF (KB006x)"`는 `./data/target/KEMAR DF (KB006x) Target.txt`를 불러옵니다. `TARGET_MANIFEST`와 마찬가지로 ` Target`이 없으면 자동으로 붙습니다.

```javascript
PREFERENCE_BOUND: {
  BOUND_LIST: [{ target: "KEMAR DF (KB006x)" }],
},
```

## 여러 경계 제공하기 \{#offering-more-than-one-bound\}

`BOUND_LIST`에는 항목을 여러 개 넣을 수 있고, 각 항목이 줄 안의 버튼 하나가 됩니다. 측정 장비가 둘 이상이라 장비마다 기준 타겟이 따로 필요할 때, 또는 같은 타겟에 서로 다른 경계 파일을 견줘 보게 하고 싶을 때 사용하세요.

```javascript
PREFERENCE_BOUND: {
  ENABLE_BOUND_ON_INITIAL_LOAD: true, // 첫 항목을 선택
  BOUND_LIST: [
    { target: "KEMAR DF (KB006x)" },
    { target: "5128 DF", upper: "Bounds U 5128.txt", lower: "Bounds D 5128.txt" },
    { name: "KEMAR (wide)", target: "KEMAR DF (KB006x)", upper: "Bounds U wide.txt", lower: "Bounds D wide.txt" },
  ],
},
```

- `target` — 위에서 설명한 기준 타겟. 필수입니다.
- `name` — 버튼에 표시할 이름. 기본값은 ` Target`을 뺀 타겟 이름입니다. 이름은 겹치면 안 되며, 겹치는 항목은 건너뜁니다. 다른 운영자 문자열처럼 `{ default, i18n }` 형식도 받습니다.
- `upper` / `lower` — `data/` 기준 경계 파일 경로. 기본값은 `Bounds U.txt`, `Bounds D.txt`입니다.

항목이 둘 이상이면 그래프 왼쪽 위, 기준선 라벨 바로 아래 줄에 현재 경계의 이름이 표시됩니다. 스크린샷만 보고도 어떤 경계였는지 알 수 있습니다.

:::caution
경계 파일은 그것을 도출할 때 쓴 기준 타겟에 대한 오프셋입니다. 경계를 관계없는 타겟(예: Diffuse Field 대신 Harman 커브)과 짝지으면, 그 경계를 만든 연구가 뒷받침하지 않는 띠가 그려집니다. 각 항목의 타겟은 그 경계를 만들 때 쓴 타겟으로 두세요.
:::

:::note[업그레이드]
이전 설정의 `BASE_DF_TARGET_FILE`도 그대로 동작합니다. `BOUND_LIST`가 없으면 기본 경계 파일을 쓰는 단일 항목으로 처리됩니다.
:::