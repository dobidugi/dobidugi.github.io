---
title: "WinSW — 실행 파일을 윈도우 서비스로 등록하기"
date: 2026-08-26
category: "INFRA"
tags: ["reference","Windows","WinSW","서비스","배포","인프라"]
description: "아무 실행 파일이나 윈도우 서비스로 감싸주는 래퍼. 설정이 exe 옆 XML 한 장이라 git으로 관리되고, 그게 레지스트리에 설정을 묻어두는 NSSM과의 결정적 차이다."
minutes: 11
---
> <span class="co co-abstract">📋 요약 한 줄 요약</span>
> 아무 실행 파일이나 윈도우 서비스로 감싸주는 래퍼. 설정이 **exe 옆 XML 한 장**이라 git으로 관리되고, 그게 레지스트리에 설정을 묻어두는 NSSM과의 결정적 차이다.

## 윈도우 서비스가 뭔가

리눅스의 systemd 유닛에 해당하는 개념이다. 특징이 몇 가지 있다.

- **로그인 없이** 부팅 시점에 자동으로 뜬다
- 사용자 세션과 독립적이라 로그아웃해도 죽지 않는다
- **SCM**(Service Control Manager)이 시작·정지·재시작과 실패 복구를 관리한다
- 서비스끼리 의존 관계를 걸 수 있다

콘솔 앱을 그냥 띄워두면 세션이 끊길 때 같이 죽는다. 작업 스케줄러는 부팅 시 실행까지는 되지만 죽었을 때 되살리는 정책이 빈약하다. 그래서 서버에서 상시 돌아야 하는 것은 서비스로 등록한다.

## 왜 래퍼가 필요한가

여기가 핵심이다. **윈도우 서비스는 아무 프로그램이나 될 수 없다.**

서비스가 되려면 프로그램이 SCM과 대화하는 규약을 지켜야 한다. 시작 진입점을 SCM에 등록하고, "시작 중 / 실행 중 / 정지 중" 상태를 주기적으로 보고하고, 정지 요청 신호를 받아 처리해야 한다.

그런데 우리가 돌리려는 건 대개 그런 걸 구현하지 않은 평범한 프로그램이다. Spring Boot jar, Node 서버, MinIO 바이너리, 파이썬 스크립트 전부 그냥 콘솔 앱이다. SCM이 시작시켜도 상태 보고를 안 하니 곧바로 오류로 처리된다.

그래서 중간에 통역이 하나 필요하다.

```
SCM  ←→  래퍼(진짜 서비스)  ←→  실제 프로세스(자식)
```

**래퍼가 서비스로 등록되고**, 래퍼가 내 프로그램을 자식 프로세스로 띄운다. SCM과의 규약은 래퍼가 대신 지켜준다. 정지 요청이 오면 래퍼가 자식을 종료시킨다.

WinSW와 NSSM이 둘 다 이 자리에 있는 도구다.

## WinSW는 무엇인가

**Windows Service Wrapper**의 줄임말이고, .NET으로 만들어진 오픈소스다.

원래 Jenkins 윈도우 설치 프로그램을 위해 만들어졌다. "JVM 프로세스를 서버에서 오래 안정적으로 굴린다"는 요구가 설계에 깔려 있어서, 로그 처리와 실패 복구가 그 시절부터 다듬어졌다.

동작 방식이 독특하다. **실행 파일 이름과 같은 XML 파일**을 옆에 두면 그걸 설정으로 읽는다.

```
myapp.exe    ← WinSW.exe 를 이 이름으로 복사한 것
myapp.xml    ← 설정. 파일명이 exe와 같아야 한다
```

> <span class="co co-warning">⚠️ 주의 버전 선택</span>
> 안정판은 **v2.x**(현재 v2.12.0)다. v3는 기능이 더 많지만 **오래도록 alpha 상태**(v3.0.0-alpha.11)라, 운영에 올릴 거면 v2를 쓰는 편이 안전하다.
> 이 노트에서 v3 전용 기능은 따로 표시했다.

## NSSM과 무엇이 다른가

NSSM도 여전히 잘 동작하는 좋은 도구다. 단일 exe로 끝나고 대화형으로 빠르게 등록할 수 있다는 장점이 분명하다.

결정적 차이는 **설정이 어디 사는가**다.

| | NSSM | WinSW |
|---|---|---|
| 설정 저장 위치 | **레지스트리** | **exe 옆 XML 파일** |
| 버전 관리 | 사실상 불가 | git에 그대로 들어간다 |
| 서버 재구축 | 수동으로 다시 설정 | 파일 복사 후 install |
| 설정 확인 | `nssm edit`로 GUI를 띄워야 | 파일 열어보면 끝 |
| 서비스 의존 관계 | 제한적 | `<depend>` |
| 실패 재시작 | 지원 | 실패 횟수별로 다른 지연 지정 가능 |
| 생명주기 후크 | 없음 | prestart/poststop 등 (v3) |

