# AstroPaper 적용 기록

- 원본: https://github.com/satnaing/astro-paper
- 가져온 커밋: `35cfa7fbe0b897306d27670d3819e55d5205f3dd`
- 원본 테마 버전: 6.1.0 (이 커밋의 프레임워크는 Astro 7)
- 라이선스: MIT. 원문을 `licenses/AstroPaper.txt`에 보존한다.
- 실행 환경: Node.js 22.12 이상, npm. `package-lock.json`을 함께 관리한다.

## 이 블로그에 맞춘 변경

1. 원본의 헤더, 푸터, 카드, 태그, 페이지 탐색, 검색, 색상과 스타일을 사용한다. 우주 배경과 로켓 아이콘은 제거했다.
2. 기존 `src/content/log`와 `/log/<slug>/`, `scripts/import-vault.mjs`, 정적 이미지 및 `/2048/`를 유지한다. 스키마가 원본 frontmatter를 AstroPaper에 연결한다.
3. 홈에 전체 글 수와 모든 글을 표시한다. 15개 카테고리를 정적 URL로 연결하고 복수 카테고리를 중복 없이 집계한다.
4. 한국어 UI, 날짜, 글 읽는 시간, 원문 링크, 목차, 코드 복사, 가로 스크롤 표를 제공한다.
5. 로컬 Google Sans Code와 Pretendard를 사용해 빌드 때 외부 폰트 서버에 의존하지 않는다. Pretendard 라이선스는 `public/fonts/Pretendard-LICENSE.txt`, Google Sans Code 라이선스는 설치 패키지에 포함된다.
6. KaTeX와 기존 Mermaid HTML을 보존한다. Mermaid는 테마 및 페이지 이동에 따라 다시 렌더링하며 로컬 번들로 제공한다.
7. 동적 OG 생성과 MDX 등 사용하지 않는 원본 기능은 포함하지 않는다. `public/og.png`는 이 블로그의 정적 공유 이미지다. `og-source.svg`가 편집 가능한 원본이다.
8. 기존 Google Analytics 식별자를 유지하며 배포 호스트에서만 로드한다. 로컬 시안 조회는 분석에 기록하지 않는다.

## 확인

```sh
npm ci
npm run build
npm run verify:theme
npm run preview
```

`build`는 타입 검사와 Pagefind 검색 인덱스를 포함한다. `verify:theme`는 원래 글 URL, 카테고리별 글, 내부 이미지/링크, 수식, RSS, 검색 파일, 2048의 보존을 검사한다. Mermaid와 메뉴·검색·테마 전환은 브라우저에서도 확인한다.

이 변경은 커밋·푸시·배포를 자동으로 수행하지 않는다. 기존대로 `master`에 push할 때 GitHub Actions가 배포한다.

## 의존성 패치

2026-10-19 기준, KaTeX 0.18.2와 js-yaml 3.15.2를 사용하고 Typography의 postcss-selector-parser를 7.1.6으로 고정했다. `package.json`의 overrides는 이 패치 버전들이 간접 의존성에도 적용되도록 한다. KaTeX의 세 수학 글과 Mermaid를 함께 확인한다.

현재 남은 npm audit 경고 4개(moderate)는 하나의 미패치 `sprintf-js` CLI 이슈가 `argparse → js-yaml → gray-matter`에 전파된 결과다. 이 블로그는 gray-matter의 라이브러리 API만 사용하며 해당 CLI를 호출하지 않는다. 브라우저 번들에도 포함되지 않는다. 추후 업데이트할 때 다시 확인한다. [관련 advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)
