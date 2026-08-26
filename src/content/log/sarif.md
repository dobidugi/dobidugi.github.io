---
title: "SARIF — 보안 스캐너 결과의 공통 언어"
date: 2026-08-25
category: "penetration-testing"
tags: ["reference","penetration-testing","SARIF","OASIS","보안","정적분석"]
description: "도구마다 다른 결과 형식을 표준 JSON 하나로 통일해서, 도구 N개 × 소비처 M개였던 변환 코드를 N+M으로 줄인다."
minutes: 7
---
> <span class="co co-abstract">📋 요약 한 줄 요약</span>
> 도구마다 다른 결과 형식을 표준 JSON 하나로 통일해서, `도구 N개 × 소비처 M개`였던 변환 코드를 `N+M`으로 줄인다.

## 왜 표준이 필요한가

보안 파이프라인을 직접 만들어 보면 빨리 벽에 부딪힌다.

스캐너 하나(Semgrep)로 시작해 그 JSON을 파싱하는 코드를 짠다. 다음 달 Wapiti를 추가하면 전혀 다른 형식이라 파서를 또 짠다. 도구가 늘 때마다 파서가 늘고, 받는 쪽(대시보드·이슈 트래커·규제 리포트)도 늘어난다.

결국 **"도구 N개 × 소비처 M개"** 만큼의 변환 코드가 필요한 통합 지옥이 된다.

**SARIF**는 이 문제를 푸는 표준이다. 모든 도구가 SARIF 하나로 내보내고 받는 쪽은 SARIF만 읽으면, 곱셈(N×M)이던 게 덧셈(N+M)으로 확 줄어든다.

정식 이름은 **Static Analysis Results Interchange Format**이다. OASIS가 관리하고, 널리 쓰는 버전은 **2.1.0**이며, 형식은 그냥 JSON이다.

## 문서 뼈대

```json
{
  "version": "2.1.0",
  "$schema": "https://.../sarif-schema-2.1.0.json",
  "runs": [{ "tool": { "driver": {} }, "results": [], "artifacts": [] }]
}
```

- `runs` — "스캔 한 번"의 배열. 보통 **도구 하나 = run 하나**
- `tool.driver` — 누가 만들었나(이름·버전) + **규칙 목록**
- `results` — 실제 발견 사항. 리포트의 본체
- `artifacts` — 스캔한 파일 목록(경로·해시)

## 핵심 아이디어 — 정의와 발생을 나눈다

SARIF는 **"규칙 그 자체"와 "규칙에 걸린 사례"를 따로** 저장한다.

도서관이 책의 서지 정보(제목·저자·요약)를 한 번만 적고, 그 책이 어느 서가에 꽂혔는지는 따로 관리하는 것과 같다.

**규칙 정의**는 `tool.driver.rules`에 한 번만 넣는다.

```json
"driver": {
  "name": "Semgrep",
  "rules": [{
    "id": "java-insecure-deserialization",
    "shortDescription": { "text": "안전하지 않은 역직렬화" },
    "helpUri": "https://semgrep.dev/r/java-insecure-deserialization",
    "properties": { "tags": ["security","CWE-502"], "security-severity": "8.1" }
  }]
}
```

**발생한 사례**는 `results`에 들어간다. 같은 규칙이 10군데 걸리면 10개가 생긴다.

다만 각 항목은 설명을 복사하지 않고 `ruleId`로 정의를 **가리키기만** 한다. 자기는 "어느 파일 몇 번째 줄"에만 집중한다.

```json
{
  "ruleId": "java-insecure-deserialization",
  "level": "error",
  "message": { "text": "신뢰할 수 없는 입력을 역직렬화하고 있습니다." },
  "locations": [{ "physicalLocation": {
    "artifactLocation": { "uri": "src/main/java/PaymentHandler.java" },
    "region": { "startLine": 88, "startColumn": 5, "endLine": 88, "endColumn": 30 }
  }}]
}
```

덕분에 파일이 가볍고, 읽는 쪽은 `ruleId`로 정의를 한 번만 조회하면 된다.

## 헷갈리기 쉬운 부분 — 심각도가 두 종류

> <span class="co co-warning">⚠️ 주의 두 개의 심각도 축</span>
> **`level`** — `error / warning / note / none`. 거친 신호등 색이다. Semgrep의 `ERROR / WARNING / INFO`가 여기에 대응한다.
> **`properties["security-severity"]`** — **0.0~10.0 숫자**(CVSS 방식). GitHub 코드 스캐닝이 이 값으로 Critical/High/Medium/Low를 나눈다.

