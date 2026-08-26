---
title: "Semgrep — 코드를 패턴으로 읽는 SAST 엔진"
date: 2026-08-25
category: "penetration-testing"
tags: ["reference","penetration-testing","Semgrep","SAST","보안","정적분석"]
description: "grep은 코드를 글자로 보고 Semgrep은 문법 트리로 본다. 그래서 규칙을 정규식이 아니라 찾고 싶은 코드 그 자체로 쓴다."
minutes: 8
---
> <span class="co co-abstract">📋 요약 한 줄 요약</span>
> `grep`은 코드를 글자로 보고 Semgrep은 문법 트리로 본다. 그래서 규칙을 정규식이 아니라 **찾고 싶은 코드 그 자체**로 쓴다.

## grep으로는 왜 부족한가

보안 점검을 하다 보면 누구나 한 번쯤 `grep -rn "eval(" .` 같은 걸 해본다. 그리고 곧 실망한다.

문자열 안에 적힌 `"eval("`, 주석 처리된 옛날 코드, 변수 이름에 `eval`이 들어간 애먼 줄까지 죄다 딸려 나온다. 정작 `const run = eval; run(x)` 같은 우회는 놓친다.

이유는 단순하다. `grep`은 코드를 **글자 그대로의 텍스트**로만 보기 때문에 함수 호출인지 주석인지 구분할 능력이 없다.

하지만 우리가 보고 싶은 건 텍스트가 아니라 **의미**다. 그래서 쓸데없는 경보는 잔뜩 뜨는데 정작 잡아야 할 건 놓친다.

**Semgrep**이 그 틈을 메운다. 이름부터 `grep` 앞에 의미를 뜻하는 `sem`(semantic)을 붙인, 말 그대로 "의미를 아는 grep"이다.

## 텍스트가 아니라 구조를 본다

Semgrep은 코드를 읽을 때 먼저 **파싱**을 한다. 소스를 컴파일러가 이해하는 방식, 즉 **문법 트리(AST)** 로 바꾸는 것이다. 이 트리 위에서는 함수 호출·문자열·주석이 명확히 구분된다.

그리고 우리가 찾고 싶은 **패턴도 똑같이 트리로** 바꿔 트리끼리 맞춰본다. 그래서 표면적인 차이에 흔들리지 않는다.

- 공백·줄바꿈이 어떻든 상관없다 (`eval(x)`나 `eval(\n x\n)`나 같게 본다)
- 변수 이름이 무엇이든 상관없다
- 주석 안의 코드는 아예 코드로 치지 않는다

쉽게 말해 grep은 글자를 비교하고, Semgrep은 문장 구조를 비교한다.

## 규칙이 그 언어 코드처럼 생겼다

Semgrep의 진짜 매력은 패턴을 **직접, 쉽게 쓸 수 있다**는 점이다.

보통 정적 분석 규칙을 커스터마이징하려면 그 도구의 내부 AST API를 배워야 한다. Semgrep은 **그냥 찾고 싶은 코드를 그 언어로 써주면** 된다.

```yaml
rules:
  - id: java-insecure-deserialization
    languages: [java]
    severity: ERROR
    message: "신뢰할 수 없는 입력을 ObjectInputStream으로 역직렬화하고 있습니다."
    pattern: |
      ObjectInputStream $OIS = new ObjectInputStream(...);
      ...
      $OIS.readObject();
```

특별한 문법은 딱 둘이다.

**`$OIS` 같은 메타변수** — 뭐가 오든 상관없지만, 같은 이름이 두 번 나오면 "둘은 같은 것이어야 한다"는 뜻이다. 위 예시는 "위에서 만든 그 스트림을 아래에서 실제로 `readObject()` 하는가"를 확인한다.

**`...`(점 세 개)** — 그 사이에 무슨 코드가 있어도 좋다는 와일드카드다.

정규식보다 훨씬 직관적이라, 조직 고유 안티패턴도 몇 줄로 잡는다. "내부 인증 유틸을 건너뛰고 직접 DB를 찌르는 코드" 같은 것들이다.

## 사용법

### 설치

