---
title: "pnpm vs npm — 차이와 선택 기준"
date: 2026-09-07
category: "FE"
tags: ["reference","프론트엔드","Node","pnpm","npm","패키지매니저"]
description: "둘 다 package.json을 읽는 Node 패키지 매니저지만, pnpm은 global content-addressable store + hard link로 디스크와 설치 시간을 아끼고, hois…"
minutes: 9
---
> <span class="co co-abstract">📋 요약 한 줄 요약</span>
> 둘 다 `package.json`을 읽는 Node 패키지 매니저지만, pnpm은 **global content-addressable store + hard link**로 디스크와 설치 시간을 아끼고, **hoisting 없는 symlinked node_modules**로 선언하지 않은 패키지의 import(phantom dependency)를 막는다. 프로젝트에 `pnpm-lock.yaml`과 `packageManager` 필드가 있으면 pnpm이 정본이다.

## 개요

- **npm**: Node에 기본 포함된 패키지 매니저. 별도 설치 없이 쓸 수 있고 레퍼런스 구현 역할.
- **pnpm**: "performant npm". npm의 두 가지 고질적 문제(디스크 낭비, phantom dependency)를 구조적으로 해결하기 위해 나온 대안. yarn berry의 PnP와 달리 node_modules 디렉터리를 그대로 유지해서 기존 도구 호환성이 높다.
- 명령어 체계는 거의 같아서 npm을 알면 바로 쓸 수 있다.

## 1. 저장 방식 — copy vs hard link

| | npm | pnpm |
|---|---|---|
| 패키지 파일 위치 | 프로젝트마다 `node_modules`에 **복사** | 전역 content-addressable store(`~/Library/pnpm/store`)에 **한 번만** 저장 |
| 프로젝트와 연결 | 없음 (독립 복사본) | 저장소 → `node_modules/.pnpm/` **하드링크**, 그 위에 심볼릭 링크 |
| 같은 버전을 10개 프로젝트가 쓰면 | 10번 다운로드·10배 디스크 | 1번 다운로드·디스크 1배 |

- 하드링크라서 파일 내용은 하나인데 여러 경로에서 접근된다. `du`로 보면 프로젝트별로 용량이 잡히지만 실제 디스크 점유는 한 번이다.
- 캐시가 이미 있으면 네트워크 없이도 설치가 끝나서 CI·재설치가 빠르다.

## 2. node_modules 구조 — flat(hoisting) vs symlinked(non-flat)

**npm — flat node_modules (hoisting)**

```
node_modules/
  express/
  body-parser/      ← express의 의존성인데 최상위에 올라옴
  debug/            ← 마찬가지
```

- 중첩된 transitive dependency를 최상위로 끌어올려(hoist) 한 층에 펼친다. 중복 설치를 줄이는 게 목적.
- 부작용: `package.json`에 `express`만 적어도 `import "debug"`가 **동작한다**. 이것이 **phantom dependency**(유령 의존성). express가 나중에 debug를 버리면 내 코드가 이유 없이 깨진다.
- 버전 충돌이 나면 하나만 최상위에 올리고 나머지는 중첩되어, 어느 버전이 로드될지 트리 모양에 따라 달라진다.

**pnpm — symlinked node_modules (non-flat, no hoisting)**

```
node_modules/
  express -> .pnpm/express@4.19.2/node_modules/express
  .pnpm/
    express@4.19.2/node_modules/
      express/
      body-parser -> ../../body-parser@1.20.2/node_modules/body-parser
      debug -> ../../debug@2.6.9/node_modules/debug
```

- hoist하지 않는다. 최상위에는 **내가 직접 선언한 패키지만** symlink로 노출된다.
- 각 패키지는 `.pnpm/<이름>@<버전>/node_modules/` 안에 자기 의존성만 옆에 두고 산다. Node의 모듈 해석 규칙(상위 `node_modules`를 타고 올라감)을 그대로 이용해서 동작한다.
- 선언하지 않은 `debug`를 import하면 **즉시 에러**. 의존성 선언이 정직해진다.
- 대가: 일부 오래된 도구가 symlink를 못 따라가는 경우가 있다. 이때 `.npmrc`에 `shamefully-hoist=true` 또는 `public-hoist-pattern[]=...`으로 특정 패키지만 끌어올릴 수 있다. 이름 그대로 "부끄러운" 우회책이니 최소한으로.

## 3. lock 파일

| npm | pnpm |
|---|---|
| `package-lock.json` | `pnpm-lock.yaml` |

- 서로 **호환되지 않는다**. 한 프로젝트에 둘 다 있으면 누가 어떤 매니저로 설치했느냐에 따라 결과가 달라진다. 하나만 남긴다.
- `pnpm import`로 `package-lock.json`을 `pnpm-lock.yaml`로 변환할 수 있다.
- CI에서는 `npm ci` ↔ `pnpm install --frozen-lockfile` 이 대응된다. lock과 `package.json`이 어긋나면 실패시킨다.

## 4. 명령어 대응표

