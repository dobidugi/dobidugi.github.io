---
title: "KotlinLLM: LLM이 런타임에 코드를 진화시키는 IntelliJ 플러그인"
date: 2026-08-02
category: "REVIEW"
tags: ["reference","article-summary","AI","kotlin","jvm","intellij","llm","codegen","agentic-dev"]
description: "asLlm<F, T>(from, hint) 한 줄로 \"LLM이 구현해주는 함수\"를 선언하면, 앱 실행 중 미지원 시나리오를 만났을 때만 LLM 에이전트가 좁은 범위의 Kotlin 코드를 생성 → 컴…"
source: "https://github.com/JetBrains-Research/kotlinllm-plugin"
minutes: 7
---
> <span class="co co-abstract">📋 요약 한 줄 요약</span>
> `asLlm<F, T>(from, hint)` 한 줄로 "LLM이 구현해주는 함수"를 선언하면, 앱 실행 중 미지원 시나리오를 만났을 때만 LLM 에이전트가 좁은 범위의 Kotlin 코드를 생성 → 컴파일 → **JDI 핫 리로드**로 갈아끼우고, 성공한 구현은 **일반 Kotlin 소스로 영구 저장**되어 다음부터는 LLM 호출 없이 실행되는 JetBrains Research의 실험적 IntelliJ 플러그인. "LLM을 매 호출마다 부르는 런타임 위임"과 "한 번 생성하고 끝나는 코드젠"의 중간 지점을 노린 설계다.

---

## 1. 무엇인가 — Smart Macro라는 개념

Kotlin/JVM 프로젝트에서 쓰는 IntelliJ IDEA 플러그인 프로토타입. **Smart macro**라는 개념을 실험한다:

> Smart macro = 동작이 **생성된 Kotlin 소스 코드**로 뒷받침되는 명시적 Kotlin 호출

공개 API는 단 두 개다:

```kotlin
import com.jetbrains.kotlinllm.asLlm
import com.jetbrains.kotlinllm.mockLlm

// F 타입 값을 T 타입으로 변환 (변환 로직을 LLM이 생성)
val apiUrl: String = asLlm("JetBrains/kotlin", hint = "Return a GitHub issues API URL")

// 인터페이스 T의 구현체 생성 (메서드 동작이 런타임 상호작용에서 진화)
val service: GithubService = mockLlm()
```

> <span class="co co-important">📌 IMPORTANT 핵심 차별점: LLM은 "모를 때만" 호출된다</span>
> 매 호출마다 LLM API를 부르는 런타임 위임 방식이 아니다. 생성된 코드가 처리 못 하는 시나리오를 만났을 때만 LLM이 개입하고, 성공한 동작은 **생성된 Kotlin 파일로 저장**되어 이후 실행은 그 코드를 직접 실행한다. 설계 목표 세 가지:
> - LLM 기반 동작이 **호출 지점에서 명시적**일 것 (`asLlm` 호출이 곧 표시)
> - **소스 코드로 영속**될 것 (커밋 가능, 리뷰 가능)
> - 생성 후에는 **평범한 Kotlin으로 이식 가능**할 것 (플러그인 없이도 컴파일·실행)

## 2. 아키텍처 — 3계층

| 계층 | 구성 | 소유 |
|---|---|---|
| Public API | `asLlm`, `mockLlm` 함수 (안정 인터페이스) | 대상 프로젝트 |
| Static 인프라 | `AsLlmManager` / `MockLlmManager` — 호출을 생성된 provider로 라우팅 | 대상 프로젝트 |
| Dynamic 인프라 | 생성된 bootstrap·provider·parser·mock 클래스 | 플러그인이 생성·갱신 |

- API 파일(`KotlinLlm.kt`)은 템플릿으로 제공되며 대상 프로젝트에 복사해 넣는다. `AsLlmParser<F, T>` 인터페이스와 매니저 객체가 전부인 얇은 파일.
- 매니저는 첫 `asLlm`/`mockLlm` 호출 시 `Class.forName("...generated.core.KotlinLlmBootstrap")`으로 **지연 부트스트랩** — 앱 코드에 수동 초기화 호출이 필요 없다.
- 생성 소스는 대상 프로젝트 안에 산다: `generated/core`(부트스트랩·provider), `generated/asLlm`(파서 구현), `generated/mockLlm`(목 구현). provider는 `KType` 기준으로 디스패치.

## 3. 런타임 플로우 — 디버거를 코드 진화 루프로 쓴다

`Run with KotlinLLM` 전용 실행기로 앱을 띄우면:

1. 프로젝트에서 `asLlm`/`mockLlm` 호출 지점 스캔
2. 생성 파일들(bootstrap/provider/parser/mock) 생성·갱신
3. 원래 런 구성을 **JDI(Java Debug Interface) 아래에서** 실행
4. 생성 코드 안의 **regenerate hook에 브레이크포인트** 등록
5. 생성된 로직이 처리 못 하는 시나리오 → regenerate hook 도달 (조용히 틀린 값을 반환하지 않고 훅으로 떨어지는 게 규칙)
6. 중단된 프레임에서 **실제 런타임 값과 타입 정보 캡처**
7. LLM 에이전트가 도구를 들고 투입되어 코드 업데이트 제출
8. 플러그인이 생성 소스에 반영 → 컴파일 → **실행 중인 VM의 클래스를 재정의(hot reload)**
9. 원래 호출을 새 구현으로 **재시도**

