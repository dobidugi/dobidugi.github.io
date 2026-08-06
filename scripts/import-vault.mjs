// Obsidian vault의 노트를 블로그 콘텐츠(src/content/log)로 변환한다.
// 변환 내용: 위키링크 → 내부 링크, Obsidian 콜아웃 → 라벨, mermaid 코드블록 → <pre class="mermaid">
// 실행: npm run import:vault  (vault가 있는 로컬 머신에서만 실행, CI에서는 실행하지 않음)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const VAULT = process.env.VAULT_PATH ?? '/Users/ytlee/developments/vault';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/content/log');

// 공개 금지 식별자 안전망 — 하나라도 검출되면 임포트 전체 중단
const FORBIDDEN = /sanvel|ark-korea|ark-inc|c7awmccqc41d|315054051|590183915415/i;

const NOTES = [
  // References
  { src: 'References/Infra/ECS Fargate 셋업 가이드.md', slug: 'ecs-fargate-setup-guide', category: 'INFRA' },
  { src: 'References/Infra/ECS 배포·롤백.md', slug: 'ecs-deploy-rollback', category: 'INFRA' },
  { src: 'References/Infra/ECS 트러블슈팅.md', slug: 'ecs-troubleshooting', category: 'INFRA' },
  { src: 'References/CS/가상 스레드와 논블로킹 IO.md', slug: 'virtual-thread-nonblocking-io', category: 'CS' },
  { src: 'References/CS/Oauth.md', slug: 'oauth', category: 'CS' },
  { src: 'References/CS/Oauth 인증.md', slug: 'oauth-social-login', category: 'CS' },
  { src: 'References/Architecture/DDD 개념 정리.md', slug: 'ddd-concepts', category: 'ARCHITECTURE' },
  { src: 'References/Architecture/BFF 패턴 (Backend for Frontend).md', slug: 'bff-pattern', category: 'ARCHITECTURE' },
  { src: 'References/Architecture/MSA API Gateway와 라우팅.md', slug: 'msa-api-gateway', category: 'ARCHITECTURE' },
  { src: 'References/Spring/Spring SseEmitter.md', slug: 'spring-sse-emitter', category: 'SPRING' },
  { src: 'References/Spring/Spring OAuth2 Client.md', slug: 'spring-oauth2-client', category: 'SPRING' },
  { src: 'References/Security/접근제어(RBAC, ABAC).md', slug: 'access-control-rbac-abac', category: 'SECURITY' },
  { src: 'References/Security/암복호화.md', slug: 'encryption-decryption', category: 'SECURITY' },
  { src: 'References/RN/Expo.md', slug: 'expo', category: 'RN' },
  { src: 'References/Kotlin/코틀린 컴파일러 플러그인 (all-open, no-arg).md', slug: 'kotlin-compiler-plugin-allopen-noarg', category: 'KOTLIN' },
  { src: 'References/FE/Cornerstone3D/Cornerstone3D 시작하기 — 개념·기본 사용법·뷰포트 종류.md', slug: 'cornerstone3d-getting-started', category: 'FE' },
  { src: 'References/FE/Cornerstone3D/Cornerstone3D 로 JPG·PNG 까지 렌더링하기.md', slug: 'cornerstone3d-custom-image-loader', category: 'FE' },
  { src: 'References/FE/Cornerstone3D/Cornerstone3D 첫 렌더 검은 화면 (Apple GPU · ANGLE Metal).md', slug: 'cornerstone3d-black-first-render', category: 'FE' },
  // 강의 노트
  { src: 'lecture-notes/조합 메소드로 run 메소드 리팩토링하기.md', slug: 'composed-method-refactoring', category: 'LECTURE' },
  { src: 'lecture-notes/값 객체(Value Object).md', slug: 'value-object', category: 'LECTURE' },
  { src: 'lecture-notes/메서드 추출 리팩토링.md', slug: 'extract-method-refactoring', category: 'LECTURE' },
  { src: 'lecture-notes/참조 객체와 값 객체 - 작은 클래스 만들기.md', slug: 'reference-vs-value-object', category: 'LECTURE' },
  // 유튜브 요약
  { src: 'youtube-summaries/Long Polling vs SSE vs WebSockets vs QUIC Simply Explained.md', slug: 'long-polling-sse-websocket-quic', category: 'YOUTUBE' },
  { src: 'youtube-summaries/배달의 민족 주문~! ServerSentEvents로 실시간 알림 전송하기 우아콘2025.md', slug: 'woowacon2025-sse-realtime-notification', category: 'YOUTUBE' },
  { src: 'youtube-summaries/AI 코딩 그렇게 하는 거 아닌데 - 켄트 백 (40년차).md', slug: 'kent-beck-ai-coding', category: 'YOUTUBE' },
  { src: 'youtube-summaries/DDD 그거 그렇게 하는 거 아닌데 #우아콘2024 #우아한형제들.md', slug: 'woowacon2024-ddd', category: 'YOUTUBE' },
  { src: 'youtube-summaries/사용할수록 똑똑해지는 AI 비서  OpenClaw 대항마 Hermes Agent, 윈도우 VMware 환경에서 설치 가이드.md', slug: 'hermes-agent-install-guide', category: 'YOUTUBE' },
  { src: 'youtube-summaries/[10분 테코톡] 미미의 좋은 API 설계하기.md', slug: 'tecotalk-good-api-design', category: 'YOUTUBE' },
  { src: 'youtube-summaries/[10분 테코톡] 모찌의 의존성 주입.md', slug: 'tecotalk-dependency-injection', category: 'YOUTUBE' },
  { src: 'youtube-summaries/I Tested GPT 5.5 vs Opus 4.7 What You Need to Know.md', slug: 'gpt55-vs-opus47', category: 'YOUTUBE' },
  // 블로그 리뷰
  { src: 'blog-summaries/AI 시대 코프링은 살아남을 수 있을까.md', slug: 'kopring-in-ai-era', category: 'REVIEW' },
  { src: 'blog-summaries/KotlinLLM 스마트 매크로 IntelliJ 플러그인.md', slug: 'kotlinllm-intellij-plugin', category: 'REVIEW' },
  { src: 'blog-summaries/DESIGN.md 에이전트를 위한 디자인 시스템 포맷.md', slug: 'design-md-agent-design-system', category: 'REVIEW' },
  // 회고
  { src: '회고/원티드 프론트엔드 프리온보딩 인턴쉽 회고록.md', slug: 'wanted-preonboarding-internship-retrospective', category: 'JOURNAL' },
];