NSSM에서는 "그때 그 서버에 뭐라고 설정했더라"가 자주 발생한다. WinSW는 **서비스 정의가 코드가 되어** 저장소에 남는다. 서버를 새로 세울 때 XML을 복사하고 install만 하면 동일한 상태가 재현된다.

## 사용법

### 준비

1. [릴리스](https://github.com/winsw/winsw/releases)에서 `WinSW-x64.exe` 를 받는다
2. 서비스 이름에 맞춰 이름을 바꾼다 — 예: `storage.exe`
3. 같은 폴더에 `storage.xml` 을 만든다

### 설치와 제어

관리자 권한 프롬프트에서 실행한다.

```powershell
.\storage.exe install     # 서비스 등록
.\storage.exe start       # 시작
.\storage.exe status      # 상태 확인
.\storage.exe stop        # 정지
.\storage.exe restart     # 재시작
.\storage.exe refresh     # XML 변경분 반영 (재설치 없이)
.\storage.exe uninstall   # 등록 해제
```

`refresh` 는 설명·시작 유형·의존 관계 같은 항목을 재설치 없이 갱신한다. 다만 실행 파일 경로처럼 일부 항목은 uninstall 후 다시 install해야 한다.

## 예시 — 오브젝트 스토리지와 백엔드

서비스 두 개를 등록하고, 백엔드가 스토리지 뒤에 뜨도록 의존 관계를 건 구성이다.

### storage.xml

```xml
<service>
  <id>myapp-storage</id>
  <name>MyApp Object Storage</name>
  <description>MinIO 기반 오브젝트 스토리지</description>

  <executable>C:\myapp\minio\minio.exe</executable>
  <arguments>server C:\myapp\data --console-address ":9001"</arguments>
  <workingdirectory>C:\myapp\minio</workingdirectory>

  <env name="MINIO_ROOT_USER" value="%MINIO_ROOT_USER%"/>
  <env name="MINIO_ROOT_PASSWORD" value="%MINIO_ROOT_PASSWORD%"/>

  <startmode>Automatic</startmode>
  <delayedAutoStart/>

  <log mode="roll-by-size-time">
    <sizeThreshold>10240</sizeThreshold>
    <pattern>yyyyMMdd</pattern>
    <autoRollAtTime>00:00:00</autoRollAtTime>
  </log>

  <onfailure action="restart" delay="5 sec"/>
  <onfailure action="restart" delay="15 sec"/>
  <onfailure action="restart" delay="60 sec"/>
  <resetfailure>1 hour</resetfailure>

  <stoptimeout>30 sec</stoptimeout>
</service>
```

### backend.xml

```xml
<service>
  <id>myapp-backend</id>
  <name>MyApp Backend API</name>
  <description>Spring Boot 백엔드</description>

  <executable>java</executable>
  <arguments>-Xmx2g -jar C:\myapp\backend\app.jar --spring.profiles.active=prod</arguments>
  <workingdirectory>C:\myapp\backend</workingdirectory>

  <!-- 스토리지가 먼저 시작되도록 -->
  <depend>myapp-storage</depend>

  <startmode>Automatic</startmode>
  <delayedAutoStart/>

  <log mode="roll-by-size-time">
    <sizeThreshold>10240</sizeThreshold>
    <pattern>yyyyMMdd</pattern>
  </log>

  <onfailure action="restart" delay="10 sec"/>
  <onfailure action="restart" delay="30 sec"/>
  <resetfailure>1 hour</resetfailure>

  <stoptimeout>45 sec</stoptimeout>
</service>
```

설치 순서는 의존 대상이 먼저다.

```powershell
.\storage.exe install
.\backend.exe install
.\storage.exe start      # backend 는 의존 관계로 함께 뜬다
```

## XML 태그 정리

### 필수

| 태그 | 설명 |
|---|---|
| `<id>` | 서비스 내부 식별자. **레지스트리 키 이름**이 되고 `<depend>`가 참조하는 값. 공백 없이 짓는다 |
| `<name>` | 서비스 목록(`services.msc`)에 보이는 이름 |
| `<executable>` | 실제로 실행할 파일. PATH에 있으면 `java` 처럼 이름만 써도 된다 |

### 실행

| 태그 | 설명 |
|---|---|
| `<arguments>` | 실행 인자. 길면 여러 줄로 나눠 써도 된다 |
| `<workingdirectory>` | 작업 디렉터리. **생략하면 exe 위치**가 되어, 상대 경로를 쓰는 앱이 엉뚱한 곳을 본다 |
| `<env name="" value=""/>` | 환경 변수. 여러 번 쓸 수 있고 `%VAR%` 로 시스템 변수를 참조한다 |
| `<priority>` | 프로세스 우선순위 (`Normal`, `BelowNormal` 등) |

### 시작·정지

| 태그 | 설명 |
|---|---|
| `<startmode>` | `Automatic` / `Manual` / `Disabled`. 기본은 Automatic |
| `<delayedAutoStart/>` | 부팅 직후가 아니라 **조금 늦게** 시작. 디스크·네트워크 경합을 피한다 |
| `<depend>` | 먼저 시작되어야 할 서비스의 `<id>`. 여러 번 쓸 수 있다 |
| `<stoptimeout>` | 정지 요청 후 이 시간이 지나면 강제 종료. 기본 15초라 **JVM은 늘리는 게 좋다** |
| `<stopexecutable>` / `<stopargument>` | 별도의 정지 명령이 있는 경우 지정 |

### 실패 복구

| 태그 | 설명 |
|---|---|
| `<onfailure action="" delay=""/>` | `restart` / `reboot` / `none`. **여러 번 쓰면 1·2·3차 실패마다 다른 지연**이 적용된다 |
| `<resetfailure>` | 이 시간 동안 정상이면 실패 횟수를 0으로 되돌린다 |

### 로그

| 태그 | 설명 |
|---|---|
| `<log mode="">` | `append`(기본) / `reset` / `roll` / `roll-by-time` / `roll-by-size` / `roll-by-size-time` / `none` |
| `<sizeThreshold>` | 회전 기준 크기. **KB 단위**라 `10240` 이면 10MB |
| `<keepFiles>` | 보관할 파일 개수 |
| `<pattern>` | 시간 기준 회전의 날짜 형식 |

기본이 `append` 라서 **그냥 두면 로그가 무한정 커진다.** 처음 설정할 때 같이 잡아두는 게 좋다.

### 계정

| 태그 | 설명 |
|---|---|
| `<serviceaccount>` | 하위에 `<username>`, `<password>`, `<allowservicelogon>` |

생략하면 **LocalSystem**으로 돈다. 로컬 디스크만 쓰면 문제없지만 네트워크 공유에 접근해야 하면 실제 계정이 필요하다.

### v3 전용 (alpha)

| 태그 | 설명 |
|---|---|
| `<prestart>` / `<poststart>` | 프로세스 시작 전후에 실행할 명령 |
| `<prestop>` / `<poststop>` | 정지 전후 |
| `<download>` | 시작 전에 파일을 받아온다 |

## 자주 밟는 함정

### `<depend>`는 순서만 보장하지 준비 상태가 아니다

가장 많이 걸리는 부분이다.

SCM은 서비스가 `SERVICE_RUNNING` 을 보고하면 시작된 것으로 친다. 그런데 래퍼는 **감싼 프로세스가 뜨는 순간** 그렇게 보고한다.

MinIO가 포트를 바인딩하고 실제로 요청을 받기까지 2~3초 걸린다면, 그 사이에 백엔드가 이미 올라와서 연결에 실패하고 죽는다.

**부팅 직후에만 재현되고 손으로 재시작하면 잘 되는** 유형이라 원인 찾기가 성가시다. 대처는 두 가지를 같이 쓴다.

- `<onfailure>` 를 계단식으로 걸어 실패해도 다시 붙게 한다
- 애플리케이션 쪽에 **연결 재시도**를 넣는다

의존 관계는 "순서 힌트"로 이해하고, 실제 준비 여부는 앱이 스스로 확인하게 만드는 게 맞다.

### LocalSystem은 네트워크 드라이브를 못 본다

데이터 디렉터리를 SMB 공유나 매핑 드라이브에 두면 접근이 막힌다. LocalSystem은 네트워크 자격 증명이 없기 때문이다.

`<serviceaccount>` 로 실제 계정을 주고, 그 계정에 **"서비스로 로그온" 권한**을 부여해야 한다.

### 로그가 무한정 커진다

`<log>` 를 생략하면 `append` 라 계속 쌓인다. 몇 달 방치하면 디스크를 채운다.

### 32/64비트와 런타임

릴리스에 `WinSW-x64.exe`, `WinSW-x86.exe` 등이 나뉘어 있다. v2는 .NET Framework가 필요하고, 최신 윈도우 서버에는 대개 들어 있지만 최소 설치 이미지에서는 확인이 필요하다.

## 참고 링크

- [winsw/winsw](https://github.com/winsw/winsw) — 저장소 본체
- [릴리스](https://github.com/winsw/winsw/releases) — 실행 파일 다운로드. 안정판은 v2.x
- [XML 설정 레퍼런스 — v2](https://github.com/winsw/winsw/blob/v2/doc/exeConfigFile.md) — **안정판 기준.** 이 노트가 따르는 문서
- [XML 설정 레퍼런스 — v3](https://github.com/winsw/winsw/blob/v3/docs/xml-config-file.md) — 기본 브랜치. v3 전용 태그가 섞여 있으니 v2를 쓴다면 위 문서를 볼 것
