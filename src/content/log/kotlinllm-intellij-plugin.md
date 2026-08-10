---
title: "KotlinLLM: 실행 중에 LLM이 코드를 짜서 끼워넣는 IntelliJ 플러그인"
date: 2026-08-02
category: "REVIEW"
tags: ["reference","article-summary","AI","kotlin","jvm","intellij","llm","codegen","agentic-dev"]
description: "\"이 변환은 LLM이 알아서 구현해줘\"라고 코드에 한 줄 적어두면, 앱을 실행하다가 그 지점에서 막혔을 때 LLM이 실제 데이터를 보고 코드를 짜서 실행 중인 앱에 즉시 끼워넣고, 그 코드는 프로젝…"
source: "https://github.com/JetBrains-Research/kotlinllm-plugin"
minutes: 9
---
> <span class="co co-abstract">📋 요약 한 줄 요약</span>
> "이 변환은 LLM이 알아서 구현해줘"라고 코드에 한 줄 적어두면, 앱을 실행하다가 그 지점에서 막혔을 때 LLM이 실제 데이터를 보고 코드를 짜서 **실행 중인 앱에 즉시 끼워넣고**, 그 코드는 프로젝트에 평범한 Kotlin 파일로 저장되는 JetBrains Research의 실험용 IntelliJ 플러그인. 한 번 만들어진 코드는 다음부터 LLM 없이 그냥 실행된다.

## 1. 어떤 문제를 풀려는 건가

앱을 만들다 보면 "설명은 쉬운데 코드로 짜기는 귀찮은" 변환 로직이 많다. 예를 들어:

- GitHub 레포 주소를 주면 → 이슈 API 주소로 바꿔줘
- 이 JSON 덩어리를 → 우리 데이터 클래스로 파싱해줘
- 이 이슈 라벨들을 보고 → 초보자용 이슈인지 판단해줘

요즘은 이런 걸 LLM에게 시키는 방법이 두 가지 있다. 그런데 둘 다 아쉬운 점이 있다.

1. **매번 LLM API를 호출하기** — 잘 되지만, 호출마다 돈이 들고 느리고, 같은 입력에도 답이 달라질 수 있다.
2. **개발할 때 LLM으로 코드를 생성해두기** — 빠르고 공짜지만, 실제 런타임에 어떤 데이터가 들어올지 모른 채로 코드를 짜야 한다.

KotlinLLM은 이 둘의 중간을 실험한다: **평소에는 생성해둔 코드로 돌다가, 그 코드가 처리 못 하는 데이터를 실제로 만난 순간에만 LLM을 부른다.** 이때 LLM은 상상이 아니라 **지금 막 들어온 진짜 데이터**를 보면서 코드를 고친다.

## 2. 사용하는 입장에서 보면

개발자가 하는 일은 함수 호출 한 줄이 전부다:

```kotlin
// "JetBrains/kotlin" 같은 문자열을 이슈 API URL로 바꿔줘 — 방법은 LLM이 알아서
val apiUrl: String = asLlm("JetBrains/kotlin", hint = "Return a GitHub issues API URL")

// GithubService 인터페이스의 구현체를 만들어줘 — 동작은 실행하면서 채워짐
val service: GithubService = mockLlm()
```

이 `asLlm`, `mockLlm` 호출을 프로젝트에서는 **Smart macro**라고 부른다. 겉보기엔 평범한 함수 호출이지만, 실제 구현 코드는 플러그인과 LLM이 만들어서 채워준다는 점이 다르다.

그리고 처음 실행할 때 이런 일이 벌어진다:

1. `Run with KotlinLLM`이라는 전용 실행 버튼으로 앱을 켠다 (일반 Run 말고)
2. 앱이 `asLlm` 지점에 도착 → 아직 이 변환을 처리할 코드가 없다 → 앱이 그 자리에서 **일시정지**
3. 플러그인이 그 순간의 **실제 값**("JetBrains/kotlin"이라는 문자열, 목표 타입은 String)을 캡처해서 LLM에게 전달
4. LLM이 변환 코드를 작성 → 플러그인이 컴파일해서 **실행 중인 앱에 끼워넣음**
5. 멈췄던 지점부터 새 코드로 **재시도** → 앱은 아무 일 없었다는 듯 계속 진행

전체 흐름을 그림으로 보면 이렇다:

<pre class="mermaid">
sequenceDiagram
    participant App as 실행 중인 앱 (JVM)
    participant Plugin as KotlinLLM 플러그인
    participant LLM as LLM 에이전트 (Koog + OpenAI)
    App-&gt;&gt;App: asLlm("JetBrains/kotlin") 호출
    Note over App: 처리할 코드 없음 → regenerate hook에서 일시정지
    Plugin-&gt;&gt;App: JDI로 실제 값·타입 캡처
    Plugin-&gt;&gt;LLM: 캡처한 데이터 + 도구 전달
    LLM-&gt;&gt;LLM: 코드 작성 (grep, 타입 확인, 이전 실패 참고)
    LLM-&gt;&gt;Plugin: 구현 본문 제출
    Plugin-&gt;&gt;Plugin: 생성 소스에 반영 + 컴파일
    Plugin-&gt;&gt;App: 실행 중인 VM에 클래스 재정의 (hot reload)
    App-&gt;&gt;App: 멈춘 지점부터 재시도 → 계속 진행
</pre>

핵심은 그다음이다. 이때 만들어진 코드는 프로젝트 안에 **평범한 Kotlin 파일로 저장된다.** 두 번째 실행부터는 LLM이 전혀 필요 없다. 그냥 저장된 코드가 실행될 뿐이다. 이 파일은 커밋할 수도 있고, 코드 리뷰할 수도 있고, 플러그인 없는 환경에서도 컴파일된다.

> <span class="co co-important">📌 IMPORTANT 설계 목표 세 가지</span>
> - **명시적일 것** — `asLlm` 호출이 곧 "여기는 LLM이 만든 코드가 돈다"는 표시. 몰래 어딘가에서 마법이 일어나지 않는다
> - **소스로 남을 것** — 학습된 동작이 API 응답이 아니라 읽고 고칠 수 있는 Kotlin 파일로 존재
> - **이식 가능할 것** — 한 번 생성되면 평범한 Kotlin이라 어디서든 돈다

## 3. "실행 중인 앱에 코드를 끼워넣는다"는 게 어떻게 가능한가

여기가 이 프로젝트에서 제일 재미있는 부분이다. 비밀은 **디버거 인프라를 빌려 쓰는 것**이다.

IntelliJ에서 디버깅할 때를 떠올려 보자. 브레이크포인트에서 앱이 멈추고, 그 시점의 변수 값을 들여다보고, 심지어 코드를 고쳐서 실행 중인 앱에 반영(hot reload)할 수도 있다. JVM은 이걸 위해 **JDI(Java Debug Interface)** 라는 표준 통로를 제공한다.

KotlinLLM은 이 디버거용 기능들을 사람 대신 **LLM의 코드 수정 루프**에 쓴다:

| 디버거 기능 | 원래 용도 | KotlinLLM에서의 용도 |
|---|---|---|
| 브레이크포인트 | 사람이 멈추고 싶은 곳 지정 | 생성 코드가 처리 못 한 지점("regenerate hook")에 자동 설치 |
| 변수 검사 | 사람이 값 확인 | LLM에게 줄 실제 런타임 데이터 캡처 |
| 클래스 재정의 | 사람이 고친 코드 반영 | LLM이 고친 코드를 실행 중인 VM에 반영 |

생성된 코드에는 규칙이 하나 있다: 처리 못 하는 입력을 만나면 **조용히 틀린 값을 반환하지 말고, regenerate hook으로 떨어질 것.** 그래야 플러그인이 "아, 여기 코드가 부족하구나"를 알아채고 LLM을 부를 수 있다.

이 구조가 JVM의 클래스 재정의 기능에 의존하기 때문에, 플러그인은 **Kotlin/JVM 전용**이다.

참고로 프로젝트에 넣는 API 파일 자체는 놀랄 만큼 얇다. 레포의 `templates/KotlinLLM.kt` 실제 코드에서 핵심만 보면:

```kotlin
// 변환 로직의 계약 — 생성되는 코드는 전부 이 인터페이스의 구현체다
public interface AsLlmParser<F, T> {
    public fun parse(from: F, hint: String = ""): T
}

// 개발자가 호출하는 함수 — 타입 정보로 파서를 찾아 위임할 뿐이다
public inline fun <reified F, reified T> asLlm(from: F, hint: String = ""): T {
    val parser = AsLlmManager.resolve(typeOf<F>(), typeOf<T>()) as? AsLlmParser<F, T>
        ?: error("No asLlm parser for ${typeOf<F>()} -> ${typeOf<T>()}")
    return parser.parse(from, hint)
}
```

마법은 전부 플러그인 쪽에 있고, 앱 코드에 들어오는 건 "타입으로 파서를 찾아서 위임"하는 평범한 Kotlin이다. 생성된 코드는 프로젝트 안에 이런 구조로 쌓인다:

