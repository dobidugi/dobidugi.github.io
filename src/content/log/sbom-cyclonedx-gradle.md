---
title: "SBOM — 소프트웨어 자재명세서와 CycloneDX Gradle 플러그인"
date: 2026-10-26
category: "SECURITY"
tags: ["Security","Compliance","SBOM","CycloneDX","SupplyChain","Gradle","Spring","npm","Nextjs"]
description: "SBOM 은 \"이 소프트웨어에 어떤 부품(라이브러리)이 어떤 버전으로 들어 있나\"를 기계가 읽을 수 있게 적은 목록이다. Spring Boot + Gradle 이면 CycloneDX 플러그인 한 줄…"
minutes: 26
---
> <span class="co co-abstract">📋 요약 한 줄 요약</span>
> SBOM 은 "이 소프트웨어에 어떤 부품(라이브러리)이 어떤 버전으로 들어 있나"를 기계가 읽을 수 있게 적은 목록이다. Spring Boot + Gradle 이면 CycloneDX 플러그인 한 줄과 설정 몇 줄로 빌드 때 자동 생성되고, 실행 jar 안에도 들어간다. 단, **SBOM 자체에는 취약점 정보가 없다** — CVE 는 스캐너가 SBOM 을 데이터베이스와 대조해 찾는다.

의료기기 소프트웨어 백엔드에 SBOM 생성을 붙이면서 정리한 내용이다. 
"SBOM 이 의료 소프트웨어냐?", "CVE 도 자동으로 나오냐?" 같은 질문에서 시작해, 실제로 붙이다 겪은 함정까지 적는다.

## SBOM 이 무엇인가

**SBOM(Software Bill of Materials, 소프트웨어 자재명세서)** 은 소프트웨어를 구성하는 외부 구성요소의 목록이다. 제조업의 BOM(부품 명세서)을 소프트웨어로 옮긴 개념이다.

자동차 BOM 에 "브레이크 패드: ○○사, 모델 X, 로트 123" 이 적히듯, SBOM 에는 이런 것이 적힌다.

```
org.springframework.boot : spring-boot      : 4.1.0        (Apache-2.0)
org.hibernate.orm        : hibernate-core   : 7.4.1.Final  (Apache-2.0)
com.mysql                : mysql-connector-j: 9.7.0        (GPL-2.0-only)
...
```

### 무엇이 들어가나

| 항목       | Field (EN)                              | CycloneDX 필드                                     | 설명                                                    | Description                                                                                             | 예시                                                                      |
| -------- | --------------------------------------- | ------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 이름·그룹·버전 | Component name · group · version        | `name` · `group` · `version`                     | 어떤 라이브러리의 어떤 버전인가                                     | Which library, and exactly which version of it                                                          | `org.hibernate.orm` : `hibernate-core` : `7.4.1.Final`                  |
| 고유 식별자   | Unique identifier (Package URL)         | `purl` · `bom-ref`                               | 생태계·이름·버전을 한 문자열로 묶은 식별자. 스캐너가 취약점 DB 와 대조할 때 이 값을 쓴다 | A single string that pins ecosystem, name and version; scanners use it to match vulnerability databases | `pkg:maven/org.hibernate.orm/hibernate-core@7.4.1.Final?type=jar`       |
| 공급자      | Supplier                                | `supplier` · `publisher`                         | 누가 만든(배포한) 구성요소인가                                     | Who produced or distributes the component                                                               | `Hibernate.org`                                                         |
| 라이선스     | License                                 | `licenses`                                       | 어떤 조건으로 쓸 수 있나 (SPDX 라이선스 ID)                         | Terms of use, as an SPDX license ID                                                                     | `Apache-2.0`                                                            |
| 해시       | Hash (checksum)                         | `hashes`                                         | 파일이 바뀌지 않았는지 확인하는 값                                   | Checksum proving the file has not been altered                                                          | `SHA-256: 3f1c…9ab0`                                                    |
| 의존 관계    | Dependency relationship                 | `dependencies` (`ref` → `dependsOn`)             | 무엇이 무엇을 끌고 왔나 — **직접 의존성뿐 아니라 전이(하위) 의존성까지**          | What pulled in what — **transitive dependencies, not just direct ones**                                 | `hibernate-core` → `jboss-logging`, `jakarta.persistence-api`           |
| 메타데이터    | Metadata (author · timestamp · subject) | `metadata` (`tools` · `timestamp` · `component`) | SBOM 을 만든 도구·시각, 대상 소프트웨어 이름·버전                       | Which tool generated the SBOM and when, and what software it describes                                  | `cyclonedx-gradle-plugin 3.5.1`, `2026-10-26T02:45:00Z`, `my-api 1.0.0` |

