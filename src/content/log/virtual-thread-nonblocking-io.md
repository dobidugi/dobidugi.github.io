---
title: "가상 스레드와 논블로킹 IO"
date: 2026-03-28
category: "CS"
tags: ["CS","Java","concurrency","IO","performance"]
description: "Thread가 I/O를 기다리지 않는다. 서버 내부의 thread 관리 방식이지, 유저에게 response를 나중에 준다는 뜻이 아니다."
minutes: 8
---
둘 다 **"I/O 대기 시간에 thread 자원을 낭비하지 말자"** 라는 같은 문제를 다른 방식으로 해결한다.

## 기존 방식 (Platform Thread)

요청마다 OS thread 하나가 배정된다.

```
Request → [Thread1] → DB query → ⏳ blocking → 결과 받음 → Response
```

- DB 응답이 올 때까지 thread는 **아무것도 안 하면서 점유**됨
- thread 하나에 ~1MB memory → 동시 요청 10,000개면 ~10GB
- Tomcat 기본 thread pool이 200개인 이유 → 넘으면 요청이 queue에 쌓임

## Non-blocking IO

> <span class="co co-info">ℹ️ INFO 핵심</span>
> **Thread가 I/O를 기다리지 않는다.** 서버 내부의 thread 관리 방식이지, 유저에게 response를 나중에 준다는 뜻이 아니다.

### 동작 방식

```
Request1 → [Thread1] → DB query (non-blocking) → Thread1 해방 → 다른 request 처리
                                                       ↓
                                             DB 결과 도착하면
                                                       ↓
                                        [Thread2 or 1] → callback 실행 → Response
```

- Thread 소수(보통 CPU core 수)만으로 수만 request 처리 가능
- 대표적으로 Netty, Spring WebFlux가 이 방식

### Code style (Reactive)

```java
return userRepository.findById(id)
    .flatMap(user -> orderRepository.findByUser(user)
        .map(order -> new Response(user, order)));
```

- callback/chaining 기반이라 코드가 복잡해짐
- stack trace가 끊겨서 debugging이 어려움

### Non-blocking ≠ 응답을 나중에 주는 것

|           | Non-blocking IO        | 응답을 나중에 주는 것       |
| --------- | ---------------------- | ------------------- |
| Level     | 서버 내부 thread 관리       | API design pattern  |
| 누가 결정     | framework/runtime      | 개발자                 |
| 목적        | thread 효율              | UX/비즈니스 요구사항        |

대부분의 REST API는 non-blocking IO를 쓰면서도 **결과를 기다려서 synchronous하게 응답**한다. "접수만 하고 나중에 결과 알림"은 비즈니스 설계의 선택이지 non-blocking이라서 그런 것이 아니다.

## Virtual Thread (Project Loom)

> <span class="co co-info">ℹ️ INFO 핵심</span>
> **동기식 코드를 쓰면서 non-blocking의 효율을 얻는다.** JVM이 관리하는 lightweight thread.

### 동작 방식

```
Request1 → [VirtualThread1] → DB query (blocking code)
                                    ↓
                          JVM 감지: "I/O blocking이네"
                                    ↓
                          VirtualThread1을 carrier thread에서 분리 (unmount)
                                    ↓
                          Carrier thread → 다른 VirtualThread 처리
                                    ↓
                        DB 결과 도착 → VirtualThread1 다시 올림 (mount) → 계속 실행
```

- **Carrier thread** = 실제 OS thread, 소수만 존재
- Virtual thread는 ~수 KB memory → 수만 개 생성 가능
- JVM이 I/O blocking을 감지하면 자동으로 unmount/mount

### JVM은 어떻게 blocking을 감지하나?

개발자가 뭔가를 요청하는 게 아니다. 
Java 21에서 **JDK 표준 라이브러리의 blocking method 내부 구현이 바뀌었다.**

`Thread.sleep()`, `Socket.read()`, `InputStream.read()` 등이 내부적으로:

1. 현재 thread가 virtual thread인지 확인
2. Virtual thread → carrier thread에서 unmount, I/O를 non-blocking으로 등록
3. Platform thread → 기존처럼 그냥 blocking

```java
// 개념적 흐름 (실제 JDK 내부)
public int read() {
    // 예전: OS-level blocking call → thread가 멈춤
    // 지금: virtual thread인가?
    //       → 맞으면 carrier thread에서 unmount
    //       → OS에 non-blocking으로 I/O 등록
    //       → 결과 오면 다시 mount
}
```

그래서 `Thread.ofVirtual()`로 실행하기만 하면 JDK가 알아서 처리한다. 코드를 바꿀 필요 없음.

> <span class="co co-warning">⚠️ 주의 Pinning 주의</span>
> **JDK 표준 라이브러리만** 이렇게 대응된다. 다음 경우에는 JVM이 감지를 못해서 carrier thread가 묶임 (pinning):
> - JNI로 native code에서 blocking
> - `synchronized` block 안에서 I/O blocking

### Code style (동기식 그대로)

```java
User user = userRepository.findById(id);       // blocking → JVM이 알아서 unmount
Order order = orderRepository.findByUser(user); // 여기서도
return new Response(user, order);               // 깔끔
```

## 비교

|             | Non-blocking IO              | Virtual Thread                  |
| ----------- | ---------------------------- | ------------------------------- |
| 문제          | Thread가 I/O에서 놀고있다           | Thread가 I/O에서 놀고있다              |
| 해결          | Thread를 안 기다리게 바꿈            | 기다려도 괜찮게 바꿈                     |
| 방법          | callback/reactive로 코드 변경     | JVM이 thread를 경량화                |
| 코드 복잡도      | 높음                           | 낮음 (기존 코드 그대로)                  |
| 제약          | 없음                           | `synchronized`, `ThreadLocal` 주의 |

## 언제 뭘 써야 하나?

|                    | Non-blocking IO (WebFlux) | Virtual Thread         |
| ------------------ | ------------------------- | ---------------------- |
| **I/O-bound**      | 적합                        | 적합 (코드가 더 간단)          |
| **CPU-bound**      | 더 유리                      | 이점 없음                  |
| **I/O + CPU 혼합**   | 상황에 따라 판단                  | 상황에 따라 판단               |

### CPU-bound에서 Virtual Thread가 이점이 없는 이유

Virtual thread의 핵심 이점은 I/O blocking 시 carrier thread에서 **unmount**되는 것이다. 그런데 CPU 작업은 blocking이 발생하지 않으므로:

- Unmount가 안 됨 → carrier thread를 계속 점유
- 결국 platform thread와 다를 게 없어짐

반면 non-blocking IO는 core 수만큼만 thread를 유지하므로 OS-level context switching이 최소화된다.

### Virtual Thread는 context switching이 많이 발생하나?

Virtual thread가 수만 개여도 **OS-level context switching은 거의 없다.**

- **Platform thread** context switching → OS가 처리, 비용 큼 (register 저장, kernel mode 전환)
- **Virtual thread** context switching → JVM이 memory에서 stack을 swap, 훨씬 가벼움

실제 OS context switching은 carrier thread 수(보통 CPU core 수)만큼만 발생한다. Virtual thread 간 전환은 JVM 내부의 lightweight한 작업이다.

### 정리

- **I/O-bound 위주** → Virtual Thread (코드 간단, 성능 충분)
- **CPU-bound 위주** → Non-blocking IO / Reactive (thread 최소화로 context switching 줄임)
- **이미 reactive stack** → 굳이 바꿀 필요 없음

> <span class="co co-tip">💡 TIP 결론</span>
> 새 프로젝트에서 I/O-bound 위주라면 **Virtual Thread가 훨씬 간단한 선택**이다. CPU-bound가 많다면 **Non-blocking IO(Reactive)**를 고려하자.