`level`만 채우고 숫자를 빠뜨리면 받는 쪽이 긴급도를 판단할 근거가 없다. **두 값을 모두 채우는 것**이 좋은 SARIF의 조건이다.

[Semgrep — 코드를 패턴으로 읽는 SAST 엔진](/log/semgrep/)에서 `impact`·`confidence`가 둘 다 HIGH일 때만 CRITICAL로 올리는 작업이 있는데, 그게 바로 이 숫자 축을 신뢰도 있게 채우기 위한 사전 정제다.

## 위치는 줄 단위가 아니라 토큰 단위

`region`은 몇 번째 줄만이 아니라 컬럼·끝 위치·코드 조각까지 담는다.

```json
"region": { "startLine": 88, "startColumn": 5, "endLine": 88, "endColumn": 30,
            "snippet": { "text": "ois.readObject()" } }
```

이 정밀함 덕에 IDE와 GitHub이 **문제가 되는 바로 그 토큰에 밑줄**을 긋는다. 자동 수정도 정확한 범위에만 적용된다.

## codeFlows — 흐름까지 담는다

여기서 한 걸음 더 나아간 게 `codeFlows`다.

taint 분석 도구가 "입력이 어디로 들어와서(source) → 어디를 거쳐 → 어디서 터지는지(sink)"를 단계별로 담는다. 덕분에 "왜, 어떤 흐름을 타고 위험한가"까지 보여줄 수 있다.

```json
"codeFlows": [{ "threadFlows": [{ "locations": [
  { "location": { "message": { "text": "1. request.getParameter()로 입력 수신" } }},
  { "location": { "message": { "text": "2. 검증 없이 쿼리 문자열에 이어 붙임" } }},
  { "location": { "message": { "text": "3. Statement.execute() 실행 → SQL 인젝션" } }}
]}]}]
```

## 생태계

아무리 잘 만든 형식도 아무도 안 쓰면 소용없다. SARIF는 이 점에서 두텁다.

**받는 쪽**

- GitHub 코드 스캐닝 — 올리면 PR에 인라인 코멘트로 뜬다. 사실상 공용 화폐
- Azure DevOps
- VS Code (SARIF Viewer 확장)

**내보내는 쪽**

- Semgrep, CodeQL, Snyk, ESLint, Bandit 등 주요 도구가 SARIF 내보내기를 지원한다

자체 형식을 발명하는 대신 **모두가 읽을 줄 아는 언어**로 말하면, 대시보드·GitHub·IDE·규제 문서까지 별도 변환 없이 흘려보낼 수 있다.

> <span class="co co-tip">💡 TIP 좋은 SARIF 체크리스트</span>
> - `version` `"2.1.0"` + `$schema` 명시
> - 규칙은 한 번만 정의하고, result는 `ruleId`로 참조
> - `level` + `security-severity`(0~10) 둘 다 채우기
> - `artifactLocation.uri`는 저장소 루트 기준 상대 경로
> - `region`에 컬럼·끝 위치까지, taint면 `codeFlows`도
> - `helpUri`로 규칙 문서 링크

SARIF는 화려한 신기술이 아니라 **합의**다. 공통 언어를 하나 정해두면 도구를 바꾸거나 새로 붙여도 파이프라인 전체가 흔들리지 않는다.

## 참고 링크

- [표준 원문 (OASIS SARIF 2.1.0)](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html) — 필드 하나하나의 정본
- [oasis-tcs/sarif-spec](https://github.com/oasis-tcs/sarif-spec) — 스펙 저장소. **JSON 스키마 원본**이 여기 있다
- [microsoft/sarif-tutorials](https://github.com/microsoft/sarif-tutorials) — 스펙을 읽기 전에 볼 입문 자료
- [microsoft/sarif-sdk](https://github.com/microsoft/sarif-sdk) — .NET 라이브러리와 `sarif` 멀티툴 CLI. 파일 검증·병합·변환에 쓴다
- [microsoft/sarif-vscode-extension](https://github.com/microsoft/sarif-vscode-extension) — VS Code 뷰어
- [GitHub 코드 스캐닝의 SARIF 지원](https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/sarif-support-for-code-scanning) — 업로드 시 GitHub이 실제로 요구하는 필드

## 관련 노트

- [Semgrep — 코드를 패턴으로 읽는 SAST 엔진](/log/semgrep/) — 이 결과를 애초에 어떻게 찾아내는지
- [접근제어(RBAC, ABAC)](/log/access-control-rbac-abac/)
