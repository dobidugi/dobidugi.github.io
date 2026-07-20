---
title: "사용할수록 똑똑해지는 AI 비서  OpenClaw 대항마 Hermes Agent, 윈도우 VMware 환경에서 설치 가이드"
date: 2026-05-19
category: "YOUTUBE"
tags: ["youtube","Hermes-Agent","Nous-Research","AI-Agent","VMware-Workstation","Ubuntu","WSL","자율형-AI","OpenClaw","Telegram-Bot","Hermes-WebUI"]
description: "Hermes Agent는 Nous Research가 개발하여 GitHub에 오픈소스로 공개한 고급 자율형 AI 에이전트다. 사용자의 서버나 노트북에서 항상 실행되면서, 사용할수록 스스로 학습하고 성…"
source: "https://www.youtube.com/watch?v=XmWfm8gxlIo"
minutes: 10
---
> [YouTube에서 보기](https://www.youtube.com/watch?v=XmWfm8gxlIo) | 영상 길이: 16분 39초

---

## 요약

### 1. Hermes Agent란 무엇인가 [00:00]

Hermes Agent는 **Nous Research**가 개발하여 GitHub에 오픈소스로 공개한 **고급 자율형 AI 에이전트**다. 사용자의 서버나 노트북에서 항상 실행되면서, 사용할수록 스스로 학습하고 성장하는 것이 핵심 특징이다.

영상은 도입부에서 "사용할수록 점점 더 똑똑해지는 AI 비서가 있다면 믿으시겠습니까?"라는 질문으로 시작한다. 일반적인 AI 챗봇과의 가장 큰 차이점은 다음과 같다:

- **한 번 가르쳐준 내용을 기억**한다
- **반복한 작업은 스스로 익혀** 스킬로 자동 저장한다
- **매일 자동으로 일을 처리**한다 (스케줄 기반)
- 비슷한 요청이 들어오면 이전에 배운 내용을 활용해 더 빠르고 정확하게 처리한다
- Telegram, Discord, Slack, 이메일, 터미널 등 다양한 환경에서 사용 가능

즉, 마치 사람처럼 경험이 쌓일수록 점점 더 유능해지는 AI라는 점이 차별화 포인트다.

### 2. 왜 Hermes Agent로 갈아타는가 — 기존 도구 3가지 한계 [01:02]

이미 OpenClaw, Claude Code, LangChain 같은 강력한 도구들이 있는데도 사용자들이 Hermes Agent로 이동하는 이유는 실제 사용자 후기 기준 **세 가지 한계** 때문이다.

**첫째, 메모리가 없다.**
기존 도구들은 대화가 끝나면 맥락이 사라진다. 다음에 다시 접속하면 처음 만나는 사람처럼 같은 내용을 다시 설명해야 한다. 반면 Hermes는 작업이 끝날 때마다 자동으로 기억을 저장하고, 과거 대화·작업 기록을 실시간으로 검색할 수 있다.

**둘째, 불안정하다.**
일부 사용자는 게이트웨이 서버를 하루에 한 번씩 재시작해야 했다고 말한다. 자동화를 위해 도입했는데, 정작 도구를 관리하는 데 더 많은 시간을 쓰게 되는 역설이 발생한다. 반면 Hermes는 일주일 이상 재시작 없이 안정적으로 동작했다는 후기가 많다.

**셋째, 비용이 불투명하다.**
AI 모델이 얼마나 많은 토큰을 사용했고 왜 비용이 늘었는지 파악하기 어렵다. Hermes는 **OpenRouter와 연동**하면 모델별 비용을 한눈에 비교할 수 있고, 명령어 한 번으로 더 저렴한 모델로 즉시 변경 가능하다.

요약하면 — **기억 부족, 안정성 결여, 비용 불투명**. 이 세 가지가 Hermes로 넘어오는 가장 큰 이유다.

### 3. 설치 환경 선택 — 왜 VMware + Ubuntu인가 [02:20]

OpenClaw와 Hermes Agent는 주로 macOS나 Linux 환경에서 많이 사용되지만, 대부분의 사용자는 여전히 Windows를 쓴다. 그래서 이 영상은 **Windows 위에서 VMware Workstation Pro로 Ubuntu를 띄우고, 그 위에서 Hermes Agent를 설치**하는 방식을 택한다.

또 하나의 장벽은 Hermes Agent가 **터미널 기반 CLI**로 동작한다는 점이다. 개발자에게는 익숙하지만 일반 사용자에게는 부담스럽기 때문에, 영상 후반에는 **Hermes WebUI**(브라우저 GUI)도 함께 다룬다. WebUI를 사용하면 터미널에서 가능한 모든 기능을 웹에서도 그대로 사용 가능하다.

### 4. VMware Workstation Pro 설치 [03:25]

VMware Workstation Pro는 Windows PC 안에서 Ubuntu 같은 운영체제를 별도의 컴퓨터 없이 실행할 수 있게 해주는 가상화 소프트웨어다. 예전에는 유료였으나 현재는 **개인 용도로 무료** 제공된다.

**다운로드 절차:**
1. 브라우저에서 "VMware Workstation Pro"를 검색 → **Broadcom Support Portal** 접속
2. 우측 상단 **Register** 버튼으로 계정 생성 (몇 분 소요)
3. 재검색 후 VMware 공식 사이트에서 로그인 → 자동으로 **My Downloads** 페이지 이동
4. 안내 문구의 **HERE 링크** 클릭 → 제품 목록 맨 아래 **VMware Workstation Pro** 선택
5. **Windows용 최신 버전** 다운로드

발표자는 "Broadcom 사이트에서 다운로드 파일을 찾기가 생각보다 쉽지 않다"며, 위와 같이 재검색하는 우회 방법을 권한다. 다운로드한 설치 파일은 일반 프로그램과 동일하게 **Next 버튼을 계속 눌러** 진행하면 된다.

### 5. Ubuntu ISO 준비 및 가상 머신 생성 [05:16]

가상 머신에 설치할 운영체제로 Ubuntu를 준비한다.

**Ubuntu 다운로드:**
- 브라우저에서 "우분투" 검색 → **Download Ubuntu Desktop** 페이지 접속
- 현재 PC 환경에 맞는 **최신 Ubuntu Desktop ISO 파일** 다운로드

**가상 머신 생성 단계:**
1. VMware Workstation Pro 실행 → **Create a New Virtual Machine** 클릭
2. **Typical** 옵션 그대로 → Next
3. **Installer disc image file (ISO)** 선택 → 다운로드한 Ubuntu ISO 지정
4. 사용자 이름·비밀번호 입력 (설치 후 자동으로 계정 생성됨)
5. 가상 머신 이름: `Ubuntu 64bit`, 저장 폴더 지정
6. 디스크 용량: 기본 25GB 이상이면 학습용으로 충분, 발표자는 **100GB**로 설정
7. **Customize Hardware** 클릭하여 자원 조정:
   - **메모리: 4GB 이상** 권장 (발표자는 8GB)
   - **CPU: 2개 이상** 권장 (발표자는 4개)
8. Close → Finish → 가상 머신 생성 + Ubuntu 자동 설치

설치가 끝나면 Ubuntu 바탕화면이 나타나고, 이제 Windows PC 안에서 Ubuntu를 자유롭게 사용할 수 있다.

### 6. Ubuntu 기본 설정 [07:32]

본격적인 Hermes Agent 설치 전, Ubuntu를 사용하기 편한 상태로 만든다.

**한글 입력 설정:**
- 화면 우측 상단 `ko` 버튼 클릭 → **한국어(Hangul)** 선택
- 이후 **Shift + Space** 키로 한글/영어 전환

**Chrome 브라우저 설치 (Firefox → Chrome 교체):**
1. Firefox 실행 → "크롬 브라우저 다운로드" 검색
2. Google Chrome 공식 사이트에서 **Linux용 설치 파일** 다운로드
3. 다운로드 폴더에서 설치 파일 마우스 우클릭 → **앱 센터로 열기** → **설치하기**
4. 설치 완료 후 좌측 하단 앱 표시 메뉴에서 Chrome 실행
5. 좌측 Dock의 Chrome 아이콘 우클릭 → **도커에 고정** (상시 표시)

**Terminal Dock 고정:**
Hermes Agent는 터미널에서 자주 다루기 때문에 Chrome처럼 Dock에 고정한다.

### 7. Hermes Agent 설치 [09:01]

브라우저에서 "Hermes Agent"를 검색 → 공식 홈페이지 접속 → 표시된 **INSTALL 명령어 복사** → Terminal에 우클릭으로 붙여넣기 실행.

**설치 중 자주 발생하는 에러 처리 (발표자가 강조한 부분):**
- **첫 번째 에러: curl이 없다**
  - 화면에 표시되는 명령어를 그대로 입력하면 curl이 설치된다
- **두 번째 에러: Git이 없다**
  - 다시 화면 안내대로 명령어 입력 → Git 설치
- Git 설치 후 Hermes Agent 설치 명령어를 한 번 더 입력하면 자동으로 설치 진행

설치가 끝나면 **Hermes Agent 초기 설정 화면**이 자동으로 나타난다.

### 8. Hermes Agent 초기 설정 — AI 모델 & API 키 [09:58]

처음 사용하는 경우 기본 추천 설정을 그대로 선택한다. 발표자는 **추천 빠른 설치 방식**으로 진행한다.

**AI 모델 선택:**
Hermes Agent는 OpenAI, Anthropic, Google 등 **20여 종 이상의 AI 모델**을 지원한다. 원하는 모델을 선택한 뒤 해당 서비스의 API 키를 입력한다. 유료 모델은 사용량에 따라 요금이 청구되니 주의가 필요하다.

발표자의 선택:
- **Google AI Studio**에서 발급한 API 키 사용
- 모델: **Gemini 3 Flash Preview**

API 키 발급 방법은 모델 이름과 함께 검색하면 쉽게 확인 가능하다.

**터미널 Backend:** 기본값 사용.

**메시징 앱 연결:** 일단 **Skip** (뒤에서 다시 설정하는 방법을 보여주기 위해).

발표자는 "중간에 단계를 건너뛰더라도 언제든 다시 설정 가능"이라고 강조한다. 초기 설정 과정 자체는 **OpenClaw와 매우 비슷**해서 두 프로그램을 비교 학습하기 좋다.

설정이 완료되면 화면에 표시되는 명령어를 입력하면 된다. 이후 추가 설정이 필요할 때는 터미널에 **`hermes setup`**을 입력하면 동일한 설정 화면이 다시 나타난다.

### 9. Telegram 봇 연결 — 원격 제어 [11:28]

Hermes Agent는 **20여 개 이상의 메시징 앱과 연동** 가능하며, 연결된 앱을 통해 원격 제어가 가능하다. 발표자는 Telegram을 예시로 시연한다.

**Bot Token 생성:**
1. Telegram에서 **@BotFather** 검색 → 가장 상단 공식 봇 선택 → **START**
2. `/newbot` 명령어 입력
3. 봇 이름 입력 (발표자: `Hermes Agent`)
4. Username 입력 — **중복 불가, 반드시 `bot`으로 끝나야 함** (발표자: `playwithailab_hermes_agent_bot`)
5. 설정 완료 시 표시되는 **HTTP API Token** 복사 → Hermes Agent의 **Telegram Bot Token** 항목에 붙여넣기

**User ID 입력:**
1. Telegram에서 **@userinfobot** 검색 → START
2. 숫자 형태로 표시되는 **User ID** 복사 → Hermes Agent 설정에 붙여넣기

이후 단계는 기본값 사용 또는 Skip. 모든 설정이 끝나면 Telegram을 통해 **언제 어디서든 원격 제어**가 가능해진다.

### 10. Hermes Agent 실행 및 활용 분야 [13:08]

터미널에서 **`hermes`** 입력 + Enter → Hermes Agent 실행.

실행 화면을 보면 현재 선택한 AI 모델이 **29개의 툴(tool)과 82개의 스킬(skill)**을 사용할 수 있다고 안내한다. 즉, 단순히 질문에 답하는 수준이 아니라 다양한 도구를 직접 사용해 **복잡한 작업까지 자동으로 처리**할 수 있다는 의미다.

**주요 활용 분야 (발표자 제시):**
- **콘텐츠 제작 워크플로**: 블로그 초안 작성 → 자료 조사 → 이미지 생성 → SNS 업로드까지 하나의 흐름으로 자동화
- **소프트웨어 개발 자동화**: 코드 작성, 버그 수정, 테스트, 배포 준비까지 반복 업무 대폭 감소
- **자료 조사**: 웹 검색 → 정보 정리 → 요약 보고서 작성 자동화
- **시장 조사·업무 자동화 일반**

핵심 메시지는 "콘텐츠 제작·개발·시장 조사·업무 자동화 등 다양한 분야에서 강력한 AI 비서처럼 활용 가능"하다는 것.

### 11. Hermes WebUI — 브라우저 GUI 환경 [14:18]

Hermes 생태계가 빠르게 확장되면서 터미널 대신 직관적인 화면을 원하는 사용자가 늘었고, 이런 사용자들에게 인기를 얻는 것이 **Hermes WebUI**다. ChatGPT처럼 익숙한 화면에서 Hermes Agent를 사용할 수 있게 해주는 **브라우저 기반 대시보드**다.

**설치 절차:**
1. 브라우저에서 "Hermes WebUI" 검색 → 공식 페이지 접속
2. 표시된 설치 명령어 복사
3. Terminal 열고 설치할 위치로 이동 → 명령어 붙여넣기 실행
4. 다운로드 완료 후 설치 폴더로 이동
5. **`start.sh`** 명령어 실행

잠시 후 화면에 **로컬 URL**이 표시된다. 그 주소를 우클릭 → **링크 열기** 하면 브라우저가 자동으로 열리고 **Hermes WebUI 대시보드**가 나타난다.

**WebUI 구성:**
- **좌측: 대화 목록**
- **우측: 채팅 화면**
- 구성은 **ChatGPT와 매우 비슷**해서 입력창에 내용 입력만으로 Hermes Agent와 바로 대화 시작

### 12. 무료로 시작하는 팁과 마무리 [15:30]

처음 사용하는 사람들에게 발표자가 권하는 방식은 **OpenRouter의 무료 모델**로 부담 없이 시작하는 것이다. Hermes Agent에서 지원하는 모델 중에는 무료로 사용 가능한 것도 있기 때문이다.

**핵심 인사이트:**
- 환경 구성 절차가 많아 보여 복잡하게 느껴질 수 있지만, 대부분 **기본값으로 진행**하면 되므로 차근차근 따라 하면 어렵지 않다
- 이번 설치는 **Hermes Agent 하나만의 환경**이 아니라, OpenClaw를 비롯해 **앞으로 등장할 다양한 AI 에이전트를 실험할 수 있는 기본 연구 환경**을 만드는 과정이라는 점이 핵심
- 즉, VMware + Ubuntu 조합은 **재사용 가능한 AI 에이전트 실험 베이스**다

발표자는 직접 설치 후 **콘텐츠 제작·소프트웨어 개발·자료 조사·업무 자동화**에 어떻게 활용할 수 있는지 직접 경험해 볼 것을 권하며, 앞으로도 최신 AI 에이전트와 실전 자동화 활용법을 쉽고 자세히 소개하겠다는 약속으로 영상을 마무리한다.

---

## 키워드

Hermes-Agent, Nous-Research, OpenClaw, AI-Agent, VMware-Workstation-Pro, Ubuntu-Desktop, Telegram-Bot-Token, Hermes-WebUI, OpenRouter, Gemini-3-Flash-Preview, Google-AI-Studio, BotFather, 자율형-AI-에이전트, 메모리-기반-에이전트, CLI-vs-GUI
