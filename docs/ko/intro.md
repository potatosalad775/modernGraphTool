---
title: 소개
editUrl: true
head: []
template: doc
sidebar:
  order: 1
  hidden: false
  attrs: {}
pagefind: true
draft: false
---

import { CardGrid, LinkCard } from '@astrojs/starlight/components';

modernGraphTool은 헤드폰과 이어폰의 주파수 응답(FR) 측정 데이터를 시각화하고 비교하는 웹 도구입니다. 측정 데이터 불러오기, 여러 그래프 겹치기, 타겟·EQ 적용, 결과 공유까지 모두 브라우저에서 바로 처리합니다.

완전한 정적 사이트로 배포되므로 폴더 하나를 아무 웹 서버에 올리면 되고, CDN 모드를 쓰면 업데이트도 자동으로 받습니다. 모든 기능이 내장되어 있어 `config.js` 파일 하나로 설정하며, CrinGraph와 같은 데이터 형식을 읽습니다.

프로젝트의 배경이 궁금하다면 [modernGraphTool이 뭔가요?](./why-moderngraphtool.mdx)를 보시면 됩니다.

## 어디서부터 볼까요?

<CardGrid>
	<LinkCard
		title="사용자 가이드"
		href="./guide-for-users/"
		description="측정 데이터베이스를 둘러보는 중이라면, 그래프 읽는 법과 기기 비교, EQ를 익혀 보세요."
	/>
	<LinkCard
		title="운영자 가이드"
		href="./guide-for-admins/"
		description="측정 데이터베이스를 운영한다면, 배포하고 데이터를 추가하고 페이지를 꾸미는 법을 확인하세요."
	/>
	<LinkCard
		title="기능"
		href="./features/"
		description="이퀄라이저부터 크로스 사이트 검색까지, 내장 기능 각각이 하는 일을 설명합니다."
	/>
	<LinkCard
		title="개발자 가이드"
		href="./guide-for-developers/overview/"
		description="modernGraphTool에 기여하기 위한 구조, 테스트, 빌드 내부 구조를 다룹니다."
	/>
</CardGrid>

이미 v1이나 CrinGraph 사이트를 운영 중이라면 [v2의 새로운 기능](./whats-new-in-v2.mdx)과 거기서 안내하는 마이그레이션 가이드를 참고하세요.

:::tip[AI 어시스턴트와 함께 문서 사용하기]
모든 페이지는 순수 마크다운으로도 제공됩니다. URL 뒤에 `.md`를 붙이면 됩니다 (이 페이지는
[`/ko/intro.md`](/ko/intro.md)).

문서 전체를 넘기려면 [`/llms.txt`](/llms.txt)를 알려주세요. 전체 문서뿐 아니라 운영자 가이드,
사용자 가이드, 개발자 가이드로 나눈 작은 묶음도 함께 안내하므로, 사이트 전체 대신 필요한 부분만
전달할 수 있습니다. (이 묶음들은 영문 문서 기준입니다.)
:::