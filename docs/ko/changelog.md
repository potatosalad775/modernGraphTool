---
title: modernGraphTool v2 변경 이력
editUrl: true
head: []
template: doc
sidebar:
  order: 11
  label: 변경 이력
  hidden: false
  attrs: {}
pagefind: true
draft: false
---

### v2.3.7
- Feat: 하드웨어 EQ가 이제 **기기 내장 EQ** 옆에 기기 자체 설정을 보여 줍니다. 기기에 따라 헤드룸, 크로스피드, DAC 필터, 출력 게인, USB 모드 등이 나타납니다. 설정은 바꾸는 즉시 적용되며, 기기를 재시작하는 설정은 먼저 확인을 받고 이후 자동으로 다시 연결합니다. 자세한 내용은 [기기 설정](./features/device-peq.mdx#device-settings) 참조.
- Feat: 사용자 EQ와 헤드폰 EQ("SPK EQ")를 가진 Qudelix 5K처럼 EQ가 둘 이상인 기기에는 **EQ** 행이 나타납니다. 여기서 고른 EQ를 **기기 내장 EQ**, **기기에서 읽기**, **기기에 쓰기**, 자동 쓰기, 밴드 목록의 제약 조건이 사용합니다. 자세한 내용은 [EQ가 둘 이상인 기기](./features/device-peq.mdx#devices-with-more-than-one-eq) 참조.
- Feat: Topping DX5 II, DX9 Discrete처럼 프리셋을 목록으로 관리하는 기기에서는 **기기 내장 EQ** 가 기기에 저장된 이름으로 프리셋을 보여 주며, **새로 만들기**, **이름 바꾸기**, **삭제** 버튼으로 이 목록을 편집할 수 있습니다. 자세한 내용은 [프리셋 추가, 이름 바꾸기, 삭제](./features/device-peq.mdx#adding-renaming-and-deleting-presets) 참조.
- Feat: Qudelix의 헤드폰 EQ, Topping DX5 II처럼 귀마다 밴드 세트를 따로 가진 기기가 이제 채널별 EQ 전체를 받습니다. **기기에 쓰기** 는 귀마다 L+R 밴드와 그 귀 전용 밴드를 보내고, **기기에서 읽기** 는 양쪽 귀를 모두 가져오며, **Channel** 스위치도 계속 쓸 수 있습니다. 다른 기기는 지금처럼 L+R 밴드만 받습니다. 자세한 내용은 [좌우 채널](./features/device-peq.mdx#left-and-right) 참조.
- Feat: [uniPEQ 연결](./features/unipeq-link.mdx#연결-이후)이 uniPEQ에 연결된 기기에 대해서도 위의 기능을 모두 지원합니다. 좌·우 전용 밴드, 기기의 프리셋 목록, 기기 설정, 기기의 EQ가 해당됩니다. 최신 uniPEQ가 필요하며, 이전 버전에서는 지금처럼 동작합니다.
- Feat: phone의 `variants[]` 가 `file`(과 `hptfs`)의 측정치를 모두 나열하면, 이제 Variant 선택기가 `variants[]` 순서를 따르고 그 첫 항목이 기본 커브가 됩니다. 일부만 나열한 `variants[]` 는 이전 순서를 유지합니다. `variants` 는 있지만 `file` 이 없는 phone, 그리고 첫 Variant가 `file` 의 첫 항목과 다른 phone은 브라우저 콘솔에 경고가 남습니다. 후자는 squig.link와 CrinGraph가 다른 Variant를 열기 때문입니다. 자세한 내용은 [샘플 세트](./guide-for-admins/manage-data.mdx#sample-sets) 참조.
- Fix: [phone_book.json Editor](/phone-book-editor)가 이제 `variants[]` 와 함께 phone 레벨 `file` 과 `suffix` 를 내보내며, 가져올 때 이 키들이 버려진다는 경고도 더 이상 표시하지 않습니다. `file` 이 없는 phone은 squig.link 크로스 사이트 검색에서 빠졌고, 같은 파일에서 그 뒤에 오는 phone도 모두 함께 빠졌으며, CrinGraph에서도 읽을 수 없었습니다. Editor로 `phone_book.json` 을 변환한 적이 있다면 다시 내보내 주세요.
- Fix: 프리셋을 불러온 뒤 EQ가 바뀌었음을 알려 주는 기기가 있습니다. Qudelix는 자체 앱에서 한 편집을 포함해 어떤 편집이든 그 뒤에 이렇게 알려 줍니다. 이런 기기는 이제 **기기 내장 EQ** 에 **저장되지 않은 EQ** 로 표시되며, **기기에서 읽기** 와 **기기에 쓰기** 는 기기가 재생 중인 EQ를 사용합니다. 이전에는 첫 번째 프리셋이 대신 표시되었고, **기기에서 읽기** 를 쓸 수 없었으며, **기기에 쓰기** 가 그 프리셋을 덮어썼습니다. 자세한 내용은 [기기 내장 EQ](./features/device-peq.mdx#기기-내장-eq) 참조.
- Fix: 기기가 작업 중일 때도 하드웨어 EQ의 컨트롤이 키보드 포커스를 잃지 않습니다. 쓰기 중에 놓은 설정 슬라이더 값은 기기가 작업을 마친 뒤 적용됩니다.
- Fix: uniPEQ 연결 중 uniPEQ가 아직 작업 중일 때 버튼을 다시 눌러도 더 이상 오류 알림이 뜨지 않습니다. uniPEQ가 기록한 뒤에도 상태 표시줄에 이전 오류나 설정 메시지가 남지 않습니다.
- Fix: uniPEQ 연결 중 uniPEQ의 고정 프리앰프가 쓰일 때는 프리앰프가 자동 조정되었다는 알림이 더 이상 뜨지 않습니다. 대신 그 프리앰프의 여유가 밴드의 부스트보다 작으면 채널마다 경고를 표시합니다.
- Fix: 밴드의 게인은 소수점 둘째 자리, Q는 셋째 자리까지만 표시됩니다. 기기에서 읽은 Q가 `0.70703125` 대신 `0.707` 로 보입니다.
- Fix: 톤 제너레이터가 이제 슬라이더 위치 사이를 계단처럼 끊기지 않고 부드럽게 이동합니다. 150 Hz 아래에서는 0.1 Hz 단위로 움직여, 슬라이더의 모든 위치에서 음높이가 바뀝니다. 한 옥타브를 넘는 이동은 지금처럼 바로 건너뜁니다.

### v2.3.6
- Feat: 샘플 세트의 각 측정 커브가 이제 한 가지 색 대신 커브 색의 단계별 음영으로 그려지며, 첫 번째 측정이 가장 진합니다. 커브 색을 바꾸면 측정 커브의 색도 함께 바뀝니다. 평균 커브가 보일 때는 그 뒤에 흐리게, 평균을 숨기면 진하게 그려집니다. 자세한 내용은 [샘플 선택기](./guide-for-users/working-with-curves.mdx#샘플-선택기-여러-번-측정한-기기용) 참조. (#134)
- Feat: Hardware EQ가 eqcaps 0.6으로 업데이트되어 Topping 기기를 포함한 다양한 제품들이 지원됩니다.
- Refactor: AutoEQ가 turboEQ 0.3.1로 업데이트되어 최대 2배 빠른 연산 성능을 제공함과 동시에, 완전 일치 Peaking-only 모드에서 드물게 발생하던 오류가 수정되었습니다.
- Fix: `4.3`처럼 소수점이 있는 `reviewScore`가 이제 별 다섯 개 중 정확히 그만큼 채워집니다. 이전에는 아래쪽 반 별 단위로 잘렸고, 반쪽 별은 크기와 색이 다른 이모지로 표시되었습니다. (#135)

### v2.3.5
- Feat: Equalizer의 필터 목록 위에 **모든 밴드 삭제** 버튼을 추가했습니다. 삭제 전에 확인을 거치고, 왼쪽·오른쪽 전용 밴드도 함께 지우며, 실행 취소로 되돌릴 수 있습니다. (#117)
- Feat: Misc 패널에 **단일 키 단축키** 설정을 추가했습니다. 패널을 전환하는 <kbd>1</kbd>–<kbd>4</kbd> 키나 <kbd>\\</kbd> 누르고 있기가 입력이나 음성 제어에 방해가 되면 끌 수 있습니다. 드롭다운에 포커스가 있을 때도 이 키들은 동작하지 않습니다. 자세한 내용은 [키보드와 포커스 조작](./guide-for-users/interface-tour.mdx#키보드와-포커스-조작) 참조.
- Feat: 키보드와 스크린 리더 지원을 전반적으로 손봤습니다. 컨트롤과 그래프로 바로 가는 건너뛰기 링크가 생겼고, 그래프와 패널 사이의 구분선을 화살표 키로 옮길 수 있으며, 각 커브의 버튼은 커브 이름과 함께 읽히고, 사이트 선택기에는 검색 입력란과 화살표 키 이동이 추가되었습니다. 애니메이션은 동작 줄이기 설정을 따르고, 페이지는 선택한 언어를 스크린 리더와 브라우저 번역에 알립니다.
- Feat: `PREFERRED_DARK_MODE_THEME: "system"`일 때, 방문자가 직접 고르기 전까지 테마가 기기의 라이트·다크 설정을 계속 따라갑니다. 다크 모드는 페이지를 처음 그리기 전에 적용되므로, 로딩 중에 밝은 화면이 잠깐 보이지 않습니다.
- Feat: 기본 `theme.css`의 팔레트를 대비가 더 높은 색으로 바꿨습니다. 모든 색상 역할은 `-content`와 4.5:1 이상을, 보조 텍스트는 7:1 이상을 유지하며, `prefers-contrast: more` 블록이 라이트 테마의 색을 7:1까지 올립니다. `--color-scrim`(다이얼로그, 모바일 메뉴, 투어 뒤의 가림막)과 `--color-rating`(순위 별) 토큰이 새로 생겼습니다. 기존 `theme.css`는 자신의 색을 그대로 유지하며, 새 토큰이 없어도 동작합니다. 자세한 내용은 [페이지 스타일 커스터마이징](./guide-for-admins/customize-page.mdx#customizing-page-styles-themecss) 참조.
- Feat: [Theme Generator](/theme-generator)가 새 토큰을 함께 내보내고, `prefers-contrast: more` 블록을 고른 색의 7:1 버전으로 채웁니다. 색을 고르는 동안 각 색의 대비를 보여 주고, 대비 강화 팔레트를 미리 볼 수 있으며, **전체 무작위**는 4.5:1을 지키는 색만 뽑습니다.
- Feat: `TOPBAR.TITLE.ALT`를 추가했습니다. 타이틀이 이미지나 HTML일 때 스크린 리더가 읽을 사이트 이름을 일반 텍스트로 지정합니다. 샘플 `config.js`의 타이틀은 이제 `<span>`입니다. HTML 타이틀에는 제목 태그(`<h1>`–`<h6>`)를 쓰지 마세요. 자세한 내용은 [TOPBAR 문서](./guide-for-admins/customize-page.mdx#topbar) 참조.
- Feat: CDN 배포를 `CDN_MODE.VERSION`으로 특정 릴리스 하나에 고정할 수 있습니다. `BOOT_INTEGRITY`까지 지정하면, 직접 `index.html`과 `config.js`에 적어 둔 해시와 일치하는 파일로만 시작합니다. 고정하지 않은 사이트도 이제 릴리스의 각 스크립트와 스타일시트를 해시로 검증합니다. 자세한 내용은 [릴리스 고정하기](./guide-for-admins/deployment/cdn.mdx#pinning-a-release) 참조.
- Feat: 모든 릴리스에 Content-Security-Policy를 포함한 권장 보안 헤더가 꺼진 상태로 들어 있습니다. `.htaccess`에는 주석 처리된 줄로, CDN 릴리스와 GitHub Pages 템플릿의 `index.html`에는 주석 처리된 `<meta>` 태그로 제공됩니다. 여기에 Trusted Types를 추가로 켤 수 있습니다. 자세한 내용은 [보안 헤더](./guide-for-admins/deployment/security-headers.mdx) 참조.
- Feat: 함께 제공되는 `.htaccess`가 Apache에서 캐시 수명과 압축을 설정합니다. 자세한 내용은 [캐시와 압축](./guide-for-admins/deployment/prebuilt.mdx#caching-and-compression) 참조.
- Feat: 하드웨어 EQ가 네트워크 기기에 연결하기 전에 주소(IP 주소나 `.local` 이름, 필요하면 포트)를 확인하고, Enter로 연결하며, 브라우저가 기기에 닿지 못하면 그 사실을 알려줍니다. 자세한 내용은 [네트워크 기기](./features/device-peq.mdx#network-devices) 참조.
- Feat (squig-link): 분석 이벤트가 ID 없이도 squig.link의 공용 Tag Manager 컨테이너로 전송되며, `ANALYTICS_MEASUREMENT_IDS`에 직접 운영하는 `GTM-` 컨테이너도 넣을 수 있습니다. 방문자는 Misc 패널의 **사용 통계** 스위치로 끌 수 있고, Global Privacy Control을 보내는 브라우저에서는 분석을 불러오지 않으며, 새 `ANALYTICS_CONSENT`로 Consent Mode의 시작 상태를 정합니다. 자세한 내용은 [분석과 동의](./features/squiglink-integration.mdx#analytics-and-consent) 참조.
- Fix (squig-link): 분석 이벤트가 제대로 전송되지 않던 문제를 수정했습니다.
- Fix (squig-link): 쇼핑 링크의 할인 가격이 제대로 표시되지 않던 문제를 수정했습니다.
- Fix: 업로드한 측정치를 EQ 소스로 쓸 때도 다른 소스와 마찬가지로 EQ 중에 흐리게 표시됩니다. (#115)
- Fix: 새 EQ 커브가 소스의 Y 오프셋에서 시작하고, 오프셋이 있는 커브에서도 그래프의 밴드 핸들이 커브 위에 놓입니다. (#116)
- Fix: 언어를 바꿔도 선택한 기기, 타겟, EQ가 유지됩니다. `URL.AUTO_UPDATE_URL`이 꺼져 있어도 마찬가지입니다. (#119)
- Fix: Y 오프셋 버튼을 누르고 있으면 단계마다가 아니라 한 번의 실행 취소 항목으로 기록됩니다.
- Fix: 손상된 공유 링크 때문에 페이지 로딩이 멈추지 않습니다. 읽을 수 없는 부분만 건너뜁니다.
- Fix: `phone_book.json`의 `reviewLink`, `shopLink`, `links[]` URL에서 `&tab=`, `&lt=` 같은 쿼리 매개변수가 그대로 유지됩니다. `http(s)` 주소가 아닌 `reviewLink`와 `shopLink`는 무시합니다.
- Fix: 기본 인덱스가 응답하지 않아도 미러가 응답하면 크로스 사이트 검색이 실패하지 않습니다. 형식이 잘못된 행은 멈추지 않고 건너뛰며, 불러오기에 실패하면 계속 로딩 중으로 남지 않고 실패로 표시합니다.
- Fix: 접속할 수 없었던 데이터베이스는 사이트 선택기에서 흐리게 표시되는 대신 **미확인** 배지가 붙고, 목록 아래에 안내가 표시됩니다.
- Fix: 오류 알림은 닫을 때까지 남아 있고, 같은 알림이 반복되면 하나로 표시됩니다. 화면보다 긴 다이얼로그와 팝오버는 잘리지 않고 안에서 스크롤됩니다.
- Fix: 브라우저가 복사를 막으면 공유 버튼이 링크를 보여 주어 직접 복사할 수 있습니다.
- Fix: 5 MB를 넘는 파일이나 한 번에 40개를 넘는 파일을 업로드하면, 읽으려 하지 않고 메시지와 함께 거부합니다.
- Fix: IME(한국어, 일본어, 중국어) 입력을 끝내는 Enter나 Escape가 입력란까지 확정하거나 취소하지 않습니다.
- Refactor: 다크 모드에서 찍은 스크린샷이 내장된 색 대신 `theme.css`의 라이트 색을 사용합니다.
- Refactor: 시작 속도가 빨라졌습니다. Equalizer 패널은 필요할 때 불러오고, 조사 모드 판독기, Y축 드래그, 크로스 사이트 검색이 하는 일이 줄었습니다.

### v2.3.4
- Feat: 하드웨어 EQ 기기를 연결해 둔 동안에는 오디오 플레이어가 EQ를 기기에 맡기므로, 기기에서 재생되는 소리에 EQ가 두 번 걸리지 않습니다. 소리가 그 기기로 재생되지 않는다면 **Apply it here instead**로 플레이어에 EQ를 다시 적용할 수 있습니다. uniPEQ로 연결한 기기도 **uniPEQ 열기**로 uniPEQ를 시작했다면 똑같이 동작합니다. QR 코드나 코드 입력으로 참여했다면 플레이어가 그 기기로 듣고 있는지 묻습니다. 자세한 내용은 [오디오 미리 듣기](./guide-for-users/equalizing.mdx#audio-preview) 참조.
- Feat: 조사 모드 판독기가 이제 곡선의 Y 오프셋을 값 뒤에 `72.4dB (+1)`처럼 함께 표시합니다. 자세한 내용은 [조사 모드](./guide-for-users/graph-controls.mdx#조사-모드) 참조.
- Fix: 검색어를 입력하면 브랜드 목록도 일치하는 기기가 있는 브랜드로 좁혀집니다. 선택한 브랜드는 목록에 계속 남습니다. (#106)
- Fix: 기준선으로 지정한 커브를 삭제하면 그래프가 일반 화면으로 돌아가고, 삭제를 실행 취소하면 이전 상태 그대로 기준선이 다시 적용됩니다.
- Fix: 타겟 커스터마이저 조정을 실행 취소하면 커브와 함께 슬라이더도 되돌아갑니다. 커스터마이저를 열거나 패널을 전환할 때 아무것도 바꾸지 않는 실행 취소 항목이 더 이상 생기지 않습니다.
- Fix: Shift+Z와 Caps Lock이 켜진 상태에서도 다시 실행이 동작합니다. AltGr나 Option으로 백슬래시를 입력하는 키보드 배열에서도 <kbd>\\</kbd> 누르고 있기가 동작하며, Shift를 먼저 떼도 제대로 끝납니다.
- Fix: <kbd>\\</kbd>를 누르고 있는 동안 Equalizer를 켜거나 끄면, 키를 뗀 뒤에도 그 상태가 유지되고 누르고 있기가 끊기지 않습니다.
- Fix: EQ 파일 가져오기를 실행 취소하면 가져오기로 해제된 EQ 제약 조건도 함께 돌아옵니다.
- Fix: 그래픽 EQ 내보내기가 값이 채워지지 않은 밴드를 건너뛰며, 미완성 밴드만 있는 목록에서는 내보내기를 제공하지 않습니다.
- Fix: 공진이 있는 로우패스·하이패스 밴드(Q 0.707 초과)의 차단 주파수 피크만큼 프리앰프 여유를 확보합니다.
- Fix: AutoEQ를 실행할 수 없을 때 그 이유를 브라우저 경고창 대신 번역된 알림으로 표시합니다.
- Fix: 조사 모드 판독기에 숨긴 평균 커브가 표시되지 않고, EQ 소스 런이 한 번만 표시됩니다. 고스트로 표시한 EQ 소스 런에도 그래프 레이블이 붙습니다.
- Fix: 키보드 단축키 바의 레이블에 `+`가 두 번 표시되지 않습니다.

### v2.3.3
- Feat: 버튼과 스위치의 툴팁이 이제 테마와 선택한 언어를 따르고, 더 빨리 열리며, 키보드 포커스로도 열립니다. 텍스트 레이블이 보이는 버튼은 추가로 안내할 내용이 있을 때만 툴팁을 표시하며, 스크린 리더는 그 레이블로 버튼을 읽어줍니다.
- Feat: `COLLAPSE_TARGET_LIST_ON_INITIAL`을 `{ DESKTOP: …, MOBILE: … }`로 레이아웃별로 설정할 수 있습니다. `true`나 `false`는 지금처럼 둘 다에 적용됩니다. 샘플 `config.js`는 이제 데스크톱에서 펼쳐진 상태로, 모바일에서 접힌 상태로 시작합니다. 방문자가 직접 접거나 펼친 상태는 방문 중 계속 유지됩니다. 자세한 내용은 [COLLAPSE_TARGET_LIST_ON_INITIAL 문서](./guide-for-admins/customize-page.mdx#collapse_target_list_on_initial) 참조.
- Feat: 사이트 선택기와 사이트 간 검색 결과의 기기 종류 제목이 이제 번역되어 표시됩니다.
- Fix: 하드웨어 EQ가 기기에서 내장으로 표시한 프리셋에 더 이상 쓰지 않습니다. 재생과 읽기는 계속 가능하며, 쓰려면 다른 프리셋을 고르도록 패널에서 안내합니다. 자세한 내용은 [기기 내장 EQ](./features/device-peq.mdx#기기-내장-eq) 참조.
- Fix: Fosi DS3처럼 EQ 스위치와 현재 프리셋을 따로 관리하는 기기에서 하드웨어 EQ가 올바른 상태를 표시합니다. EQ가 꺼져 있으면 **기기 내장 EQ** 에 꺼짐으로 표시되고, **기기에서 읽기** 로 해당 프리셋을 계속 읽을 수 있습니다.
- Fix: 8밴드와 32밴드 Fosi DS3처럼 펌웨어로만 구분되는 기기는 이제 하드웨어 EQ가 먼저 기기에 확인하고, 기기가 응답하지 않을 때만 사용자에게 묻습니다.
- Fix: 저장할 때 재시작하는 기기가 이제 자동으로 다시 연결됩니다. **다시 연결** 은 기기가 돌아오지 않을 때만 나타납니다. 자세한 내용은 [하드웨어 EQ](./features/device-peq.mdx) 참조.
- Fix: 기기를 뽑거나 기기가 범위를 벗어나면 이제 바로 연결이 해제됩니다. 직접 고른 EQ 제약 조건으로 돌아가며, 밴드는 그대로 유지됩니다.
- Fix: 업로드한 타겟이 이제 다른 타겟과 똑같이 동작합니다. 목록의 앞쪽에 표시되며, 레이블에 채널 표시가 붙지 않습니다. (#99)
- Fix: Android Chrome에서 페이지가 화면보다 길어지던 문제를 수정했습니다. (#98)
- Fix: 사이트 선택기가 이제 키보드 탐색을 지원하며, 긴 목록을 스크롤해도 그룹 제목이 계속 보입니다.

### v2.3.2
- Feat: 상단 바에 다 들어가지 않는 링크는 이제 `TOPBAR.LINK_LIST`의 끝에서부터 **더보기** 메뉴로 옮겨집니다. 중요한 링크를 앞쪽에 두세요. 자세한 내용은 [TOPBAR 문서](./guide-for-admins/customize-page.mdx#topbar) 참조.
- Fix: 색상 선택기의 **랜덤** 버튼이 곡선의 현재 색을 다시 고르지 않으며, 다른 표시 중인 곡선이 쓰는 색도 피합니다. 팔레트가 바닥나면 테마의 그래프 배경에서 잘 보이는 색을 생성합니다. 기본 Okabe-Ito 팔레트에서는 다크 테마에서 보이지 않던 검은색을 뺐습니다. 자세한 내용은 [TRACE_STYLING 문서](./guide-for-admins/customize-page.mdx#trace_styling) 참조.
- Fix: `config.js`의 중복 항목(예: `TARGET_MANIFEST`에 두 번 들어간 타겟)이나 `phone_book.json`의 중복 variant suffix 때문에 페이지가 멈추던 문제를 수정했습니다. 첫 항목이 유지되고, 뒤의 중복 suffix에는 번호가 붙으며, 건너뛴 항목은 브라우저 콘솔에 표시됩니다. 자세한 내용은 [Variations](./guide-for-admins/manage-data.mdx#variations-여러-데이터-파일을-하나로-묶기) 참조.
- Fix: 검색 도움말 화면이 화면 밖으로 넘치지 않도록 수정했습니다.
- Docs: 측정 파일을 대량으로 내려받기 어렵게 만드는 서버 규칙을 다룬 [데이터 무단 수집 방지](./guide-for-admins/protect-data.mdx) 가이드를 추가했습니다.

### v2.3.1
- Feat: 스무딩 버튼에 REW의 **Var**(가변)와 **Psy**(심리음향) 스무딩이 추가되었습니다. 고정 옥타브 값들 다음에 나오며, REW의 같은 스무딩과 일치합니다. 자세한 내용은 [스무딩](./guide-for-users/graph-controls.mdx#스무딩) 참조.
- Feat: 검색어에서 `-`로 시작하는 단어가 들어간 기기를 결과에서 제외합니다. 예를 들어 `earphones -pro -plus -max`로 검색하면 Earphones 기본 모델만 표시됩니다. 자세한 내용은 [특정 단어 제외하기](./features/cross-site-search.mdx#특정-단어-제외하기) 참조.
- Feat: 스무딩이 이제 REW의 옥타브 스무딩과 일치합니다. 이전에는 밴드마다 점 하나로 줄어들어, REW의 결과값과 비교했을 때 폭이 좁은 피크와 딥이 몇 dB씩 틀어질 수 있었습니다.
- Fix: REW 내보내기 파일처럼 1/48 옥타브보다 촘촘한 데이터를 이제 1/48 옥타브 격자에 파워 평균으로 맞추므로, 빠지는 샘플이 없습니다.

### v2.3.0
- Feat: [uniPEQ](https://unipeq.com) 앱과 함께 EQ를 실시간으로 편집하고, uniPEQ에 연결된 기기에 바로 기록하는 **uniPEQ 연결** 기능이 추가되었습니다. 하드웨어 EQ 안에 포함되어 있으며, USB 연결과 uniPEQ 연결 중 한 번에 하나만 사용할 수 있습니다. 이제 안드로이드 휴대폰 하나만으로 그래프를 보며 PEQ를 조작할 수 있습니다. 새 `UNIPEQ_LINK` 섹션으로 설정하며, 기본값은 켜짐입니다. 자세한 내용은 [uniPEQ 연결](./features/unipeq-link.mdx) 및 [UNIPEQ_LINK 문서](./guide-for-admins/customize-page.mdx#unipeq_link) 참조.
- Feat: Equalizer가 피킹 필터와 셸빙 필터 외에 로우패스, 하이패스, 밴드패스, 노치, 올패스 필터도 지원합니다. 이 필터를 사용하는 EQ 프로필이나 기기를 위한 기능으로, EQ 곡선에 표시되며 활성화된 EQ 제약 조건이 허용하는 경우 밴드의 필터 종류로 선택할 수 있습니다.
- Feat: 하드웨어 EQ에 처음 쓰거나 프리셋을 전환할 때, 또는 오디오 플레이어를 처음 재생할 때 볼륨 경고를 한 번 표시합니다. 재생 중에 EQ를 쓰면 팝 노이즈가 나거나 음량이 갑자기 바뀔 수 있기 때문입니다. **다시 보지 않기**로 영구히 끌 수 있습니다.
- Feat: 편집 기록 & 비교에 **기록**과 **북마크** 탭이 추가되었습니다. EQ를 북마크해 보관하고, 기록 항목을 하나씩 삭제하고, 항목을 그래프에 고스트 트레이스로 추가할 수 있습니다. 다른 패널이 열려 있는 동안의 편집도 이제 기록됩니다. 자세한 내용은 [편집 기록 & 비교](./features/equalizer.mdx#history-and-compare) 참조.
- Feat: 브라우저 내 플레이어의 A/B 비교가 이제 음량을 맞춰 재생하며, 활성화된 EQ 제약 조건에 맞지 않는 항목에서는 비활성화됩니다. 자세한 내용은 [제약 조건에 맞지 않는 항목](./features/equalizer.mdx#entries-that-dont-fit-the-constraint) 참조.
- Feat: Equalizer가 샘플 세트의 평균 대신 측정 하나를 대상으로 EQ를 적용할 수 있습니다. 자세한 내용은 [샘플 세트의 측정 하나에 EQ 적용하기](./features/equalizer.mdx#eq-one-run-of-a-sample-set) 참조.
- Feat: `DOWNLOAD`가 이제 샘플 세트의 평균과 함께 모든 측정을 내려받을 수 있게 하며, 여러 파일은 `.zip` 하나로 내려받습니다. 자세한 내용은 [DOWNLOAD 문서](./guide-for-admins/customize-page.mdx#download) 참조.
- Feat: 선호도 경계를 여러 개 제공할 수 있으며, 타겟 목록 아래쪽의 행에서 고를 수 있습니다. 새 `PREFERENCE_BOUND.BOUND_LIST`로 설정하며, 이는 `BASE_DF_TARGET_FILE`을 대체합니다. 기존 키도 계속 동작합니다. 자세한 내용은 [선호도 경계](./features/preference-bound.mdx#offering-more-than-one-bound) 및 [PREFERENCE_BOUND 문서](./guide-for-admins/customize-page.mdx#preference_bound) 참조.
- Feat: 그래프 툴바의 **주파수 가이드** 버튼으로 Frequency Tutorial 띠를 켜고 끌 수 있습니다. 처음 방문한 사용자에게 이를 표시하는 `SHOW_FREQUENCY_TUTORIAL_ON_INITIAL_LOAD` 설정이 추가되었으며, 기본값은 숨김입니다. 자세한 내용은 [Frequency Tutorial](./features/frequency-tutorial.mdx) 참조.
- Feat: Equalizer 패널을 처음 열 때 보여주는 둘러보기가 추가되었습니다. 패널 상단 바의 **?** 버튼으로 다시 볼 수 있습니다. 자세한 내용은 [패널 둘러보기](./features/equalizer.mdx#the-panel-tour) 참조.
- Feat: EQ 소스 선택기와 AutoEQ 타겟 선택기의 항목이 이제 그룹으로 묶여 표시됩니다.
- Feat: 그래픽 EQ의 각 밴드 게인 슬라이더가 이제 해당 행 안에 표시되며, 모든 밴드가 평탄한 상태에서 처음 게인을 조정하면 EQ가 켜집니다.
- Fix: 자동 프리앰프가 이제 연결된 기기의 프리앰프 단위에 맞춰 내림 처리되어, 헤드룸을 잃거나 단위가 큰 기기에서 자동 쓰기가 검토를 위해 멈추지 않습니다.
- Fix: Equalizer APO 파일을 가져올 때 번호로 지정된 채널(`Channel: 1`), 번호 없는 필터, 대역폭(`BW Oct`), 셸프 기울기를 읽을 수 있습니다. 자세한 내용은 [필터 파일 가져오기](./features/equalizer.mdx#importing-filter-files) 참조.
- Fix: 그래픽 EQ로 내보낼 때 활성화된 공용 밴드만 포함합니다. (#85)
- Fix: 하드웨어 EQ 프로필을 선택해도 밴드 목록이 고정 주파수의 평탄한 밴드로 채워지지 않습니다.
- Fix: EQ 곡선에서 선택한 채널이 곡선을 다시 그린 뒤에도 유지됩니다.
- Fix: 그래프 검사 토글이 처음부터 그래프 상태와 일치합니다.
- Fix (squig-link): 새로운 스폰서가 생기면 스폰서 안내창이 다시 표시됩니다. 닫으면 스폰서별로 하루 동안 표시되지 않으며, 이 설정은 squig.link의 CrinGraph 사이트와 공유됩니다.
- Refactor: 초기 로딩 속도를 개선하고, SvelteKit 3으로 업그레이드했습니다.
- Localization: 러시아어 및 우크라이나어 번역을 업데이트하고 복수형을 지원합니다. (by @reallystates)

### v2.2.4
- Feat: Device PEQ가 **하드웨어 EQ**로 이름을 바꾸고, 기기 EQ가 받아들이는 값을 정리한 오픈 데이터베이스 [eqcaps](https://github.com/potatosalad775/eqcaps)를 기반으로 새로 만들어졌습니다. 자세한 내용은 [하드웨어 EQ](./features/device-peq.mdx) 참조.
- Feat: 기기의 프리셋을 전환하거나 EQ를 우회하는 **기기 내장 EQ** 컨트롤이 추가되었습니다. 바꾸는 즉시 기기에 적용됩니다.
- Feat: 하드웨어 EQ를 위한 **변경 사항 자동 쓰기** 기능이 추가되었습니다. 편집을 멈추고 잠시 뒤에 각 변경 사항을 연결된 기기에 기록하며, 기본값은 꺼짐입니다. 자세한 내용은 [하드웨어 EQ](./features/device-peq.mdx) 참조.
- Feat: EQ 제약 조건 선택기가 돌아왔습니다. 기본 제공 항목과 함께 eqcaps의 소프트웨어 및 하드웨어 EQ 프로필을 고를 수 있습니다. 제약 조건은 밴드별 필터 종류와 주파수, Q, 게인의 범위 및 단위까지 다루며, AutoEQ도 그 안에서 계산합니다. 자세한 내용은 [EQ 제약 조건](./features/equalizer.mdx#eq-constraints) 참조.
- Feat: 하드웨어 EQ와 제약 조건 선택기가 eqcaps 데이터베이스의 미러를 사용하도록 지정하는 `EQUALIZER.EQCAPS_URL` 설정이 추가되었습니다. 자세한 내용은 [EQUALIZER 문서](./guide-for-admins/customize-page.mdx#equalizer) 참조.
- Feat: variant 선택기에서 suffix 아래에 표시되는 일반 텍스트 메모 `variants[].description`이 추가되었습니다. 긴 suffix도 이제 잘리지 않고 줄바꿈됩니다. 자세한 내용은 [샘플 세트 문서](./guide-for-admins/manage-data.mdx#sample-sets) 참조.
- Fix: `variants[]`를 phone 레벨의 `file` 형식과 합칠 때, 같은 첫 파일을 쓰는 두 샘플 세트가 서로를 덮어쓰던 문제를 수정했습니다.

### v2.2.3
- Feat: 검색 기능을 위한 OR 연산자 (//)를 추가했습니다.
- Refactor: turboEQ WASM을 최초로 불러오는데 걸리는 시간을 조정했습니다.
- Fix: EQ 탭의 오디오 플레이어에서 스윕 시그널의 주파수 숫자가 20Hz로 고정되는 이슈를 수정했습니다.

### v2.2.2
- Feat: AutoEQ가 이제 [jaakkopasanen의 AutoEq](https://github.com/jaakkopasanen/AutoEq) 옵티마이저를 WebAssembly로 이식한 [turboEQ](https://github.com/potatosalad775/turboEQ)로 동작합니다. 8밴드 기준 수 밀리초 만에 완료되어 이전보다 100배 이상 빠르며, 요청한 밴드 수를 항상 정확히 반환합니다. 자세한 내용은 [AutoEQ 벤치마크](./features/autoeq-benchmarks.mdx) 참조.
- Feat: AutoEQ 맞춤 방식이 추가되었습니다. **완전 일치**(기본값)는 그래프에 표시된 그대로 20 kHz까지의 전체 곡선을 맞추고, **고음 보존**은 AutoEq 본래의 방식을 따라 고역을 스무딩하며 10 kHz 이상에는 밴드를 배치하지 않습니다. 자세한 내용은 [맞춤 방식](./features/equalizer.mdx#fit-mode) 참조.
- Feat: 기기 곡선, 타겟, AutoEQ 옵션이 바뀔 때마다 AutoEQ를 다시 실행하는 **자동 적용** 스위치가 추가되었습니다. 예를 들어 Target Customizer에서 타겟 기울기를 조정하는 동안 유용합니다. 필터를 직접 수정하거나 기기, 타겟, EQ 프리셋을 바꾸면 자동으로 꺼집니다. 자세한 내용은 [자동 적용](./features/equalizer.mdx#auto-apply) 참조.

### v2.2.1
- Refactor: Preference Bound이 이제 기준 (DF) 타겟이 아닌, 밴드 중심에 맞춰 정렬됩니다. 이는 그래프 정렬을 보다 직관적으로 만들지만, 이전 버전과 비교했을 때 일부 차이가 나타날 수 있습니다.
- Refactor: 샘플 / 채널 선택기가 더 넓은 폭을 차지하도록 조정되어, 작은 화면에서의 사용성을 개선했습니다.
- Refactor: 코드베이스 전반에 걸친 여러 최적화 기법을 적용하여 로딩 시간을 단축했습니다.

### v2.2.0
- Feat: 기기 등급을 `phone_book.json` 대신 게시된 스프레드시트([squigRanking](https://potatosalad775.github.io/squigRanking/docs) 시트 또는 임의의 CSV)에서 읽어올 수 있게 되었습니다. 시트만 수정하면 재배포 없이 등급이 갱신됩니다. 등급 스케일이 정의된 경우 색상 배지로 표시됩니다. 새로운 `RANKING` 섹션에서 설정하며, 기존 `RANKING_URL`을 대체합니다(해당 키도 계속 동작합니다). 자세한 내용은 [RANKING 문서](./guide-for-admins/customize-page.mdx#ranking) 참조.

### v2.1.9

- Feat: 채널 별 이퀄라이저 기능이 추가되어, 사용자가 좌우 채널에 대해 서로 다른 EQ 설정을 독립적으로 적용할 수 있게 되었습니다.
- Feat: 쉼표로 구분된 검색 기능이 추가되어, 사용자가 한 번에 여러 기기를 검색할 수 있게 되었습니다. 이는 비교하고자 하는 모든 기기가 포함된 데이터베이스를 찾는 데 유용할 수 있습니다.

### v2.1.8

- Feat: 현재 표시되고 있는 모든 측정치를 하나의 그래프로 평균화하는 '평균화' 기능이 추가되었습니다.
- Feat: 사이트 선택창이 이제 squig.link를 제외한 커뮤니티 데이터베이스도 표시하도록 개선되었습니다.
- Feat: 이제 필터 파일을 불러오거나, AutoEQ를 실행하거나, 외부 기기의 PEQ 값을 불러오거나, 첫 필터를 추가하는 등의 동작을 수행할 경우 자동으로 이퀄라이저가 활성화됩니다.
- Feat: EQ 필터가 비어있는 상태에서 AutoEQ를 실행할 경우, 이제 1개가 아닌 8개의 필터가 자동으로 생성됩니다.
- Refactor: 이제 사용자가 선택한 기기가 목록의 최상단에 우선 표시됩니다.
- Refactor: 이제 EQ 필터를 내보낼 경우, 기기 및 타겟의 이름이 파일 이름에 포함됩니다.
- Fix: EQ 스윕 시그널 재생 시, 사용자가 지정한 청취 영역이 제대로 적용되지 않던 문제가 수정되었습니다.

### v2.1.7

- Feat: 기기 항목에 서식 있는 `description`(링크, 강조 등 일부 인라인 HTML 허용)과, 기본 제공되는 Review / Shop 링크 옆에 표시되는 운영자 정의 링크 배열 `links[]`를 추가할 수 있습니다. [서식 있는 설명](./guide-for-admins/manage-data.mdx#rich-descriptions)과 [커스텀 링크](./guide-for-admins/manage-data.mdx#custom-links) 문서를 참고하세요.
- Fix: `variants[]`가 phone 레벨의 `file` / `suffix` / `prefix` / `samples` / `hptfs` 형식을 무시하고 덮어쓰던 문제를 수정했습니다. 이제 두 형식이 합쳐지므로, 샘플 세트를 사용하면서도 CrinGraph 호환성을 유지할 수 있습니다. [샘플 세트 문서](./guide-for-admins/manage-data.mdx#sample-sets)를 참고하세요.

### v2.1.6

- Feat: 다중 샘플과 HpTF 측정을 하나의 **샘플 세트(Sample Set)** 개념으로 통합했습니다. 여러 번 측정한 variant를 평균 곡선, 측정별 곡선, 최소/최대 음영 밴드 또는 그 조합으로 그릴 수 있습니다. 예전에는 어느 쪽으로도 표현할 수 없던 "평균선 + 편차 밴드"도 이제 가능합니다. 새 `variants[]` 스키마로 variant마다 선언하세요. [샘플 세트 문서](./guide-for-admins/manage-data.mdx#sample-sets)를 참고하세요.
- Feat: `MULTI_SAMPLE`과 `HPTF`를 대체하는 새 `SAMPLES` 설정 섹션(`DEFAULT_COUNT`, `DEFAULT_DISPLAY`, `FILL_OPACITY`)을 추가했습니다. 사이트 전역 기본 측정 횟수를 지정하면 모든 기기를 같은 횟수로 측정하는 데이터베이스는 항목마다 설정할 필요가 없습니다. [SAMPLES 문서](./guide-for-admins/customize-page.mdx#samples)를 참고하세요.
- Feat: 개별 샘플 곡선마다 L, R, AVG를 각각 켜고 끌 수 있습니다.
- Feat: `config.js`에 새로운 `DOWNLOAD` 옵션을 추가하여 사용자가 측정치 데이터을 내보낼 수 있도록 했습니다. 다운로드 버튼은 기본적으로 비활성화되어 있습니다. 자세한 내용은 [DOWNLOAD 문서](./guide-for-admins/customize-page.mdx#download)를 참고하세요.
- Fix: 개별 측정을 켜고 끌 때 그래프 이름표가 함께 갱신되며, '검사 모드'에서도 모든 종류의 샘플마다 이름표를 표시합니다.
- Fix: 다중 샘플 기기의 평균 곡선을 숨길 수 있게 되었고, 개별 그래프가 실제 편차를 유지하도록 수정했습니다.
- Deprecated: modernGraphTool 전용 키인 `hptfs[]`와 `MULTI_SAMPLE` / `HPTF` 설정 섹션은 지금도 작동하지만, 향후 버전에서 제거될 예정입니다. [phone_book.json 편집기](/phone-book-editor)와 [Config Editor](/config-generator)에서 파일을 불러왔다가 다시 내보내면 변환됩니다. [사용 중단: `hptfs[]`](./guide-for-admins/manage-data.mdx#deprecated-hptfs) 문서를 참고하세요.

### v2.1.5

- Feat: Sine Sweep 재생 기능, A/B 테스트 기능, 편집 취소/다시 실행 기능을 포함하여 이퀄라이저 기능을 대폭 개선했습니다.
- Feat: GraphAggregator를 적용하여, 외부 데이터베이스의 기기 목록 검색이 더욱 빠르고 안정적으로 개선되었습니다.
- 현지화: 체코어 지원 추가 (by @adam664)
- Fix: EQ 우회 시 음량 일치, `\` EQ 우회 키를 비롯한 다수의 EQ 관련 버그 수정
- Fix: 기준선 그래프 렌더링 불일치, 모바일 기기에서의 선호도 경계(Preference Bound) 표시 문제 수정
- Fix: 실행 취소/다시 실행, variant 삭제, 타겟 중복 관련 여러 데이터 동기화 문제 수정

### v2.1.4

- 현지화: 러시아어 및 우크라이나어에 대한 새로운 번역 추가 (by @reallystates)
- 수정: 서브픽셀 반올림으로 인한 의도치 않은 줄임표 표시를 방지하기 위해 MenuCarousel 버튼에 작은 버퍼 추가

### v2.1.3

- Refactor: 'FR 업로드' 버튼이 이제 이름을 기반으로 L/R 채널 파일을 자동으로 처리하도록 변경되었습니다.
- Refactor: MenuCarousel 버튼이 이제 내부 텍스트 길이에 따라 너비를 조정하여 더 긴 번역에서 발생하는 오버플로우 문제를 방지합니다.
- Fix: L/R 채널 위치 불일치 문제 수정

### v2.1.2

- Fix: 색상 랜덤화 기능이 제대로 작동하지 않던 문제 수정
- Fix: 그래프 핸들을 통한 y축 위치 조정 시 선호도 경계가 제대로 따라가지 않던 문제 수정

### v2.1.1

- Feat: `config.js`에 새로운 "CURVE_COLOR_PALETTE" 필드를 추가, 기기 곡선에 사용되는 색상 팔레트를 사용자 정의할 수 있도록 변경. 자세한 내용은 [TRACE_STYLING 문서](./guide-for-admins/customize-page.mdx#trace_styling) 참조
- Feat: `config.js`에 새로운 "PANEL_POSITION" 필드를 추가, 데스크톱 인터페이스에서 메뉴 패널의 위치를 사용자 정의할 수 있도록 변경. 자세한 내용은 [INTERFACE 문서](./guide-for-admins/customize-page.mdx#interface) 참조
- Refactor: 오디오 플레이어를 업데이트하여 탐색 간에도 동일한 인스턴스를 유지하도록 변경, 다양한 패널 간 전환 시 재생 상태와 위치를 유지할 수 있도록 개선
- Change: 메뉴 패널이 이제 CrinGraph의 일반적인 UI 관례를 따라 데스크톱 인터페이스의 왼쪽에 기본적으로 배치됩니다.
- Change: modernGraphTool의 새 버전이 로드될 때 표시되는 토스트 알림 추가
- Refactor (squig-link): 사이트 간 검색 성능 개선

### v2.1.0

- Feat: `config.js`에 새로운 "RANKING_URL" 필드를 추가, 기기 선택기의 랭킹 표시기가 사용자 정의 URL로 연결되도록 변경. 자세한 내용은 [RANKING_URL 문서](./guide-for-admins/customize-page.mdx#ranking_url) 참조
- Fix: 페이지 로드 시 구성된 기본값으로 y축 스케일 버튼이 제대로 초기화되지 않던 문제 수정
- Fix: phone_book의 단일 항목이 잘못된 형식일 때 해당 항목만 건너뛰는 대신 전체 기기가 사라지던 문제 수정

### v2.0.9

- Fix: 기준선 그래프 렌더링과 관련된 여러 문제를 수정, 특정 정규화 옵션 사용 시 잘못된 기준선 표시 및 일부 경우 기준선 요소의 정렬 문제 해결

### v2.0.8

- Fix: 스크린샷이 현재 테마와 독립적으로 작동하도록 변경하여 라이트/다크 모드 설정과 관계없이 일관된 모습을 보장합니다.

### v2.0.7

- Feat: 동일한 기기의 새 variant를 빠르게 추가할 수 있도록 variant 선택기에 플러스 버튼 추가
- Feat: EQ 및 AutoEQ 항목이 유형과 라벨별로 정렬되도록 변경
- Feat: 폰과 타겟이 각각 하나씩만 선택된 경우 EQ와 AutoEQ가 자동으로 선택되도록 수정

### v2.0.6

- Feat: 정규화 연결 및 AutoEQ 지속 옵션이 포함된 새로운 EQ 설정 구성 요소 추가
- Feat: EQ 그래프를 원본 그래프에 고정하는 옵션 추가, 정규화 설정과 무관하게 원본 측정값 대비 상대 위치를 유지
- Feat: AutoEQ 입력값을 기억하는 옵션 추가, 현재 탭에서만 유지 또는 브라우저에 계속 저장 선택 가능
- Refactor: 넓은 화면을 보다 효율적으로 사용할 수 있도록 EQ 패널 레이아웃 개선

### v2.0.5

- Feat: 지원되는 기기 목록과 안내 사항이 포함된 devicePEQ 정보 다이얼로그 추가
- Refactor: Switch 컴포넌트의 색상 체계를 변경하여 대비와 접근성 향상
- Refactor: Normalizer 기능이 키 입력에 따라 실시간으로 바뀌도록 변경
- Fix: 특정 정규화 옵션에서 HpTF 편차 범위가 잘못 정렬되던 문제 수정
- Fix: variant 선택기가 화면을 벗어나지 않도록 수정
- Fix: 여러 화면 요소에 누락된 Hover 효과 추가

### v2.0.4

- Refactor: phone_book의 단일 `hptf` 필드를 `hptfs` 배열로 교체. 각 `hptfs` 항목은 독립적인 variant가 됩니다
- Refactor: 번호가 매겨진 `L1.txt`/`R1.txt`가 없을 때 다중 샘플 variant가 번호 없는 `L.txt`/`R.txt`로 폴백
- Refactor: 사용자 정의 값인 타겟 조정(Target Adjustment) 라벨의 번역 제거
- Fix: AVG 채널 표시 시 HpTF 편차 음영이 L+R 결합 포락선을 사용하도록 수정
- Fix: `dispSuffix`가 비어 있을 때 variant 선택기의 화살표 아이콘이 사라지던 문제 수정
- Fix: `"suffix": [""]`처럼 명시적으로 빈 문자열을 지정한 suffix 항목이 `"0"`으로 처리되던 `_getSuffix` 버그 수정

### v2.0.3

- Feat: 그래프에 타겟 조정(Target Adjustment) 라벨 추가
- Feat: 기타(Misc) 패널에 버전 정보 표시
- Fix: Target Customizer가 타겟 이름을 올바르게 정규화하지 못해 일부 타겟이 목록에서 누락되던 문제 수정
- Fix: 타겟이 많을 때 타겟 선택기의 수평 스크롤바가 제대로 표시되지 않던 문제 수정

### v2.0.2

- Fix: 선호도 경계의 타겟 경로가 하드코딩되어 있던 문제 수정
- Fix: 사용자의 언어 선택이 기억되지 않던 문제 수정
- Fix: jsDelivr의 느린 버전 업데이트 문제 수정 — GitHub를 사용하도록 변경

### v2.0.1

- Fix: CDN 빌드에서 Web Worker 기반 AutoEQ가 작동하지 않던 문제 수정

### v2.0.0

- v2 최초 릴리스