```text
src/main/kotlin/com/jetbrains/kotlinllm/generated
|-- core       # 부트스트랩 + provider (KType 기준으로 파서 디스패치)
|-- asLlm      # 생성된 변환 파서들
`-- mockLlm    # 생성된 인터페이스 구현체들
```

## 4. LLM에게는 뭘 주나

LLM에게 "코드 고쳐줘" 하고 프로젝트 전체를 던지는 게 아니다. JetBrains의 Kotlin 에이전트 프레임워크 **Koog** 위에서, 꼭 필요한 도구만 쥐여준다:

- 멈춘 지점의 **실제 값 읽기**
- 큰 입력은 통째로 주지 않고 **grep으로 필요한 부분만 찾아보게** 하기 (수백 KB짜리 JSON을 전부 프롬프트에 넣지 않는다)
- 목표 타입의 구조 확인
- **직전에 실패한 시도와 에러** 확인 (스스로 고쳐가는 루프)
- **toolbelt** — 생성 과정에서 만든 재사용 가능한 유틸 함수를 등록해두고 다음에 또 쓰는 창고

그리고 수정 범위도 좁다. 에이전트는 프로젝트 아무 파일이나 고칠 수 없고, **플러그인이 마련해둔 구현 본문만** 갱신할 수 있다. 권한을 좁혀서 예측 가능하게 만든 설계다. LLM 백엔드는 OpenAI를 쓰고, API 키는 프로젝트의 `.kotlinllm` 설정 파일에 저장한다.

## 5. 실제 예제: GithubIssueRadar

레포에 포함된 샘플 앱. "레포 주소를 주면 초보자가 도전할 만한 이슈를 찾아주는" 프로그램인데, 메인 코드가 실제로 이렇게 생겼다:

```kotlin
import com.jetbrains.kotlinllm.asLlm

fun main() {
    val repoUrl = "https://github.com/jetbrains/kotlinconf-app"
    val radar = GithubIssueRadar()

    val issues = radar.loadIssues(repoUrl, progress = ::println)
    val beginnerFriendlyIssues = issues.filter { it.isBeginnerFriendly }

    println("Beginner-friendly issues:")
    beginnerFriendlyIssues.forEachIndexed { index, issue ->
        println("${index + 1}. ${issue.title}")
        println("   ${issue.url}")
    }
}
```

겉보기엔 그냥 Kotlin 프로그램이다. 하지만 내부의 핵심 로직 세 군데가 전부 `asLlm`으로 처리된다:

1. 레포 URL → 이슈 API URL 변환
2. GitHub 이슈 JSON → 데이터 클래스 파싱
3. 이슈 라벨 → "초보자 친화적인가?" 분류

처음 실행하면 세 지점에서 차례로 멈추면서 LLM이 코드를 만들고, 그 결과 생성된 Kotlin 파일들이 예제에 같이 커밋되어 있다. 그래서 **LLM이 뭘 만들었는지 눈으로 확인**할 수 있고, 그 상태로는 플러그인 없이도 그냥 돌아간다.

## 6. 어디까지 온 물건인가

프로덕션 도구가 아니라 **연구 프로토타입**이다. 레포에 석사 논문 PDF가 통째로 들어 있는, 말 그대로 "논문과 함께 공개된 실험"이다.

- 요구사항: IntelliJ IDEA 2025.2.x, JDK 21, OpenAI API 키
- 라이선스: Apache 2.0
- 마지막 커밋 2026년 6월

그래서 "당장 업무에 쓰자"보다는, **LLM을 어디에 놓을 것인가에 대한 하나의 답안**으로 읽는 게 맞다. 런타임 컴포넌트(매번 호출)도 아니고, 개발 시점 일회성 코드젠도 아닌 — "실제 데이터를 만나는 순간에만 개입하고, 결과는 소스로 굳히는" 세 번째 위치.

## 핵심 요약

- `asLlm`/`mockLlm` 한 줄로 "LLM이 구현해주는 함수"를 선언한다. LLM은 **생성된 코드가 처리 못 하는 상황을 실제로 만났을 때만** 개입하고, 성공한 구현은 평범한 Kotlin 소스로 저장되어 이후엔 LLM 없이 돈다.
- 실행 중 코드 교체는 **디버거 인프라(JDI)** 를 빌려 이룬다: 브레이크포인트로 멈추고 → 실제 값을 캡처하고 → LLM이 고친 코드를 컴파일해 실행 중인 VM에 끼워넣고 → 재시도. 그래서 Kotlin/JVM 전용.
- 에이전트에게는 좁은 도구(값 읽기, grep, 타입 확인, 이전 실패 확인, toolbelt)와 좁은 권한(준비된 구현 본문만 수정)만 준다.
- 매 호출 LLM 위임(비싸고 비결정적)과 일회성 코드젠(실데이터를 못 봄) 사이의 **중간 지대 실험**이라는 게 핵심 아이디어.

## 관련 노트

- [AI 시대 코프링은 살아남을 수 있을까](/log/kopring-in-ai-era/) — 에이전트 시대 Kotlin/JVM 생태계 관점, JetBrains의 대응 사례로 연결됨