> <span class="co co-note">📝 NOTE 인사이트: 디버거 인프라의 전용</span>
> 브레이크포인트·프레임 검사·클래스 재정의라는 디버거 기능을 "사람의 디버깅"이 아니라 **LLM의 코드 진화 루프**에 전용한 설계가 이 프로젝트의 재미 포인트. JVM의 JDI 클래스 재정의에 의존하기 때문에 Kotlin/JVM 전용이다.

## 4. LLM 에이전트 구성

- JetBrains의 Kotlin 에이전트 프레임워크 **Koog** 기반, OpenAI 백엔드(내부적으로 Grazie 경유 옵션도 존재). API 키는 대상 프로젝트의 `.kotlinllm` 파일에 저장 (`Tools > KotlinLLM Settings`).
- 에이전트는 프로젝트 파일을 마음대로 고치는 게 아니라 **준비된 구현 본문만** 갱신한다 — 의도적으로 좁은 권한.
- 에이전트에게 주어지는 도구들이 흥미롭다:
  - `readActualValues` — 중단 프레임에서 캡처한 실제 값 읽기
  - `grepActualInput` — 큰 입력(예: 수백 KB JSON)을 통째로 넣지 않고 **grep으로 탐색** (페이지네이션 지원)
  - `readTargetType` — 변환 목표 타입의 구조 확인
  - `readPreviousError` / `readPreviousSubmittedCase` — 직전 실패·제출 이력 확인 (자기 수정 루프)
  - **toolbelt** — 생성 과정에서 만든 재사용 가능한 Kotlin 유틸 함수를 등록·조회하는 저장소 (`listToolbeltFunctions` / `registerToolbeltFunction`)

## 5. 예제

- **GithubIssueRadar** (독립 Kotlin/JVM 샘플): 레포 URL → `asLlm`으로 이슈 API URL 유도 → GitHub 이슈 JSON 파싱 → 초심자 친화 라벨 분류까지 전부 `asLlm`으로 처리. 생성된 소스가 포함되어 있어 학습된 동작을 일반 Kotlin으로 검사·실행 가능
- **imperative-petclinic-kotlin**: Spring PetClinic의 Kotlin 명령형 포팅 — 더 현실적인 앱에서의 실험용

## 6. 요구사항 및 현황

- IntelliJ IDEA 2025.2.x, JDK 21, OpenAI API 키
- Apache 2.0 라이선스
- 레포에 **석사 논문 PDF**(thesis.pdf)가 포함된 연구 프로토타입 — 프로덕션 도구가 아니라 JetBrains Research의 실험이다 (마지막 커밋 2026-06)

---

## 핵심 요약

- **Smart macro** = 호출은 명시적(`asLlm`/`mockLlm`), 구현은 LLM이 생성한 Kotlin 소스. LLM은 미지원 시나리오에서만 개입하고 성공한 동작은 소스로 굳는다 → 매 호출 LLM 위임보다 싸고 결정적이며, 생성 후엔 플러그인 없이도 도는 평범한 코드.
- 실행 흐름은 **JDI 기반**: regenerate hook 브레이크포인트 → 런타임 값 캡처 → 에이전트 코드 생성 → 컴파일 → 클래스 재정의 → 재시도. 디버거 인프라를 코드 진화 루프로 전용했다.
- 에이전트는 Koog 기반으로 좁은 도구 세트(값 읽기, grep, 타입 검사, 이전 오류, toolbelt)만 갖고 **준비된 구현 본문만** 수정 — 권한을 좁혀 예측 가능성을 확보.
- "LLM을 런타임 컴포넌트가 아니라 **개발 시점의 코드 생성기**로, 단 실제 런타임 데이터를 보고 생성하게" 하는 중간 지대 실험이라는 점이 핵심 아이디어.

## 복습 질문

1. Smart macro가 "매 호출마다 LLM에 위임"하는 방식과 "한 번 생성하고 끝나는 코드젠" 각각과 어떻게 다른가?
2. 왜 이 플러그인은 Kotlin/JVM 전용인가? 런타임 진화 루프에서 JDI가 하는 역할 두 가지는?
3. 생성된 구현이 새로운 시나리오를 처리하지 못할 때 "조용히 틀린 값을 반환"하는 대신 어떻게 동작해야 하는가? 그 이유는?
4. 에이전트에게 `grepActualInput` 같은 도구를 주는 이유를 컨텍스트 관리 관점에서 설명해보라.
5. 생성된 소스를 프로젝트에 커밋할 수 있다는 점이 왜 "이식성(portability)" 목표와 연결되는가?

## 관련 노트

- [AI 시대 코프링은 살아남을 수 있을까](/log/kopring-in-ai-era/) — 에이전트 시대 Kotlin/JVM 생태계 관점, JetBrains의 대응 사례로 연결됨
- AI 토큰 사용량 전사 1위 개발자가 148,000번의 대화에서 배운 것 — 에이전트에게 좁은 도구와 권한을 주는 설계 철학이 맞닿음
