---
title: "pnpm과 npm, 무엇이 다르고 언제 선택하면 좋을까?"
date: 2026-09-07
category: "FE"
tags: ["reference","프론트엔드","Node","pnpm","npm","패키지매니저"]
description: "npm과 pnpm의 차이는 패키지 파일의 재사용 방식과 의존성을 노출하는 구조에 있다. 프로젝트의 요구와 팀의 실행 환경을 기준으로 선택하고, 버전과 lock 파일을 함께 관리한다."
minutes: 3
---
> <span class="co co-abstract">📋 요약 한 줄 요약</span>
> npm과 pnpm의 차이는 패키지 파일의 재사용 방식과 의존성을 노출하는 구조에 있다. 프로젝트의 요구와 팀의 실행 환경을 기준으로 선택하고, 버전과 lock 파일을 함께 관리한다.

npm과 pnpm은 모두 `package.json`에 적힌 패키지를 설치하는 도구다. 일상적으로 사용하는 명령어도 비슷하다. 차이는 패키지 파일을 저장하고, 프로젝트에서 의존성을 찾아 쓰게 만드는 방식에 있다.

## 같은 패키지를 여러 프로젝트에서 쓴다면

두 프로젝트가 같은 버전의 React를 사용한다고 해보자. npm은 각 프로젝트의 `node_modules`에 패키지를 설치한다. 다운로드한 데이터는 캐시에 보관하므로, 프로젝트를 만들 때마다 모든 패키지를 다시 내려받는 것은 아니다. [npm 캐시 문서](https://docs.npmjs.com/cli/v11/commands/npm-cache/)

pnpm은 공용 저장소에 보관한 패키지 파일을 여러 프로젝트에서 재사용한다. 비슷한 의존성을 사용하는 프로젝트가 많을수록 디스크 공간을 절약하기 좋다. 실제 연결 방식은 파일시스템과 설정에 따라 달라지므로 절약되는 용량이나 설치 속도를 일정한 배수로 계산하기는 어렵다. [pnpm 저장 방식](https://pnpm.io/motivation)

## 직접 설치하지 않은 패키지가 보이는 이유

또 다른 차이는 **직접 설치하지 않은 패키지가 코드에서 보일 수 있는가**다.

```text
내 프로젝트
└─ package-a
   └─ package-b
```

프로젝트에 `package-a`만 추가했지만, 코드에서 `package-b`를 직접 가져다 쓸 수 있는 경우가 있다. npm의 기본 설치 구조에서는 중복을 줄이기 위해 하위 의존성이 상위 `node_modules`로 배치되기도 하기 때문이다. 이를 호이스팅이라고 한다.

이렇게 직접 선언하지 않은 패키지에 의존하면, `package-a`를 업데이트했을 때 코드가 갑자기 실행되지 않을 수 있다. 우리 코드가 사용하는 패키지는 `package.json`에도 직접 선언하는 편이 안전하다.

pnpm의 기본 구조는 최상위에 직접 의존성을 연결하므로 이런 누락을 발견하는 데 도움이 된다. pnpm도 내부적으로 호이스팅을 사용하지만, 의존성 패키지끼리 접근하는 영역과 애플리케이션에 공개되는 영역을 구분한다. 필요한 경우 공개 범위를 바꿀 수 있으며, 설정은 사용 중인 버전의 문서를 기준으로 적용한다. [pnpm 의존성 배치와 설정](https://pnpm.io/settings/node-modules)

## 자주 쓰는 명령어

자주 쓰는 명령어는 다음과 같다.

| 작업 | npm | pnpm |
|---|---|---|
| 의존성 설치 | `npm install` | `pnpm install` |
| 패키지 추가 | `npm install zod` | `pnpm add zod` |
| 개발용 패키지 추가 | `npm install -D vite` | `pnpm add -D vite` |
| 패키지 제거 | `npm uninstall zod` | `pnpm remove zod` |
| 개발 서버 실행 | `npm run dev` | `pnpm run dev` |
| CI 설치 | `npm ci` | `pnpm install --frozen-lockfile` |

## 팀에서 버전과 lock 파일 맞추기

팀에서는 명령어보다 실행 버전과 lock 파일을 일치시키는 것이 중요하다. npm은 `package-lock.json`, pnpm은 `pnpm-lock.yaml`을 사용한다. 하나의 프로젝트에서 두 매니저를 번갈아 사용하기보다 팀이 정한 매니저와 lock 파일을 함께 관리한다.

기존 프로젝트에 참여했다면 `packageManager` 필드, README, CI 설정부터 확인한다. Corepack은 프로젝트가 지정한 패키지 매니저와 버전을 실행하도록 돕는다. Node.js 25부터 기본 배포에 포함되지 않지만 별도로 설치해 사용할 수 있다. [Corepack 공식 문서](https://github.com/nodejs/corepack)

## 워크스페이스와 선택 기준

npm과 pnpm 모두 워크스페이스를 지원한다. pnpm에서는 `pnpm-workspace.yaml`로 여러 앱과 공용 패키지를 묶고, `--filter`로 특정 패키지의 작업을 실행할 수 있다. 이런 방식이 팀의 개발 흐름에 잘 맞는지도 선택 기준이 된다. [pnpm 워크스페이스](https://pnpm.io/workspaces)

여러 프로젝트의 파일을 재사용하거나 의존성 누락을 빨리 발견하고 싶다면 pnpm을 검토할 만하다. 기존 환경이 npm으로 안정적으로 운영되고 있고 바꿔야 할 문제가 없다면 npm을 계속 사용해도 된다.
