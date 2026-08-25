---
title: "SARIF: 보안 스캐너 결과의 공통 언어"
date: 2026-08-25
category: "penetration-testing"
tags: ["penetration-testing","SARIF","OASIS","보안","정적분석"]
description: "스캐너를 하나 추가할 때마다 파서를 새로 짜야 하는 통합 지옥. SARIF가 이걸 어떻게 푸는지, 그리고 좋은 SARIF는 무엇이 다른지 천천히 풀어봤다."
minutes: 11
---

보안 파이프라인을 직접 만들어 보면, 생각보다 빨리 이런 벽에 부딪힌다.

처음엔 스캐너 하나로 시작한다. Semgrep을 붙이고, 그 JSON 출력을 읽어서 대시보드에 뿌리는 코드를 짠다. 잘 돌아간다. 그런데 다음 달, 웹 취약점을 잡으려고 Wapiti를 추가한다. Wapiti는 Semgrep과 전혀 다른 형식으로 결과를 뱉는다. 그래서 파서를 또 하나 짠다. 그다음 달엔 또 다른 도구가 들어오고, 또 다른 형식이 들어온다.

문제는 받는 쪽도 늘어난다는 것이다. 결과는 대시보드만 가는 게 아니라 이슈 트래커로도, 규제 제출용 리포트로도 흘러가야 한다. 이제 **"도구 N개 × 소비하는 곳 M개"** 만큼의 변환 코드가 필요해진다. 도구 하나만 추가해도 여기저기를 다 손봐야 하는, 전형적인 통합 지옥이다.

**SARIF는 바로 이 문제를 풀기 위한 표준이다.** 아이디어는 단순하다. 모든 도구가 SARIF라는 하나의 형식으로 결과를 내보내고, 결과를 받는 쪽은 SARIF 하나만 읽을 줄 알면 된다. 그러면 곱셈(N×M)이던 게 덧셈(N+M)으로 확 줄어든다. 도구를 새로 붙여도 그 도구가 SARIF만 내보내면, 대시보드도 리포트도 아무것도 안 고쳐도 된다.

SARIF의 정식 이름은 **Static Analysis Results Interchange Format**(정적 분석 결과 교환 형식)이다. OASIS라는 표준화 단체가 관리하고, 지금 널리 쓰이는 버전은 **2.1.0**이며, 형식은 그냥 JSON이다.

---

## 큰 그림부터: SARIF 파일은 어떻게 생겼나

SARIF 파일은 결국 하나의 JSON 문서다. 세부는 방대하지만, 뼈대만 보면 의외로 단순하다.

```json
{
  "version": "2.1.0",
  "$schema": "https://.../sarif-schema-2.1.0.json",
  "runs": [
    {
      "tool":      { "driver": { } },
      "results":   [ ],
      "artifacts": [ ]
    }
  ]
}
```

위에서부터 하나씩 읽어보자.

`runs`는 "스캔 한 번"을 담는 배열이다. 한 파일에 여러 번의 스캔을 넣을 수도 있지만, 보통은 **도구 하나가 곧 run 하나**라고 생각하면 편하다.

그 run 안에는 세 가지가 들어간다. `tool`은 "이 결과를 누가 만들었나"를 담는다. 도구 이름, 버전, 그리고 뒤에서 자세히 볼 **규칙 목록**이 여기 들어간다. `results`는 실제로 발견한 문제들의 목록으로, 리포트의 본체다. `artifacts`는 스캔 대상이 됐던 파일들의 목록(경로, 해시 등)이다.

---

## SARIF의 핵심 아이디어: 정의와 발생을 나눈다

SARIF를 처음 읽으면 살짝 헷갈리는 지점이 하나 있다. 바로 **"규칙 그 자체"와 "규칙에 걸린 사례"를 따로 저장**한다는 점이다. 이 분리만 이해하면 SARIF는 절반쯤 이해한 거다.

비유하자면 이렇다. 도서관에는 책의 '서지 정보'(제목, 저자, 요약)가 한 곳에 정리돼 있고, 그 책이 몇 번 서가 어디에 꽂혀 있는지는 따로 관리된다. 같은 책이 열 권 있어도 서지 정보는 한 번만 적으면 된다.