#### 예시 — 구성요소 하나가 SBOM 에서 보이는 모습 (Example: one component in a CycloneDX SBOM)

위 표의 항목이 실제 파일에서 어디에 들어가는지 `hibernate-core` 하나로 보면 이렇다. 주석(`//`)은 설명용이고 실제 JSON 에는 없다.

```jsonc
{
  "bomFormat": "CycloneDX",
  "specVersion": "1.6",
  "metadata": {                                   // 메타데이터 — Metadata
    "timestamp": "2026-10-26T02:45:00Z",          //   작성 시각 — when the SBOM was generated
    "tools": { "components": [ { "name": "cyclonedx-gradle-plugin", "version": "3.5.1" } ] },  // 작성 도구 — author (tool)
    "component": { "type": "application", "name": "my-api", "version": "1.0.0" }              // 대상 소프트웨어 — the software described
  },
  "components": [
    {
      "type": "library",
      "bom-ref": "pkg:maven/org.hibernate.orm/hibernate-core@7.4.1.Final?type=jar",
      "supplier": { "name": "Hibernate.org" },    // 공급자 — Supplier
      "group": "org.hibernate.orm",               // 그룹 — Group
      "name": "hibernate-core",                   // 이름 — Name
      "version": "7.4.1.Final",                   // 버전 — Version
      "purl": "pkg:maven/org.hibernate.orm/hibernate-core@7.4.1.Final?type=jar",  // 고유 식별자 — Unique identifier
      "licenses": [ { "license": { "id": "Apache-2.0" } } ],                       // 라이선스 — License
      "hashes": [ { "alg": "SHA-256", "content": "3f1c…9ab0" } ]                   // 해시 — Hash
    }
  ],
  "dependencies": [                               // 의존 관계 — Dependency relationship
    {
      "ref": "pkg:maven/org.hibernate.orm/hibernate-core@7.4.1.Final?type=jar",
      "dependsOn": [
        "pkg:maven/org.jboss.logging/jboss-logging@3.6.1.Final?type=jar",
        "pkg:maven/jakarta.persistence/jakarta.persistence-api@3.2.0?type=jar"
      ]
    }
  ]
}
```

`dependencies` 덕분에 "jboss-logging 은 우리가 직접 넣은 게 아니라 hibernate-core 가 끌고 왔다"를 알 수 있다. Log4Shell 때 각 조직이 답하지 못한 게 바로 이 전이 의존성이었다.

미국 NTIA 가 정한 **최소 요소(NTIA Minimum Elements)** 는 일곱 가지다 — 공급자명(Supplier Name), 구성요소명(Component Name), 버전(Version of the Component), 기타 고유 식별자(Other Unique Identifiers), 의존 관계(Dependency Relationship), SBOM 작성자(Author of SBOM Data), 작성 시각(Timestamp). 위 표에서 해시·라이선스는 최소 요소는 아니지만 FDA·보안 도구가 실무에서 기대하는 항목이다.

### 헷갈리기 쉬운 점

