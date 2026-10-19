---
title: "Spring SseEmitter로 알림을 보내고 연결 관리하기"
date: 2026-07-20
category: "SPRING"
tags: ["spring","sse","server-sent-events","실시간통신","async","servlet","http"]
description: "Spring MVC의 SseEmitter로 서버에서 이벤트를 보내고, 연결 종료와 재연결을 관리하는 방법을 정리한다. 요청 대기와 실제 전송의 차이, 하트비트와 이벤트 복구에 필요한 조건도 살펴본다…"
minutes: 4
---
> <span class="co co-abstract">📋 요약 한 줄 요약</span>
> Spring MVC의 SseEmitter로 서버에서 이벤트를 보내고, 연결 종료와 재연결을 관리하는 방법을 정리한다. 요청 대기와 실제 전송의 차이, 하트비트와 이벤트 복구에 필요한 조건도 살펴본다.

새 알림이나 작업 진행률처럼 서버에서 생긴 변화를 화면에 전달해야 할 때가 있다. SSE는 HTTP 응답을 열어두고, 필요한 순간마다 서버에서 클라이언트로 이벤트를 보내는 방식이다.

Spring MVC에서는 `SseEmitter`로 이런 응답을 만들 수 있다. 하나의 emitter는 하나의 SSE 연결에 대응한다. 같은 사용자가 여러 탭을 열면 연결도 여러 개가 될 수 있다.

## 요청 대기와 이벤트 전송

컨트롤러가 `SseEmitter`를 반환하면 Spring은 Servlet 비동기 처리를 시작한다. 요청을 처리하던 스레드는 반환할 수 있고, 응답은 이후 이벤트를 보낼 수 있도록 유지된다. 실제 데이터를 쓰는 `send()` 호출은 블로킹 방식이므로, 대기 중인 연결과 전송 중인 작업을 구분해서 이해해야 한다. [Spring 비동기 요청 처리](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-ann-async.html)

연결이 준비되면 다음처럼 이벤트 이름과 데이터를 지정해 보낼 수 있다.

```java
emitter.send(SseEmitter.event()
        .id("42")
        .name("notification")
        .data(
                Map.of("message", "보고서 생성이 끝났습니다."),
                MediaType.APPLICATION_JSON
        ));
```

브라우저에서는 `EventSource`로 이벤트를 받는다. 다음 코드는 같은 출처에서 인증된 구독 요청을 처리한다는 전제다.

```javascript
const source = new EventSource("/sse/subscribe");

source.addEventListener("notification", (event) => {
  const notification = JSON.parse(event.data);
  console.log(notification.message);
});

// 화면을 떠나 구독이 필요 없어지면 호출한다.
function disconnect() {
  source.close();
}
```

## 재연결과 누락된 이벤트 복구

`EventSource`는 연결이 끊어지면 재연결을 시도한다. 이전에 받은 이벤트 ID가 있으면 재연결 요청의 `Last-Event-ID` 헤더에 전달할 수 있다. 누락된 알림을 복구하려면 서버가 이벤트를 저장하고, 해당 ID 이후의 데이터를 조회해 다시 보내는 기능까지 구현해야 한다. [SSE 표준](https://html.spec.whatwg.org/dev/server-sent-events.html#the-last-event-id-header)

## 종료된 연결 정리

연결을 저장소에서 관리한다면 종료된 emitter를 제거하는 코드도 필요하다. 다음은 `connections`가 `ConcurrentMap`이고, 연결 등록을 마친 상황에서 사용하는 정리 코드다.

```java
emitter.onCompletion(
        () -> connections.remove(connectionId, emitter)
);
```

`onCompletion`은 정상 종료뿐 아니라 타임아웃이나 네트워크 오류로 비동기 요청이 완료된 경우에도 호출된다. `onTimeout`과 `onError`는 종료 원인별 로그나 추가 처리가 필요할 때 사용할 수 있다. 여러 콜백에서 같은 정리 함수를 호출한다면 반복 실행해도 문제가 없도록 작성한다. [ResponseBodyEmitter API](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/web/servlet/mvc/method/annotation/ResponseBodyEmitter.html)

## 하트비트와 타임아웃

알림이 오랫동안 발생하지 않으면 프록시나 로드밸런서가 유휴 연결을 끊을 수 있다. 이런 환경에서는 주기적으로 주석 형태의 하트비트를 보낼 수 있다.

```java
emitter.send(SseEmitter.event().comment("heartbeat"));
```

하트비트 주기는 실제 서비스 경로에 있는 장비의 유휴 제한을 확인해 정한다. emitter의 비동기 요청 타임아웃도 별도로 확인해야 한다. 하트비트를 보낸다고 모든 종류의 타임아웃이 연장되는 것은 아니다.

## 전송량이 늘어나면 확인할 것

전송량이 늘어나면 느린 클라이언트가 다른 전송에 영향을 주는지도 살펴봐야 한다. 전송 작업을 분리할 때는 Spring이 관리하는 실행기를 사용하고, 큐가 계속 쌓이지 않도록 처리 한도를 정한다.

Spring 6.2의 `SseEmitter`는 내부 잠금으로 이벤트 쓰기를 보호한다. 다만 여러 작업이 동시에 전송을 요청했을 때 업무상 필요한 순서까지 보장하지는 않는다. 순서가 중요하다면 연결별 전송 큐처럼 순서를 관리하는 구조가 필요하다. [Spring 6.2 구현](https://github.com/spring-projects/spring-framework/blob/v6.2.0/spring-webmvc/src/main/java/org/springframework/web/servlet/mvc/method/annotation/SseEmitter.java)

운영 전에는 연결 종료 후 저장소가 정리되는지, 재연결 시 필요한 알림이 복구되는지, 실제 프록시를 거쳐서도 이벤트가 제때 도착하는지를 확인한다. WebFlux 전환 여부 역시 연결 수 하나로 정하기보다 전송 빈도와 자원 사용량을 측정해 판단하는 편이 좋다.
