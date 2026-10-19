# dobidugi.github.io

학습한 내용을 AI와 함께 정리해 발행하는 개인 기술 블로그.

강의·컨퍼런스 영상·기술 문서를 학습하며 Obsidian vault에 노트로 정리하고, AI를 적극 활용해 요약·구조화한 뒤 블로그 글로 발행한다. 직접 운영하며 겪은 인프라 트러블슈팅 같은 실전 기록도 함께 올린다.

[Astro](https://astro.build)와 [AstroPaper](https://github.com/satnaing/astro-paper)를 사용하는 정적 사이트다. GitHub Actions를 통해 GitHub Pages에 자동 배포된다.

## 구조

- `src/content/log/` — 블로그 글 (Obsidian vault에서 임포트된 마크다운)
- `src/pages/` — 홈(`/`), 글 목록(`/log/`), 글 상세(`/log/<slug>/`), 카테고리(`/categories/<category>/`), 태그, 검색, 소개
- `astro-paper.config.ts` — 사이트 정보, 테마 기능, 소셜 링크
- `src/lib/categories.ts` — 카테고리 표시 이름과 경로, 복수 카테고리 집계
- `scripts/import-vault.mjs` — 로컬 Obsidian vault(`~/developments/vault`)의 노트를 블로그 글로 변환
- `public/2048/` — 기존 2048 게임 (https://dobidugi.github.io/2048/)

## 글 발행 워크플로우

1. Obsidian vault에서 노트 작성/수정
2. 새 노트라면 `scripts/import-vault.mjs`의 `NOTES` 배열에 항목 추가 (경로, slug, 카테고리)
3. 임포트 & 확인 & 배포:

```bash
npm run import:vault   # vault → src/content/log 변환
npm run dev            # 로컬 미리보기 (http://localhost:4321)
npm run build          # 타입 검사 + 정적 빌드 + 한국어 검색 인덱스
npm run verify:theme   # 기존 URL·카테고리·내부 링크·수식·RSS 회귀 검사
git add -A && git commit -m "post: ..." && git push   # push하면 자동 배포
```

임포트 스크립트가 하는 일:

- Obsidian 위키링크(`[[...]]`) → 내부 링크 또는 일반 텍스트
- 콜아웃(`> [!info]`) → 색상 라벨
- mermaid 코드블록 → 클라이언트 렌더링용 `<pre class="mermaid">`
- 민감 식별자(비식별 처리 대상) 검출 시 임포트 전체 중단

## 테마

AstroPaper의 기본 레이아웃과 색상, 밝은/어두운 테마를 사용한다. 홈과 글 목록은 전체 글을 표시하며 카테고리 링크는 자바스크립트 없이도 작동한다. 한글 본문에는 로컬 Pretendard, 메뉴와 영문에는 Google Sans Code를 사용한다.

기존 `date` 필드는 콘텐츠 스키마에서 AstroPaper의 `pubDatetime`으로 연결하므로 Markdown과 vault 임포터를 바꿀 필요가 없다. 글 URL은 `/log/<slug>/`를 유지한다. 수식은 KaTeX로 빌드하고 Mermaid는 필요한 페이지에서만 불러온다. 검색은 빌드 후 `npm run preview`에서 확인할 수 있다.

원본 테마 출처와 변경 범위는 [THEME.md](THEME.md), MIT 고지는 [licenses/AstroPaper.txt](licenses/AstroPaper.txt)에 보존한다.

## 배포

`master` push → `.github/workflows/deploy.yml` → Astro 빌드 → GitHub Pages.
(Settings → Pages → Source가 **GitHub Actions**로 설정되어 있어야 한다.)