- **소프트웨어가 아니다.** 사람이 쓰는 문서도 아니고, 빌드 도구가 자동으로 뽑는 **JSON(또는 XML) 파일**이다.
- **취약점 목록이 아니다.** "무엇이 들어 있나"만 적는다. "그중 무엇이 위험한가"는 별도 도구가 판단한다(아래 [SBOM 다음 — CVE 는 어떻게 찾나](#sbom-다음--cve-는-어떻게-찾나)).
- **의료 전용 개념이 아니다.** 의료기기 인허가에서 요구할 뿐, 일반 소프트웨어 공급망 보안의 기본 도구다.

## 왜 필요한가

### 계기 — Log4Shell

2021년 12월 Log4j 의 원격 코드 실행 취약점(CVE-2021-44228, Log4Shell)이 공개됐을 때, 수많은 조직이 **"우리 제품에 log4j-core 2.x 가 들어 있나?"** 라는 질문에 바로 답하지 못했다. 직접 쓰지 않아도 다른 라이브러리가 끌고 들어온 경우(전이 의존성)가 많았기 때문이다.

SBOM 이 있으면 이 질문은 파일 검색 한 번이다.

### 규제

| 규제                                    | 내용                                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| 미국 행정명령 14028 (2021)                  | 연방정부에 납품하는 소프트웨어에 SBOM 요구                                                          |
| **미국 FDA — FD&C Act 524B조** (2023 시행) | **"사이버 기기"** 인허가 신청 시 SBOM 제출 **의무**. 사이버 기기 = 소프트웨어가 있고 인터넷 등 네트워크에 연결될 수 있는 의료기기 |
| FDA Premarket Cybersecurity 가이던스      | NTIA 최소 요소 + **구성요소별 지원 수준·지원 종료일**까지 요구                                           |
| EU 사이버복원력법(CRA)                       | 디지털 제품 제조사에 SBOM 작성·유지 요구                                                          |
| 국내 식약처 사이버보안 가이드라인                    | SBOM 관련 내용이 있다. 제출 의무 여부는 인허가 담당과 확인할 것                                            |

의료기기 소프트웨어라면 FDA 쪽이 가장 구체적이다. 임상시험(IDE) 단계부터 SBOM 을 권고하고, 시판 신청에는 필수다.

## 형식 — CycloneDX 와 SPDX

표준 형식이 두 개 있다. 둘 다 FDA 가 인정한다.

| | CycloneDX | SPDX |
|---|---|---|
| 주도 | OWASP | Linux Foundation |
| 표준화 | ECMA-424 | ISO/IEC 5962 |
| 출발점 | 보안(취약점 대응) | 라이선스 준수 |
| 강점 | VEX(취약점 해당 여부 진술)·서비스·하드웨어까지 표현, 보안 도구 지원이 넓다 | 라이선스 표현이 정교하다 |
| 파일 | `bom.json` / `*.cdx.json` | `*.spdx.json` |

**Spring Boot 가 CycloneDX 를 1급으로 지원**하므로 자바/코틀린 백엔드라면 CycloneDX 가 자연스럽다.

CycloneDX JSON 은 대략 이렇게 생겼다.

```json
{
  "bomFormat": "CycloneDX",
  "specVersion": "1.6",
  "metadata": {
    "timestamp": "2026-10-26T02:45:00Z",
    "component": { "type": "application", "name": "my-api", "version": "1.0.0" }
  },
  "components": [
    {
      "type": "library",
      "group": "org.hibernate.orm",
      "name": "hibernate-core",
      "version": "7.4.1.Final",
      "purl": "pkg:maven/org.hibernate.orm/hibernate-core@7.4.1.Final?type=jar",
      "licenses": [ { "license": { "id": "Apache-2.0" } } ],
      "hashes": [ { "alg": "SHA-256", "content": "..." } ]
    }
  ],
  "dependencies": [ { "ref": "...", "dependsOn": [ "..." ] } ]
}
```

## CycloneDX Gradle 플러그인

OWASP CycloneDX 프로젝트가 만드는 Gradle 플러그인이다. 플러그인 ID 는 `org.cyclonedx.bom`. Gradle 이 실제로 해석한 의존성 그래프를 읽어 SBOM 을 만든다 — 선언만이 아니라 **충돌 해결 뒤 실제로 선택된 버전**이 들어간다.

### 작업(task)

3.x 기준으로 두 개가 생긴다.

| 작업 | 하는 일 | 결과 |
|---|---|---|
| `cyclonedxDirectBom` | 이 프로젝트 하나의 SBOM | `build/reports/cyclonedx-direct/bom.json`, `bom.xml` |
| `cyclonedxBom` | 집계 SBOM(멀티 프로젝트면 하위 프로젝트까지 합침). Spring Boot 가 jar 에 넣는 건 이쪽 | `build/reports/cyclonedx/application.cdx.json` |

단일 모듈 프로젝트면 두 결과의 내용이 같다.

### 주요 설정 (`CyclonedxDirectTask`)

| 속성 | 의미 |
|---|---|
| `includeConfigs` | SBOM 에 넣을 Gradle 구성(configuration). **배포물 기준이면 `runtimeClasspath`** |
| `skipConfigs` | 뺄 구성 |
| `projectType` | 대상의 유형. 기본 `library`, 실행 애플리케이션이면 `APPLICATION` |
| `schemaVersion` | CycloneDX 스펙 버전 (기본 최신, 지금은 1.6) |
| `componentName` / `componentVersion` / `componentGroup` | 메타데이터의 대상 이름·버전 (기본은 Gradle 프로젝트 값) |
| `includeLicenseText` | 라이선스 본문까지 넣을지 (파일이 커진다) |
| `includeBomSerialNumber` | SBOM 고유 일련번호 포함 여부 |
| `jsonOutput` / `xmlOutput` | 출력 파일 위치 |

## Spring Boot + Gradle 에서 쓰는 법

### 1. 플러그인 추가

```kotlin
// build.gradle.kts
import org.cyclonedx.gradle.CyclonedxDirectTask
import org.cyclonedx.model.Component

plugins {
    id("org.springframework.boot") version "4.1.0"
    // ...
    id("org.cyclonedx.bom") version "3.5.1"
}
```

### 2. 범위와 유형 지정 — 이걸 빼먹기 쉽다

```kotlin
tasks.named<CyclonedxDirectTask>("cyclonedxDirectBom") {
    includeConfigs = listOf("runtimeClasspath")   // 배포되는 실행 의존성만
    projectType = Component.Type.APPLICATION       // 기본값 library
}
```

**기본값은 테스트 라이브러리까지 넣는다.** 실제로 해 보니 기본값으로는 251개, `runtimeClasspath` 만 넣으니 147개였다. mockk·testcontainers·junit 같은 테스트 전용 라이브러리가 제품 SBOM 에 들어가면 배포물과 목록이 어긋나고, 취약점 스캔에서 배포되지도 않는 라이브러리 경고가 쏟아진다.

### 3. 생성

```bash
./gradlew cyclonedxBom     # SBOM 만. 테스트를 안 돌려 몇 초면 끝난다
./gradlew bootJar          # 실행 jar 까지. SBOM 을 먼저 만들고 jar 에 넣는다
./gradlew build            # 전체 빌드 + 테스트
```

`gradle run cyclonedxBom` 이 아니라 **작업 이름만** 붙인다.

### 4. Spring Boot 의 자동 연동 — jar 안의 SBOM

Spring Boot(3.3 이후)는 CycloneDX 플러그인이 적용된 걸 보면 자동으로:

- 실행 jar 에 `META-INF/sbom/application.cdx.json` 으로 SBOM 을 넣고
- `MANIFEST.MF` 에 아래 두 줄을 쓴다.

```
Sbom-Format: CycloneDX
Sbom-Location: META-INF/sbom/application.cdx.json
```

**별도 설정이 필요 없다.** 배포된 jar 에서 꺼내 보려면:

```bash
unzip -p app.jar META-INF/sbom/application.cdx.json
unzip -p app.jar META-INF/MANIFEST.MF | grep Sbom
```

#### jar 에 넣으면 뭐가 좋은가

- **목록과 배포본이 어긋나지 않는다.** SBOM 을 파일로만 따로 보관하면 "이 SBOM 이 지금 서버에 깔린 jar 와 같은 빌드인가?"를 사람이 맞춰야 한다. jar 안에 있으면 그 jar 를 만든 바로 그 빌드의 목록이다.
- **설치형(온프렘) 배포에서 특히 유용하다.** 고객 사이트마다 버전이 달라도, 새 취약점이 나오면 그 사이트의 jar 만 열어 보면 된다.
- **스캐너가 jar 를 바로 읽는다.** Trivy 같은 도구는 jar·컨테이너 이미지 안의 SBOM 을 찾아 검사한다.
- 비용은 jar 가 수백 KB 커지는 정도다.

다만 **제출·보관용 SBOM 은 파일로 따로 남겨야 한다.** jar 안의 것은 현장 확인용 사본이다.

### 5. actuator `sbom` 엔드포인트 — 열지 말 것

Spring Boot actuator 에는 `/actuator/sbom` 엔드포인트가 있어 jar 안의 SBOM 을 HTTP 로 내준다. 편하지만 **라이브러리 버전 전체 목록은 공격자에게 아주 쓸모 있는 정보**다(어떤 취약점을 시도할지 바로 고를 수 있다). 노출 목록을 `health` 정도로 좁혀 두고 열지 않는 게 기본이다.

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health     # sbom 을 넣지 않는다
```

### 6. SBOM 이 빠지지 않게 build 에서 확인

플러그인이나 Spring Boot 버전을 올리다 연동이 끊기면 **에러 없이 SBOM 만 조용히 빠진다.** 그래서 build 때 jar 를 열어 확인하는 작업을 하나 둔다.

```kotlin
import java.util.zip.ZipFile   // 스크립트 안에서 `java` 가 패키지 이름을 가리므로 import 한다

val verifySbom by tasks.registering {
    val jar = tasks.bootJar.flatMap { it.archiveFile }
    inputs.file(jar)
    doLast {
        ZipFile(jar.get().asFile).use { zip ->
            val entry = zip.getEntry("META-INF/sbom/application.cdx.json")
                ?: throw GradleException("실행 jar 에 SBOM 이 없다")
            val sbom = zip.getInputStream(entry).reader().readText()
            if (Regex("\"name\"\\s*:\\s*\"mockk\"").containsMatchIn(sbom)) {
                throw GradleException("SBOM 에 테스트 의존성이 들어갔다 — includeConfigs 확인")
            }
        }
    }
}
tasks.build { dependsOn(verifySbom) }
```

범위 설정을 일부러 빼고 돌려 실제로 실패하는 것까지 확인해 두면 안심이다.

## 프론트엔드 (Next.js + npm) 에서 쓰는 법

백엔드와 같은 CycloneDX 형식으로 맞춘다. 제품 SBOM 은 백엔드·프론트·기타 구성요소를 합친 것이라 형식이 같아야 한 스캐너로 같이 본다.

### `package.json` 이 SBOM 아닌가?

재료는 거기 다 있지만 그 자체로는 SBOM 이 아니다.

| 파일 | 들어 있는 것 | SBOM 으로 부족한 점 |
|---|---|---|
| `package.json` | 직접 쓰는 라이브러리와 버전 **범위**(`^15.1.0`) | 실제 설치 버전·전이 의존성이 없다 |
| `package-lock.json` | 전이 의존성까지 정확한 버전·무결성 해시 | npm 고유 형식이라 표준 도구가 SBOM 으로 안 읽는다. 공급자 정보가 없고 개발 의존성이 섞여 있다 |

lock 파일은 Gradle 의 의존성 트리에 해당한다. 이걸 표준 형식으로 바꾸는 도구가 필요하다.

### 도구 — `@cyclonedx/cyclonedx-npm`

Gradle 플러그인을 만드는 CycloneDX 프로젝트의 npm 용 도구다. 개발 의존성으로 넣고 **버전을 고정한다**(SBOM 결과가 도구 버전에 따라 달라지면 릴리스 간 비교가 안 된다).

```bash
npm install --save-dev --save-exact @cyclonedx/cyclonedx-npm
```

npm 9 이후에는 내장 명령 `npm sbom --sbom-format cyclonedx` 도 있다. 하지만 Next.js 프로젝트에서 `--omit dev` 로 뽑아 보니 **`next`·`react`·`react-dom` 이 통째로 빠졌다** — lock 파일상으로는 정상적인 실행 의존성인데도. 핵심 프레임워크가 없는 SBOM 은 쓸 수 없어 전용 도구를 쓴다.

### 스크립트

```json
{
  "scripts": {
    "sbom": "mkdir -p sbom && cyclonedx-npm --omit dev --sv 1.6 --mc-type application --validate --ignore-npm-errors -o sbom/app.cdx.json 2> sbom/cyclonedx.log && node scripts/verify-sbom.mjs sbom/app.cdx.json"
  }
}
```

| 옵션 | 의미 | Gradle 쪽 대응 |
|---|---|---|
| `--omit dev` | 개발 의존성(테스트·빌드 도구·스토리북 등) 제외 | `includeConfigs = runtimeClasspath` |
| `--sv 1.6` | CycloneDX 스펙 버전 | `schemaVersion` |
| `--mc-type application` | 대상 유형(기본 library) | `projectType = APPLICATION` |
| `--validate` | 만든 파일을 CycloneDX 스키마로 검증 | — |
| `--ignore-npm-errors` | `npm ls` 가 의존성 문제를 보고해도 계속 진행 | — |
| `-o` | 출력 파일 | `jsonOutput` |

`--ignore-npm-errors` 는 **선택적 peer 의존성 버전이 안 맞는 것**만으로도 npm 이 트리 전체를 오류로 보고하기 때문에 쓴다. 예를 들어 Next.js 는 `@swc/helpers` 를 특정 버전으로 고정하는데, 다국어 라이브러리가 끌고 오는 `@swc/core` 는 그보다 높은 버전을 선택적 peer 로 요구해 충돌이 난다. `overrides` 로 버전을 강제하면 풀리지만 Next.js 런타임이 쓰는 헬퍼까지 바뀐다. 대신 아래 검증 스크립트로 "트리를 제대로 읽었는가"를 확인한다 — 오류를 무시하는 옵션은 검증과 짝으로만 쓴다.

### 검증 스크립트 — Gradle `verifySbom` 과 같은 역할

```js
// scripts/verify-sbom.mjs
import { readFileSync } from 'node:fs'

const REQUIRED = ['next', 'react', 'react-dom']                         // 없으면 트리를 못 읽은 것
const DEV_ONLY = ['vitest', 'storybook', 'typescript', '@cyclonedx/cyclonedx-npm'] // 있으면 --omit dev 가 안 먹은 것

const bom = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const names = new Set()
const walk = (list) => (list ?? []).forEach((c) => { names.add(c.group ? `${c.group}/${c.name}` : c.name); walk(c.components) })
walk(bom.components)

const errors = []
if (bom.bomFormat !== 'CycloneDX') errors.push('CycloneDX 형식이 아니다')
REQUIRED.filter((n) => !names.has(n)).forEach((n) => errors.push(`실행 의존성 ${n} 이 없다`))
DEV_ONLY.filter((n) => names.has(n)).forEach((n) => errors.push(`개발 의존성 ${n} 이 들어갔다`))
if (errors.length) { console.error(errors.join('\n')); process.exit(1) }
```

백엔드는 "테스트 라이브러리가 없는가"만 보면 됐지만, 프론트는 **"있어야 할 것이 있는가"도 본다.** 위의 두 함정(내장 명령의 누락, 오류 무시 옵션)이 모두 "에러 없이 일부가 빠진 SBOM"을 만들기 때문이다.

### 배포물에 넣기 — standalone 출력

`next.config` 의 `output: 'standalone'` 은 실행에 필요한 파일만 모은 폴더(`.next/standalone/`)를 만든다. jar 처럼 SBOM 을 자동으로 넣어 주는 장치는 없으므로 빌드 스크립트 끝에서 복사한다.

```json
"build:standalone": "next build && cp -r public .next/standalone/public && cp -r .next/static .next/standalone/.next/static && npm run sbom && mkdir -p .next/standalone/sbom && cp sbom/app.cdx.json .next/standalone/sbom/"
```

- **`public/` 에 두지 않는다.** `public/` 은 그대로 웹 경로로 열린다 — actuator `sbom` 을 열지 않는 것과 같은 이유다. standalone 서버에서 `/sbom/app.cdx.json` 을 요청해 404 인지 확인해 둔다.
- 배포된 폴더(컨테이너 이미지)만 보고 구성요소를 확인할 수 있게 되는 효과는 jar 에 넣는 것과 같다.

### 번들링과 SBOM 의 한계

브라우저로 내려가는 코드는 번들러가 여러 패키지를 한 파일로 합치고 쓰지 않는 코드를 지운다(tree-shaking). lock 기반 SBOM 은 **"어떤 패키지가 들어갔나"** 수준이고, "그 패키지의 어느 코드가 번들에 실제로 남았나"까지는 모른다. 제출용으로는 패키지 수준이 일반적이고, 취약점이 잡혔을 때 실제 영향은 VEX·평가 문서로 따로 진술한다.

## SBOM 을 뽑아 보면 보이는 것

SBOM 을 처음 뽑아 보면 몰랐던 사실이 드러난다.

- **원치 않던 라이브러리가 들어 있다.** Jackson 3 를 쓰는 프로젝트인데 Jackson 2 가 같이 있었다. API 문서 라이브러리(springdoc 의 swagger-core)와 오브젝트 스토리지 클라이언트(MinIO)가 끌고 온 것이다. 앱 직렬화가 Jackson 3 라 당장 문제는 없지만, 취약점 스캔에는 두 버전이 다 잡힌다.
- **라이선스가 예상과 다르다.** MySQL JDBC 드라이버(`mysql-connector-j`)가 `GPL-2.0-only` 로 찍힌다. 실제로는 **Universal FOSS Exception** 이 붙어 있지만 SBOM 표기만 보면 GPL 이다. 설치형으로 배포하는 제품이면 라이선스 검토 대상이 될 수 있다.

SBOM 은 제출용 문서이기 전에 **"우리가 실제로 무엇을 배포하는가"를 처음으로 정확히 보여 주는 도구**다.

## SBOM 다음 — CVE 는 어떻게 찾나

SBOM 은 목록일 뿐이다. 취약점은 SBOM 을 **취약점 데이터베이스와 대조하는 도구**가 찾는다.

```
SBOM (부품 목록)  ──▶  스캐너  ──▶  CVE 결과
hibernate-core 7.4.1    OSV · NVD ·         "xxx 1.2.3 에
jackson-core 2.21.4     GitHub Advisory     CVE-YYYY-NNNN (High)"
...                     와 버전 대조
```

| 방법 | 언제 알려 주나 | 비고 |
|---|---|---|
| **스캐너로 SBOM 검사** (OSV-Scanner, Trivy, Grype) | 돌릴 때마다 (CI 에 넣으면 PR·빌드마다) | 위험도 기준으로 빌드를 실패시킬 수 있다. 결과를 릴리스 증빙으로 남긴다 |
| **OWASP Dependency-Check** (Gradle 플러그인) | 빌드 때 | NVD 를 내려받아 첫 실행이 느리고 API 키가 필요하다. 오탐이 많은 편 |
| **GitHub Dependabot 알림** | 새 CVE 가 **발표될 때** 저절로 | 이미 출시한 버전에 나중에 생긴 취약점까지 알려 준다. 비공개 저장소도 무료 |
| **Trivy 로 배포 jar·이미지 검사** | 돌릴 때마다 | jar 안의 SBOM 을 읽는다. 운영 서버·설치 사이트 점검용 |
| **`npm audit`** (프론트) | 돌릴 때마다 | npm 내장. lock 파일을 GitHub Advisory 와 대조한다. 처음 돌려 보면 프레임워크 자체의 critical 이 나오기도 한다 |

```bash
brew install osv-scanner
osv-scanner scan --sbom build/reports/cyclonedx/application.cdx.json
```

OSV-Scanner 는 라이브러리 이름·버전을 공개 OSV 서버로 보내 대조한다. 코드나 데이터는 나가지 않는다.

의료기기(FDA) 관점에서는 두 가지가 다 필요하다.

- **출시 전** — "이 버전에 알려진 취약점이 있었고, 이렇게 평가·처리했다"는 기록. 스캐너 + 평가 문서. FDA 는 특히 **CISA KEV**(실제로 악용된 취약점 목록)와 대조했는지를 본다.
- **출시 후** — 새 취약점 지속 감시. Dependabot 같은 상시 알림.

취약점이 목록에 잡혀도 실제로는 영향이 없는 경우(그 기능을 안 쓰는 등)가 많다. 이걸 "해당 없음"이라고 기계가 읽을 수 있게 진술하는 형식이 **VEX(Vulnerability Exploitability eXchange)** 이고, CycloneDX 가 이를 표현할 수 있다.

## 정리 — 남는 할 일

SBOM 을 빌드에 붙인 건 시작일 뿐이다.

- [ ] 취약점 스캔을 CI 에 넣고 결과를 릴리스별로 보관
- [ ] Dependabot 같은 상시 감시 켜기
- [ ] 릴리스 버전별 SBOM 보관 위치 정하기 (제출 증빙)
- [ ] 구성요소별 **지원 수준·지원 종료일** 표 — FDA 가이던스가 NTIA 최소 요소에 추가로 요구한다. 도구가 못 채우는 부분이라 문서로 관리한다

## 관련 노트

- [SARIF — 보안 스캐너 결과의 공통 언어](/log/sarif/)
- [Semgrep — 코드를 패턴으로 읽는 SAST 엔진](/log/semgrep/)