// 위키링크 해석용: 노트 파일명(확장자 제외) → slug
const linkMap = new Map(
  NOTES.map((n) => [path.basename(n.src, '.md'), n.slug])
);

const CALLOUT_LABEL = {
  info: 'ℹ️ INFO', note: '📝 NOTE', abstract: '📋 요약', summary: '📋 요약', tldr: '📋 TL;DR',
  tip: '💡 TIP', hint: '💡 HINT', success: '✅', check: '✅', done: '✅',
  warning: '⚠️ 주의', caution: '⚠️ 주의', attention: '⚠️ 주의', question: '❓',
  danger: '🚨 위험', error: '🚨 ERROR', bug: '🐛 BUG', failure: '🚨', fail: '🚨',
  example: '🧪 예시', quote: '💬',
};

function transformCallouts(text) {
  return text.replace(
    /^([ \t]*>\s*)\[!(\w+)\][+-]?\s*(.*)$/gm,
    (_, prefix, type, title) => {
      const t = type.toLowerCase();
      const label = CALLOUT_LABEL[t] ?? `📌 ${type.toUpperCase()}`;
      const text = title.trim() ? `${label} ${title.trim()}` : label;
      return `${prefix}<span class="co co-${t}">${text}</span>`;
    }
  );
}

// "## 관련 노트"의 항목 중 블로그에 발행하지 않는 노트를 가리키는 줄은 제거한다.
// (vault에는 링크를 남겨두고, 공개 글에서만 죽은 참조가 안 보이게 한다)
function dropUnpublishedRelatedLinks(text) {
  const lines = text.split('\n');
  const out = [];
  let inSection = false;
  for (const line of lines) {
    if (/^## /.test(line)) inSection = /^## 관련 노트\s*$/.test(line);
    if (inSection && /^\s*[-*]\s/.test(line)) {
      const targets = [...line.matchAll(/\[\[([^\]|#]+)/g)].map((m) => m[1].trim());
      if (targets.length > 0 && targets.every((t) => !linkMap.has(t))) continue; // 전부 미발행 → 줄 제거
    }
    out.push(line);
  }
  // 항목이 모두 사라져 제목만 남은 "## 관련 노트" 섹션은 통째로 제거
  return out
    .join('\n')
    .replace(/\n## 관련 노트\s*\n+(?=(##\s|$))/g, '\n')
    .replace(/\n## 관련 노트\s*\n*$/, '\n');
}

function transformWikilinks(text, currentSrc) {
  // 이미지/노트 임베드는 블로그에서 지원하지 않으므로 라인 제거
  text = text.replace(/^.*!\[\[[^\]]+\]\].*$\n?/gm, (line) => {
    console.warn(`  ⚠ 임베드 제거 (${currentSrc}): ${line.trim().slice(0, 60)}`);
    return '';
  });
  return text.replace(
    /\[\[([^\]|#]+)(#[^\]|]*)?(?:\|([^\]]+))?\]\]/g,
    (_, target, _anchor, alias) => {
      const name = target.trim();
      const display = (alias ?? name).trim();
      const slug = linkMap.get(name);
      return slug ? `[${display}](/log/${slug}/)` : display;
    }
  );
}

function transformMermaid(text) {
  return text.replace(/```mermaid\n([\s\S]*?)```/g, (_, code) => {
    const escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<pre class="mermaid">\n${escaped}</pre>`;
  });
}

function stripFirstH1(text) {
  return text.replace(/^\s*# .+\n/, '');
}

function cleanInline(line) {
  return line
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#|]/g, '')
    .trim();
}

function deriveDescription(text) {
  // 1순위: 요약성 콜아웃(abstract/summary/info)의 본문 첫 줄
  const lines = text.split('\n');
  const coIdx = lines.findIndex((l) => /class="co co-(abstract|summary|tldr|info)"/.test(l));
  if (coIdx >= 0) {
    const next = lines.slice(coIdx + 1).find((l) => /^\s*>\s*\S/.test(l));
    if (next) {
      const cleaned = cleanInline(next.replace(/^\s*>\s*/, ''));
      if (cleaned.length > 15) {
        return cleaned.length > 110 ? cleaned.slice(0, 110) + '…' : cleaned;
      }
    }
  }
  // 2순위: 첫 일반 문단
  const plain = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<pre class="mermaid">[\s\S]*?<\/pre>/g, '')
    .replace(/^\s*([#>|-]|!|\d+\.|\/).*$/gm, '')
    .split('\n')
    .map(cleanInline)
    .filter((l) => l.length > 20);
  const first = plain[0] ?? '';
  return first.length > 110 ? first.slice(0, 110) + '…' : first;
}

function toDateString(fmDate, filePath) {
  let d;
  if (fmDate instanceof Date && !isNaN(fmDate)) d = fmDate;
  else if (typeof fmDate === 'string' && !isNaN(Date.parse(fmDate))) d = new Date(fmDate);
  else d = fs.statSync(filePath).mtime; // frontmatter에 날짜가 없거나 깨진 경우
  return d.toISOString().slice(0, 10);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let count = 0;
for (const note of NOTES) {
  const filePath = path.join(VAULT, note.src);
  if (!fs.existsSync(filePath)) {
    console.warn(`✗ 파일 없음, 건너뜀: ${note.src}`);
    continue;
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  const { data: fm, content } = matter(raw);

  let body = content;
  body = stripFirstH1(body);
  body = transformCallouts(body);
  body = dropUnpublishedRelatedLinks(body);
  body = transformWikilinks(body, note.src);
  body = transformMermaid(body);
  body = body.trim() + '\n';

  const title = typeof fm.title === 'string' && fm.title.trim()
    ? fm.title.trim()
    : path.basename(note.src, '.md');
  const date = toDateString(fm.date, filePath);
  const tags = Array.isArray(fm.tags) ? fm.tags.map(String) : [];
  const description = deriveDescription(body);
  const minutes = Math.max(1, Math.round(body.length / 700));
  const source = typeof fm.source === 'string' && fm.source.startsWith('http') ? fm.source : null;

  const lines = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `date: ${date}`,
    `category: ${JSON.stringify(note.category)}`,
    `tags: ${JSON.stringify(tags)}`,
    description ? `description: ${JSON.stringify(description)}` : null,
    source ? `source: ${JSON.stringify(source)}` : null,
    `minutes: ${minutes}`,
    '---',
    '',
  ].filter((l) => l !== null);

  const output = lines.join('\n') + body;

  const hit = output.match(FORBIDDEN);
  if (hit) {
    throw new Error(`공개 금지 식별자 "${hit[0]}" 검출: ${note.src} — 임포트 중단`);
  }

  fs.writeFileSync(path.join(OUT, `${note.slug}.md`), output);
  console.log(`✓ ${note.slug}  ←  ${note.src}`);
  count++;
}

console.log(`\n완료: ${count}/${NOTES.length}개 노트 임포트`);