```bash
pip install semgrep          # 가장 흔한 방법
brew install semgrep         # macOS
docker run --rm -v "$PWD:/src" semgrep/semgrep semgrep scan --config auto
```

도커 방식은 로컬을 안 더럽혀서 CI 러너나 격리 환경에 쓰기 좋다.

### 첫 스캔

```bash
semgrep scan --config auto
```

`auto`는 프로젝트 언어를 감지해 알맞은 룰셋을 레지스트리에서 받아온다. 처음 감을 잡을 때 편하다.

> <span class="co co-warning">⚠️ 주의 `--config auto`는 외부 통신을 한다</span>
> 룰을 받아오면서 익명 통계도 함께 보낸다. 폐쇄망이나 규제 환경이라면 처음부터 아래의 고정 룰셋 + `--metrics off` 조합으로 가야 한다.

### 룰셋 고르기

`--config`에는 레지스트리 축약어, 로컬 파일, 디렉터리를 넣을 수 있고 **여러 번 겹쳐 쓸 수 있다.**

| 값 | 내용 |
|---|---|
| `p/default` | 오탐 적고 신뢰할 만한 것만 담은 기본 팩 |
| `p/owasp-top-ten` | OWASP Top 10 대응 |
| `p/secrets` | 하드코딩된 키·토큰 |
| `./rules/` | 직접 쓴 로컬 룰 디렉터리 |

```bash
semgrep scan \
  --config p/default \
  --config p/owasp-top-ten \
  --config ./rules/
```

의료기기처럼 엄격한 도메인이면 `p/default`로 시작해 언어별 보안 팩을 얹는 순서가 무난하다.

### 실무용 명령

```bash
semgrep scan \
  --config p/default \
  --metrics off \
  --exclude node_modules \
  --exclude venv \
  --exclude dist \
  --sarif --output semgrep.sarif \
  <대상 경로>
```

각 옵션의 이유는 이렇다.

- **`--metrics off`** — 기본값은 익명 통계를 서버로 보낸다. 어떤 데이터도 바깥으로 나가면 안 되는 환경에서는 반드시 끈다
- **제외 디렉터리** — `node_modules`·`venv`·`dist`·`build`엔 남의 라이브러리와 빌드 산출물이 들어 있다. 스캔하면 수천 건이 리포트를 뒤덮어 정작 내 문제가 파묻힌다
- **`--sarif`** — 표준 형식으로 내보낸다. GitHub 코드 스캐닝·IDE 뷰어가 그대로 읽는다 ([SARIF — 보안 스캐너 결과의 공통 언어](/log/sarif/))

> <span class="co co-tip">💡 TIP 주석은 명령 안에 넣지 말 것</span>
> `\` 는 **줄의 맨 마지막 문자일 때만** 다음 줄을 이어준다. `--metrics off \   # 주석` 처럼 쓰면 `\`가 뒤의 공백을 이스케이프하고 `#`부터 그 줄이 잘려서, 다음 줄이 새 명령으로 해석된다. 설명은 코드 블록 밖에 적는다.

### CI에 물리기

기본값은 취약점을 찾아도 종료 코드가 `0`이다. 빌드를 실패시키려면 `--error`를 준다.

```bash
semgrep scan --config p/default --error --sarif --output semgrep.sarif .
```

전체 스캔이 부담되면 **바뀐 부분만** 본다.

```bash
semgrep scan --config p/default --baseline-commit origin/main
```

기존 코드의 묵은 경보를 빼고 이번 PR이 새로 만든 것만 남겨줘서, 레거시가 큰 저장소에 도입할 때 특히 쓸모 있다.

### 오탐 끄기

해당 줄 바로 위나 뒤에 `nosemgrep` 주석을 단다.

```java
// nosemgrep: java-insecure-deserialization
ois.readObject();
```

규칙 ID를 붙이면 그 규칙만 무시하고, 안 붙이면 그 줄의 모든 규칙을 무시한다. **되도록 ID를 붙이는 게 낫다.** 나중에 다른 취약점이 같은 줄에 생겨도 잡히기 때문이다.

특정 경로를 통째로 빼려면 규칙 파일 안에서 처리한다.