| 하려는 일 | npm | pnpm |
|---|---|---|
| 의존성 설치 | `npm install` | `pnpm install` (`pnpm i`) |
| 패키지 추가 | `npm install zod` | `pnpm add zod` |
| dev 의존성 추가 | `npm install -D vite` | `pnpm add -D vite` |
| 제거 | `npm uninstall zod` | `pnpm remove zod` |
| 스크립트 실행 | `npm run dev` | `pnpm dev` (`run` 생략 가능) |
| 일회성 실행 | `npx biome check` | `pnpm dlx biome check` / `pnpm exec biome check` |
| 업데이트 | `npm update` | `pnpm update` (`pnpm up`) |
| 왜 설치됐는지 | `npm ls debug` | `pnpm why debug` |
| lock 고정 설치(CI) | `npm ci` | `pnpm install --frozen-lockfile` |

- `pnpm dlx`는 설치 안 된 패키지를 임시로 받아 실행(npx와 같음), `pnpm exec`는 이미 설치된 바이너리 실행. npx는 둘을 하나로 뭉쳐놨다.

## 5. monorepo workspace

- pnpm은 `pnpm-workspace.yaml` 하나로 워크스페이스를 정의한다. `workspace:*` 프로토콜로 내부 패키지를 참조하면 publish 시 실제 버전으로 치환된다.
- `pnpm -r run build`(재귀), `pnpm --filter <pkg> dev`(특정 패키지) 같은 필터링이 강력하다.
- npm도 v7부터 `workspaces` 필드를 지원하지만 필터링·격리 면에서 pnpm이 더 성숙하다. Turborepo, Nx 같은 도구도 pnpm과 조합이 흔하다.

## 6. pnpm 설치 방법과 corepack

pnpm은 Node에 포함되어 있지 않아서 **따로 설치**해야 한다. 방법은 세 가지.

| 방법 | 명령 | 특징 |
|---|---|---|
| npm으로 전역 설치 | `npm install -g pnpm@11.21.0` | 가장 단순. 프로젝트의 `packageManager` 버전과 맞춰 설치하면 된다 |
| Homebrew | `brew install pnpm` | 최신 버전이 깔린다. 버전 고정이 필요하면 부적합 |
| corepack | `corepack enable` | `packageManager` 필드를 읽어 버전을 자동으로 맞춘다. 단, Node 버전에 따라 corepack이 없을 수 있다(아래) |

### packageManager 필드

```json
{ "packageManager": "pnpm@11.21.0" }
```

- 프로젝트가 어떤 매니저·버전을 쓰는지 선언한다. pnpm 자체도 이 필드를 읽어서, 다른 버전으로 실행하면 경고한다.
- 팀원마다 pnpm 버전이 달라 lock 파일이 흔들리는 문제를 막는 용도.

### corepack — Node 버전에 따라 있고 없다

- corepack은 `packageManager` 필드를 읽어 선언된 매니저를 자동으로 내려받아 실행해주는 도구. `corepack enable`을 하면 `pnpm`, `yarn` 명령이 shim으로 생긴다.
- **Node 16.9 ~ 24**: Node 배포판에 **번들**되어 있어 `corepack enable`만 하면 된다.
- **Node 25 이상**: 배포판에서 **제거**되었다. `corepack` 명령이 없으므로 쓰려면 `npm install -g corepack`으로 따로 설치해야 한다. 이 경우 굳이 corepack을 거칠 이유가 줄어들어, 그냥 pnpm을 직접 설치하는 편이 단순하다.
- Homebrew로 설치한 Node도 corepack을 빼고 배포하는 경우가 있어, `which corepack`으로 먼저 확인한다.

> <span class="co co-tip">💡 TIP 실전 판단</span>
> `node -v`가 25 이상이면 `npm i -g pnpm@<packageManager 버전>`으로 바로 설치한다. 24 이하면 `corepack enable`이 가장 편하다.

## 예시

### 유령 의존성 재현

```bash
# npm
mkdir ghost-npm && cd ghost-npm && npm init -y
npm install express
node -e 'require("debug")'        # 동작함 — debug는 선언 안 했는데 hoisting으로 노출

# pnpm
mkdir ghost-pnpm && cd ghost-pnpm && pnpm init
pnpm add express
node -e 'require("debug")'        # Error: Cannot find module 'debug'
```

### 기존 프로젝트를 pnpm으로 정리

```bash
npm i -g pnpm@11.21.0             # Node 25+ (corepack 없음). Node ≤24 는 corepack enable
pnpm import                       # package-lock.json → pnpm-lock.yaml
rm package-lock.json              # lock 파일은 하나만
rm -rf node_modules && pnpm install
```

### symlink를 못 따라가는 도구 우회

```ini
# .npmrc
public-hoist-pattern[]=*eslint*
public-hoist-pattern[]=*prettier*
```

## 선택 기준

- **pnpm을 고른다**: 로컬에 프로젝트가 여러 개, monorepo, CI 설치 시간이 아깝다, dependency 선언을 엄격하게 관리하고 싶다(phantom dependency 차단).
- **npm으로 충분하다**: 단일 소규모 프로젝트, 추가 설치 없이 돌아가야 하는 환경(교육용 예제, 배포 스크립트), 팀이 pnpm에 익숙하지 않고 도입 비용을 감수할 이유가 없다.
- 어느 쪽이든 **lock 파일은 하나만**, `packageManager` 필드는 적어두는 것이 좋다.

## 링크

- [pnpm — Motivation](https://pnpm.io/motivation)
- [pnpm — Symlinked node_modules structure](https://pnpm.io/symlinked-node-modules-structure)
- [npm — package-lock.json](https://docs.npmjs.com/cli/configuring-npm/package-lock-json)
- [Node.js — corepack](https://nodejs.org/api/corepack.html)
