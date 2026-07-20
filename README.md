# dobidugi.github.io

학습한 내용을 AI와 함께 정리해 발행하는 개인 기술 블로그.

강의·컨퍼런스 영상·기술 문서를 학습하며 Obsidian vault에 노트로 정리하고, AI를 적극 활용해 요약·구조화한 뒤 블로그 글로 발행한다. 직접 운영하며 겪은 인프라 트러블슈팅 같은 실전 기록도 함께 올린다.

[Astro](https://astro.build) 정적 사이트로, GitHub Actions를 통해 GitHub Pages에 자동 배포된다.

## 구조

- `src/content/log/` — 블로그 글 (Obsidian vault에서 임포트된 마크다운)
- `src/pages/` — 홈(`/`), 글 목록(`/log/`), 글 상세(`/log/<slug>/`)
- `scripts/import-vault.mjs` — 로컬 Obsidian vault(`~/developments/vault`)의 노트를 블로그 글로 변환
- `public/2048/` — 기존 2048 게임 (https://dobidugi.github.io/2048/)

## 글 발행 워크플로우

1. Obsidian vault에서 노트 작성/수정
2. 새 노트라면 `scripts/import-vault.mjs`의 `NOTES` 배열에 항목 추가 (경로, slug, 카테고리)
3. 임포트 & 확인 & 배포:

```bash
npm run import:vault   # vault → src/content/log 변환
npm run dev            # 로컬 미리보기 (http://localhost:4321)
git add -A && git commit -m "post: ..." && git push   # push하면 자동 배포
```

임포트 스크립트가 하는 일:

- Obsidian 위키링크(`[[...]]`) → 내부 링크 또는 일반 텍스트
- 콜아웃(`> [!info]`) → 색상 라벨
- mermaid 코드블록 → 클라이언트 렌더링용 `<pre class="mermaid">`
- 민감 식별자(비식별 처리 대상) 검출 시 임포트 전체 중단

## 배포

`master` push → `.github/workflows/deploy.yml` → Astro 빌드 → GitHub Pages.
(Settings → Pages → Source가 **GitHub Actions**로 설정되어 있어야 한다.)