```yaml
paths:
  exclude:
    - "**/test/**"
    - "**/generated/**"
```

### 직접 룰 쓰기

단일 `pattern` 말고도 조합용 키가 있다.

| 키 | 뜻 |
|---|---|
| `patterns` | 전부 만족 (AND) |
| `pattern-either` | 하나라도 만족 (OR) |
| `pattern-not` | 이건 제외 |
| `pattern-inside` | 이 범위 안에 있을 때만 |
| `metavariable-regex` | 메타변수 값에 정규식 조건 |

예를 들어 "컨트롤러 안에서, 검증을 거치지 않고 쿼리를 만드는 경우"는 `pattern-inside`로 범위를 좁히고 `pattern-not`으로 안전한 케이스를 걷어내는 식으로 쓴다.

값이 **어디서 들어와 어디서 터지는지** 추적하려면 taint 모드를 쓴다.

```yaml
mode: taint
pattern-sources:
  - pattern: request.getParameter(...)
pattern-sanitizers:
  - pattern: sanitize(...)
pattern-sinks:
  - pattern: $ST.execute(...)
```

오픈소스 버전의 taint 추적은 **한 파일 범위** 안에서 동작한다. 파일과 함수를 넘나드는 추적은 상용 Pro 영역이다.

룰을 쓸 땐 두 가지를 같이 쓰면 편하다.

- **[Playground](https://semgrep.dev/playground)** — 코드와 패턴을 붙여넣고 즉시 매칭을 확인
- **`semgrep --test`** — 룰 옆에 테스트 파일을 두고 `# ruleid:` / `# ok:` 주석으로 기대값을 표시하면 룰 자체를 회귀 테스트할 수 있다

## 심각도는 한 번 더 걸러서 받는다

Semgrep은 심각도를 `ERROR / WARNING / INFO` 세 단계로만 낸다. 표현력이 부족해서 받아서 다듬는 게 좋다.

```
ERROR → HIGH / WARNING → MEDIUM / INFO → LOW
```

여기에 규칙 메타의 두 값을 얹는다. `impact`는 터졌을 때 얼마나 아픈가이고, `confidence`는 얼마나 확실한가다.

**둘 다 HIGH일 때만** HIGH를 CRITICAL로 올린다. "영향도 크고 오탐 가능성도 낮다"는 두 신호가 겹칠 때만 최고 등급을 주는 보수적인 방식이다.

## 장점과 단점

> <span class="co co-note">📝 NOTE 장단점 요약</span>
> **장점** — 여러 언어를 넓고 빠르게 훑는다(CI에 물릴 만큼 빠르다). 조직 고유 규칙을 쉽게 쓴다. CWE·OWASP 매핑이 붙어 있다.
> **단점** — 기본은 한 파일 안의 패턴에 강하다. 여러 함수·파일을 넘는 taint 추적은 Pro 쪽이 낫다. 인증 우회·세션 결함처럼 실행해봐야 드러나는 문제는 DAST 몫이다.

그래서 Semgrep은 만능이 아니라 **파이프라인의 첫 관문**이다. 넓고 빠르게 훑어 눈에 띄는 문제를 초반에 걸러낸다.

## 참고 링크

- [semgrep/semgrep](https://github.com/semgrep/semgrep) — 엔진 본체. 조직명이 바뀌기 전 `returntocorp/semgrep` 으로도 찾을 수 있다
- [semgrep/semgrep-rules](https://github.com/semgrep/semgrep-rules) — 공개 룰 원본. `p/default` 같은 팩이 여기서 만들어진다. 룰을 직접 쓸 때 가장 좋은 예제 모음
- [공식 문서](https://semgrep.dev/docs/) — 패턴 문법과 옵션 레퍼런스
- [Playground](https://semgrep.dev/playground) — 브라우저에서 패턴 즉시 테스트
- [Registry](https://semgrep.dev/explore) — 룰셋 탐색

## 관련 노트

- [SARIF — 보안 스캐너 결과의 공통 언어](/log/sarif/) — 여기서 찾은 결과를 표준 형식으로 내보내는 이야기
- [접근제어(RBAC, ABAC)](/log/access-control-rbac-abac/)