SARIF도 똑같이 한다.

**규칙의 정의**는 `tool.driver.rules`에 딱 한 번 적는다. 규칙의 설명, 도움말 링크, 기본 심각도, 태그 같은 "이 규칙이 무엇인가"에 대한 정보다.

```json
"driver": {
  "name": "Semgrep",
  "rules": [
    {
      "id": "java-insecure-deserialization",
      "shortDescription": { "text": "안전하지 않은 역직렬화" },
      "helpUri": "https://semgrep.dev/r/java-insecure-deserialization",
      "properties": {
        "tags": ["security", "CWE-502"],
        "security-severity": "8.1"
      }
    }
  ]
}
```

**규칙에 걸린 사례**는 `results` 배열에 담긴다. 같은 규칙이 코드 여기저기서 열 군데 걸렸다면, `results`에는 항목이 열 개 생긴다. 하지만 각 항목은 규칙 설명을 다시 복사하지 않는다. 대신 `ruleId`로 위의 정의를 **가리키기만** 하고, 자기 자신은 "어느 파일 몇 번째 줄에서 걸렸나"에만 집중한다.

```json
{
  "ruleId": "java-insecure-deserialization",
  "level": "error",
  "message": { "text": "신뢰할 수 없는 입력을 역직렬화하고 있습니다." },
  "locations": [
    {
      "physicalLocation": {
        "artifactLocation": { "uri": "src/main/java/PaymentHandler.java" },
        "region": { "startLine": 88, "startColumn": 5, "endLine": 88, "endColumn": 30 }
      }
    }
  ]
}
```

이렇게 나눠두면 규칙 설명을 사례마다 반복하지 않아 파일이 훨씬 가벼워지고, 결과를 읽는 쪽은 `ruleId`로 정의를 한 번만 찾아보면 된다. 단순하지만 우아한 설계다.

---

## 헷갈리기 쉬운 부분: 심각도가 두 종류다

여기서 많은 사람이 발을 헛디딘다. SARIF에는 "얼마나 심각한가"를 나타내는 값이 **두 개** 있는데, 역할이 다르다.

첫 번째는 `level`이다. `error`, `warning`, `note`, `none` 네 단계뿐이라 표현이 거칠다. Semgrep의 `ERROR / WARNING / INFO`가 여기에 자연스럽게 대응된다. 대략적인 신호등 색 정도라고 보면 된다.

두 번째는 `properties`에 들어가는 `security-severity`다. 이건 **0.0부터 10.0까지의 숫자**로, CVSS 점수와 같은 방식이다. GitHub 코드 스캐닝 같은 도구는 이 숫자를 보고 Critical / High / Medium / Low를 나눈다.

문제는, `level`만 채우고 `security-severity`를 빠뜨리는 경우가 흔하다는 것이다. 그러면 결과를 받는 쪽에서 "이게 대체 얼마나 급한 건데?"를 판단할 근거가 없어진다. 그래서 좋은 SARIF를 만들려면 **이 두 값을 모두 채워야** 한다.

> Semgrep 결과를 받아 `impact`와 `confidence`가 둘 다 HIGH일 때 심각도를 CRITICAL로 올리는 작업([Semgrep 편](/log/semgrep/) 참고)이 바로 이 숫자 심각도를 신뢰할 만하게 채우기 위한 사전 정제라고 보면 된다.

---

## 위치를 이렇게까지 정밀하게 적는 이유

SARIF에서 "문제가 발생한 위치"를 나타내는 `region`을 보면, 단순히 몇 번째 줄인지만 적지 않는다. 시작 줄과 컬럼, 끝 줄과 컬럼, 심지어 문제가 된 코드 조각(snippet)까지 담을 수 있다.

```json
"region": {
  "startLine": 88, "startColumn": 5,
  "endLine": 88,   "endColumn": 30,
  "snippet": { "text": "ois.readObject()" }
}
```

굳이 이렇게까지 하는 이유는 사용자 경험 때문이다. 이렇게 정밀한 위치가 있으면, IDE나 GitHub 화면이 **문제가 되는 바로 그 토큰에 밑줄**을 그어줄 수 있다. 자동 수정 제안도 정확히 그 범위에만 적용된다. "그냥 88번째 줄 어딘가에 문제가 있어요"라고만 말하던 옛날 도구들과는 체감이 완전히 다르다.

