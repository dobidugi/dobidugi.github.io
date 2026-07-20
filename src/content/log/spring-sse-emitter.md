---
title: "Spring SseEmitter"
date: 2026-07-20
category: "SPRING"
tags: ["spring","sse","server-sent-events","실시간통신","async","servlet","http"]
description: "<span class=\"co co-tip\">💡 TIP SSE vs WebSocket 선택 기준</span>"
minutes: 15
---
> <span class="co co-summary">📋 요약 > **SseEmitter는 Spring MVC에서 SSE(Server-Sent Events) 연결을 다루는 객체**다. 클라이언트와의 HTTP 응답 스트림을 **오래 열어두고**, 서버가 원할 때마다 데이터를 한 줄씩 푸시할 수 있게 해준다. 한 명의 클라이언트 = 하나의 SseEmitter 인스턴스.</span>

## 1. 먼저 SSE가 뭔지부터

### 1.1 한 줄 정의

**SSE (Server-Sent Events)** = 서버가 클라이언트에게 **한 방향으로** 메시지를 계속 흘려보내는 HTTP 기반 프로토콜.

```
[Client] ── HTTP GET /subscribe ──> [Server]
                                       │
                                       │ (연결 유지)
                                       │
[Client] <──── event 1 ────── [Server]
[Client] <──── event 2 ────── [Server]
[Client] <──── event 3 ────── [Server]
   ...                            (계속)
```

- **단방향**: 서버 → 클라이언트만 (반대 방향은 일반 HTTP 요청으로)
- **HTTP 위에서 동작**: 별도 프로토콜 없음, 80/443 그대로 사용
- **자동 재연결**: 끊기면 브라우저가 알아서 다시 붙음
- **텍스트만**: 바이너리 못 보냄 (필요하면 Base64 인코딩)

### 1.2 실시간 통신 방식 비교

| 방식 | 방향 | 연결 | 복잡도 | 용도 |
|---|---|---|---|---|
| **Polling** | 양방향 | 매번 새로 | 낮음 | 비효율, 거의 안 씀 |
| **Long Polling** | 양방향 | 매번 새로 | 중간 | SSE 이전 표준 |
| **SSE** | 서버 → 클라이언트 | 유지 | **낮음** | 알림, 진행률, 스트리밍 응답 |
| **WebSocket** | 양방향 | 유지 | 높음 | 채팅, 게임, 협업 |

> <span class="co co-tip">💡 TIP SSE vs WebSocket 선택 기준</span>
> - **클라이언트가 서버에 자주 보낼 게 없으면** → SSE (간단하니까)
> - **양방향 실시간이 필요하면** → WebSocket
> - GPT/Claude 같은 LLM 응답 스트리밍은 대부분 SSE로 구현됨 (서버가 토큰을 한 개씩 흘림)

## 2. SSE 와이어 프로토콜 — 실제로 어떤 텍스트가 오가는가

브라우저 개발자도구로 SSE 응답 보면 이렇게 생겼다:

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

id: 1
event: connected
data: 7c3f-4d2a-...

id: 2
event: message
data: 안녕하세요

id: 3
event: message
data: {"user":"yutae","content":"hi"}