---

## 한 걸음 더: 취약점의 '경로'까지 그린다

SARIF에는 더 깊은 기능도 있다. `codeFlows`라는 부분인데, 취약점을 하나의 지점이 아니라 **하나의 경로**로 표현한다.

taint 분석(오염 추적) 도구는 "사용자 입력이 어디로 들어와서(source), 어디를 거쳐서, 결국 어디서 사고를 내는지(sink)"를 추적한다. SARIF는 그 여정을 단계별로 담을 수 있다.

```json
"codeFlows": [{
  "threadFlows": [{
    "locations": [
      { "location": { "message": { "text": "1. request.getParameter()로 입력을 받는다" } }},
      { "location": { "message": { "text": "2. 검증 없이 쿼리 문자열에 이어 붙인다" } }},
      { "location": { "message": { "text": "3. Statement.execute()로 실행 → SQL 인젝션" } }}
    ]
  }]
}]
```

이런 경로 정보가 있으면, 리포트는 단순히 "여기 위험함"에서 그치지 않고 **"왜, 어떤 흐름을 타고 위험해지는가"** 까지 보여준다. 이걸 받은 개발자가 문제를 이해하는 속도가 완전히 달라진다.

---

## 표준은 함께 써야 힘이 난다

아무리 잘 설계된 형식이라도 아무도 안 쓰면 소용없다. SARIF가 실제로 강한 건, 이미 생태계가 두텁게 받쳐주고 있기 때문이다.

가장 상징적인 건 GitHub다. GitHub의 코드 스캐닝 기능에 SARIF 파일을 올리면, 그 결과가 PR 화면에 인라인 코멘트로 뜬다. 이 바닥에선 사실상 SARIF가 공용 화폐다. Azure DevOps나 VS Code(SARIF Viewer 확장)도 SARIF 뷰어를 제공한다. 생산하는 쪽도 넉넉하다. Semgrep, CodeQL, Snyk, ESLint, Bandit 같은 주요 도구들이 이미 SARIF 내보내기를 지원한다.

많은 팀이 결과 형식으로 SARIF를 택하는 이유도 여기 있다. 자체 형식을 새로 발명하는 대신 **이미 모두가 읽을 줄 아는 언어**로 말하면, 대시보드는 물론이고 GitHub·IDE·규제 제출 문서까지 별도 변환 없이 그대로 흘려보낼 수 있다.

---

## 정리하며: 좋은 SARIF를 만들려면

내부 도구의 결과를 SARIF로 내보낼 일이 생긴다면, 최소한 다음은 챙기자.

버전은 `"2.1.0"`으로 명시하고 `$schema`도 함께 적어둔다. 규칙은 앞서 말한 대로 `tool.driver.rules`에 **한 번만** 정의하고, 각 사례는 `ruleId`로 참조한다. 심각도는 `level`뿐 아니라 숫자 값인 `security-severity`(0~10)도 꼭 채운다. 파일 경로(`artifactLocation.uri`)는 절대 경로가 아니라 **저장소 루트 기준 상대 경로**로 적는다(그래야 다른 환경에서도 링크가 맞다). 가능하면 `region`에 컬럼과 끝 위치까지 채워 정밀한 하이라이트를 지원하고, taint 계열이라면 `codeFlows`로 경로를 넘기며, `helpUri`로 규칙 문서 링크를 걸어준다.

결국 SARIF는 화려한 신기술이 아니라 **합의**에 가깝다. 여러 도구와 여러 소비처를 잇는 공통 언어를 하나 정해두는 것. 그 합의 덕분에 도구를 바꾸거나 새로 붙여도 파이프라인 전체가 흔들리지 않는다.

그렇다면 그 결과를 애초에 **어떻게 찾아내는가**? SARIF가 담는 그 발견들이 어디서 오는지는 Semgrep을 다룬 글에 정리해 뒀다.

→ [Semgrep: 코드를 '패턴'으로 읽는 SAST 엔진](/log/semgrep/)