```

**핵심 규칙**:
- `Content-Type: text/event-stream` (필수)
- 각 이벤트는 `key: value` 라인들의 집합
- **빈 줄 하나(`\n\n`)가 이벤트의 끝**을 의미
- 인식하는 필드: `id`, `event`, `data`, `retry`, `:` (주석)
- `data`에 줄바꿈 있으면 `data:` 여러 줄로 분할

> <span class="co co-note">📝 NOTE 이게 핵심</span>
> SSE는 **그냥 텍스트 스트림이다**. WebSocket처럼 프레임 구조 없음. HTTP 응답 본문에 위 형식으로 계속 쓰면 그게 SSE다. Spring의 SseEmitter는 이 텍스트를 만들어주는 wrapper일 뿐.

## 3. SseEmitter — Spring MVC가 SSE를 다루는 방식

### 3.1 정체

```java
package org.springframework.web.servlet.mvc.method.annotation;
public class SseEmitter extends ResponseBodyEmitter { ... }
```

- **Servlet 비동기 요청 처리** 기반 (`AsyncContext` 사용)
- 컨트롤러가 `SseEmitter`를 **return**하면, Spring은 응답을 즉시 닫지 않고 **계속 열어둔 상태로 유지**
- 이후 서버 코드가 `emitter.send(...)`를 호출할 때마다 그 데이터가 클라이언트에 흘러감
- `emitter.complete()` 또는 timeout이 와야 비로소 연결이 닫힘

### 3.2 가장 단순한 예제

```java
@GetMapping(value = "/sse", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
public SseEmitter sse() throws IOException {
    SseEmitter emitter = new SseEmitter();
    
    // 별도 스레드에서 비동기로 데이터 푸시
    Executors.newSingleThreadExecutor().execute(() -> {
        try {
            for (int i = 0; i < 5; i++) {
                emitter.send("tick " + i);
                Thread.sleep(1000);
            }
            emitter.complete();
        } catch (Exception e) {
            emitter.completeWithError(e);
        }
    });
    
    return emitter; // 즉시 반환 — 응답은 열린 채로 유지
}
```

흐름:
1. 클라이언트가 `GET /sse` 요청
2. 컨트롤러가 `SseEmitter` 객체 반환
3. Spring이 응답 헤더만 보내고 본문은 열어둠
4. 워커 스레드가 매초마다 `send()` 호출 → 클라이언트에 한 줄씩 도착
5. 5번 보낸 뒤 `complete()` → 응답 종료, 연결 닫힘

### 3.3 핵심 메서드

| 메서드 | 역할 |
|---|---|
| `send(Object data)` | 데이터 전송 (기본 `event: message`) |
| `send(SseEventBuilder)` | event name, id, retry, comment 지정해 전송 |
| `complete()` | 정상 종료 — 응답 닫음 |
| `completeWithError(Throwable)` | 에러로 종료 |
| `onCompletion(Runnable)` | 응답 완료 시 콜백 (정상/에러 모두) |
| `onTimeout(Runnable)` | 타임아웃 도달 시 콜백 |
| `onError(Consumer<Throwable>)` | 전송 중 에러 시 콜백 |

### 3.4 SseEventBuilder — 풍성한 이벤트 만들기

```java
emitter.send(SseEmitter.event()
    .id(String.valueOf(seq))           // Last-Event-ID 재연결용
    .name("notification")              // 클라이언트의 addEventListener 대상
    .reconnectTime(3000)               // 끊기면 3초 후 재연결
    .data(payload, MediaType.APPLICATION_JSON)
    .comment("internal: user notice")); // ":" 시작 라인 (디버깅용)
```

클라이언트에서:
```js
es.addEventListener('notification', (ev) => {
    console.log(ev.lastEventId, ev.data);
});
```

## 4. 클라이언트 측 — EventSource API

브라우저는 SSE 클라이언트를 **`EventSource`** 라는 이름으로 표준 지원.

```js
const es = new EventSource('/sse/subscribe');

es.onmessage = (e) => console.log('default:', e.data);
es.addEventListener('connected', (e) => console.log('connected id:', e.data));
es.onerror = (e) => console.log('readyState:', es.readyState);
```

### EventSource의 마법 기능

1. **자동 재연결**: 연결 끊기면 약 3초 후 자동으로 다시 GET 요청
2. **Last-Event-ID 헤더**: 재연결 시 마지막으로 받은 `id` 값을 `Last-Event-ID` HTTP 헤더에 담아 보냄 → 서버가 못 받은 메시지만 다시 보내는 게 가능
3. **readyState**: `CONNECTING(0)`, `OPEN(1)`, `CLOSED(2)`

> <span class="co co-warning">⚠️ 주의 브라우저 도메인당 연결 제한</span>
> 같은 도메인에 대해 EventSource는 **6개**까지만 동시에 열 수 있다 (HTTP/1.1 제약). 여러 탭 띄우면 7번째부터 안 열림. HTTP/2면 100+개 가능.

## 5. SseEmitter의 라이프사이클 — 메모리 누수 조심

### 5.1 가장 흔한 버그: 정리 안 함

```java
// ❌ 잘못된 코드 — 메모리 누수 폭탄
private final Map<String, SseEmitter> emitters = new HashMap<>();

public SseEmitter subscribe(String id) {
    SseEmitter emitter = new SseEmitter(30 * 60 * 1000L);
    emitters.put(id, emitter);
    return emitter;
    // 클라이언트가 연결 끊어도 map에서 안 빠짐 → 누수
}
```

### 5.2 올바른 패턴 — Repository로 분리

```java
@Repository
public class SseEmitterRepository {
    private final Map<String, SseEmitter> emitters = new ConcurrentHashMap<>();

    public SseEmitter save(String clientId, SseEmitter emitter) {
        emitters.put(clientId, emitter);
        emitter.onCompletion(() -> emitters.remove(clientId)); // 정상 종료
        emitter.onTimeout(() -> emitters.remove(clientId));    // 타임아웃
        emitter.onError(e -> emitters.remove(clientId));       // 에러
        return emitter;
    }
}
```

> <span class="co co-important">📌 IMPORTANT 세 콜백 모두 등록 필수</span>
> `onCompletion`만 등록하면 timeout이나 error로 끊긴 emitter는 map에 남는다. **세 개 모두** 등록해야 모든 종료 경로를 커버.

### 5.3 종료가 일어나는 모든 경로

| 종료 원인 | 발동 콜백 | 설명 |
|---|---|---|
| `emitter.complete()` 호출 | `onCompletion` | 정상 종료 |
| `emitter.completeWithError(e)` | `onError` → `onCompletion` | 명시적 에러 종료 |
| 타임아웃 (생성자 인자) | `onTimeout` → `onCompletion` | 일정 시간 무활동 |
| 클라이언트가 연결 끊음 | `onError(IOException)` → `onCompletion` | 브라우저 닫기, 네트워크 단절 |
| 서버 send() 중 IOException | (수동 처리 필요) | `send()`가 던지는 예외 잡아 정리 |

## 6. 프로덕션에서 필수: Heartbeat (하트비트)

### 6.1 왜 필요한가

중간에 끼는 친구들이 **유휴 연결을 끊어버린다**:
- nginx 기본 `proxy_read_timeout`: **60초**
- AWS ALB 기본 idle timeout: **60초**
- CloudFront: **30초**
- 사내 방화벽: 천차만별

→ 60초 동안 아무 데이터도 안 흐르면 프록시가 응답을 close 시킴.

### 6.2 해결책: 주기적 ping 또는 comment

```java
@Scheduled(fixedDelay = 30_000) // 30초마다
public void heartbeat() {
    repository.findAll().forEach((id, emitter) -> {
        try {
            emitter.send(SseEmitter.event().comment("ping"));
            // 또는: .name("heartbeat").data("")
        } catch (IOException e) {
            repository.remove(id);
        }
    });
}
```

`comment`는 클라이언트의 `onmessage`에 노출 안 됨 → 사용자 모르게 keep-alive만 수행.

> <span class="co co-tip">💡 TIP 30초가 표준</span>
> 보통 30초 주기면 대부분 프록시 default timeout을 안전하게 넘긴다.

## 7. 동시성 — send()는 누가 호출하는가

### 7.1 send()는 동기 호출 → 블로킹 주의

`emitter.send(data)`는 내부적으로 **HTTP 응답 스트림에 직접 쓴다**. 네트워크가 느리면 호출 스레드가 그동안 막힌다.

```java
// ❌ 컨트롤러 요청 스레드가 send() 동안 블로킹됨
@PostMapping("/broadcast")
public String broadcast(String msg) {
    repository.findAll().forEach((id, emitter) -> {
        emitter.send(msg); // 1000명이면 1000번 직렬 전송
    });
    return "ok";
}
```

### 7.2 해결책: 비동기 전송

```java
@Async
public void sendAsync(SseEmitter emitter, Object data) {
    try {
        emitter.send(data);
    } catch (IOException e) {
        emitter.completeWithError(e);
    }
}
```

또는 `TaskExecutor` 주입해서 명시적 큐잉.

### 7.3 동일 emitter에 동시에 send 금지

SseEmitter는 **스레드 세이프하지 않다**. 한 emitter에 여러 스레드가 동시에 `send()` 하면 출력이 섞일 수 있음.
→ 클라이언트별 단일 큐, 또는 `synchronized` 블록 필요.

## 8. 자주 만나는 함정 정리

| 함정                 | 증상                      | 해결                                   |
| ------------------ | ----------------------- | ------------------------------------ |
| 콜백 미등록             | OOM, emitter map이 계속 커짐 | onCompletion/onTimeout/onError 모두 등록 |
| Heartbeat 없음       | 60초 후 클라이언트가 [error] 받음 | 30초마다 ping                           |
| 동기 send 직렬화        | broadcast 시 응답 지연       | `@Async` 또는 별도 워커풀                   |
| 동일 emitter 동시 send | 출력 깨짐                   | 클라이언트별 큐                             |
| Content-Type 누락    | 브라우저가 일반 응답으로 해석        | `produces = TEXT_EVENT_STREAM_VALUE` |
| nginx buffering    | 메시지가 한꺼번에 도착            | `proxy_buffering off;` 추가            |
| CORS 누락            | 다른 origin에서 못 붙음        | `@CrossOrigin` 또는 글로벌 설정             |
| 브라우저 6개 제한         | 7번째 탭부터 connecting 멈춤   | HTTP/2 사용, 또는 SharedWorker로 통합       |

## 9. WebFlux 버전과의 차이 (참고)

Spring WebFlux를 쓰면 **`Flux<ServerSentEvent<T>>`** 반환으로 SSE 구현 가능. 동작 모델이 다름.

```java
@GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
public Flux<ServerSentEvent<String>> stream() {
    return Flux.interval(Duration.ofSeconds(1))
        .map(seq -> ServerSentEvent.<String>builder()
            .id(String.valueOf(seq))
            .event("tick")
            .data("now: " + seq)
            .build());
}
```

| 비교 | Spring MVC (SseEmitter) | Spring WebFlux (Flux<SSE>) |
|---|---|---|
| 스레드 모델 | Servlet 비동기 (스레드 점유) | Netty 이벤트 루프 (논블로킹) |
| 만 명 동시 연결 | 무거움 (스레드 풀 압박) | 매우 가벼움 |
| 학습 곡선 | 낮음 | 높음 (Reactor) |
| 명령형 코드 | 자연스러움 | 선언형으로 바꿔야 |

> <span class="co co-note">📝 NOTE 무엇을 쓸까</span>
> 동시 연결 수가 수백 이하면 MVC + SseEmitter로 충분. 수천 이상이면 WebFlux 검토.

## 10. 내 프로젝트 코드 리뷰

> sse-test 프로젝트에서 작성한 코드 (`SseController.java`, `SseEmitterRepository.java`) 기준

**잘한 점**:
- ✅ `ConcurrentHashMap` 사용 → 스레드 안전
- ✅ `onCompletion / onTimeout / onError` 모두 등록 → 누수 방지
- ✅ `Map.copyOf()`로 외부에 불변 뷰만 반환 → 캡슐화
- ✅ 연결 직후 `connected` 이벤트로 ID 즉시 전달 (프록시 타임아웃 회피 의도까지 명시)
- ✅ `send` 실패 시 `repository.remove(clientId)` 정리

**더 추가하면 좋을 것**:
- ⬜ **Heartbeat**: 30초마다 ping 이벤트 또는 comment (현재 30분 timeout만 있고, 그 사이 프록시가 끊을 수 있음)
- ⬜ **비동기 전송**: `@Async`로 send 분리 (지금은 broadcast가 직렬)
- ⬜ **Last-Event-ID 재연결 핸들링**: 헤더 받아서 못 보낸 메시지 재전송
- ⬜ **인증/권한**: 현재는 누구나 `/sse/subscribe?clientId=xxx` 호출 가능 — 다른 사람 ID 사칭 가능
- ⬜ **테스트 코드**: `@SpringBootTest` + `WebTestClient`로 검증

## 11. 더 깊이 들어가려면

다음에 공부할 만한 주제들:
- Spring Async — `@Async`, `TaskExecutor` 구성
- Redis Pub Sub — 다중 서버 환경에서 SSE 메시지 동기화
- Spring WebFlux — Reactor 기반 SSE
- Server-Sent Events 표준 스펙 — W3C HTML5 표준 문서
- nginx SSE 설정 — proxy_buffering, proxy_read_timeout 등

## 핵심 정리 한 줄

> **SseEmitter는 "오래 열려 있는 HTTP 응답에 텍스트를 한 줄씩 쓰는 객체"이고, 라이프사이클 콜백 세 개 등록과 heartbeat만 신경 쓰면 90%는 안전하다.**
