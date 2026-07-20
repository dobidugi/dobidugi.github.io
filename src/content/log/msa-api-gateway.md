---
title: "MSA API Gateway와 라우팅"
date: 2026-04-25
category: "ARCHITECTURE"
tags: ["아키텍처","MSA","API-Gateway","라우팅","BFF","Spring-Cloud-Gateway"]
description: "MSA에서 클라이언트는 서비스마다 다른 주소로 직접 요청하지 않는다. API Gateway 하나가 진입점이 되고, URL prefix를 보고 어느 서비스로 보낼지 결정한다."
minutes: 3
---
---

## 핵심 구조

MSA에서 클라이언트는 서비스마다 다른 주소로 직접 요청하지 않는다. **API Gateway 하나**가 진입점이 되고, URL prefix를 보고 어느 서비스로 보낼지 결정한다.

```
클라이언트
    ↓
API Gateway  ← 진입점 하나
    ├── /users/**     → User Service    :8080
    ├── /orders/**    → Order Service   :8081
    ├── /payments/**  → Payment Service :8082
    └── /products/**  → Product Service :8083
```

---

## API Gateway가 하는 일

| 역할 | 설명 |
|------|------|
| **라우팅** | URL prefix 기반으로 요청을 적절한 서비스로 전달 |
| **인증/인가** | JWT 검증을 게이트웨이에서 한 번에 처리 (각 서비스가 개별 처리 불필요) |
| **로드밸런싱** | 같은 서비스의 여러 인스턴스에 트래픽 분산 |
| **레이트 리밋** | 특정 클라이언트의 과도한 요청 차단 |
| **로깅 / 모니터링** | 모든 요청이 게이트웨이를 통하므로 중앙에서 수집 가능 |
| **서킷 브레이커** | 특정 서비스 장애 시 fallback 처리 |

---

## 실제 설정 예시

### Spring Cloud Gateway

```yaml
spring:
  cloud:
    gateway:
      routes:
        - id: user-service
          uri: http://user-service:8080
          predicates:
            - Path=/users/**

        - id: order-service
          uri: http://order-service:8081
          predicates:
            - Path=/orders/**

        - id: payment-service
          uri: http://payment-service:8082
          predicates:
            - Path=/payments/**
```

### prefix 외 다른 라우팅 기준들

prefix 말고도 다양한 조건으로 라우팅할 수 있다:

```yaml
predicates:
  - Path=/api/v1/**          # URL prefix
  - Method=GET,POST          # HTTP 메서드
  - Header=X-Client, mobile  # 헤더 값
  - Host=api.example.com     # 호스트명
```

---

## BFF와 함께 쓰는 구조

[BFF 패턴 (Backend for Frontend)](/log/bff-pattern/)과 Gateway를 함께 쓰면 이렇게 된다:

```
클라이언트
    ↓
API Gateway  (prefix로 BFF 라우팅)
    ├── /web/**    → Web BFF    → 내부 서비스들
    └── /mobile/** → Mobile BFF → 내부 서비스들
```

Gateway는 "어느 BFF로 보낼지"만 결정하고, BFF가 내부 서비스들을 조합해서 클라이언트에 맞는 응답을 만든다.

---

## 서비스 디스커버리와의 관계

실제 MSA에서는 서비스 주소가 고정되어 있지 않다. 인스턴스가 동적으로 늘었다 줄었다 하기 때문이다. 이 때 **서비스 디스커버리**(Eureka, Consul 등)가 현재 살아있는 서비스 인스턴스 목록을 관리하고, Gateway는 이 목록을 참조해 라우팅한다.

```
API Gateway → Eureka (서비스 목록 조회) → 살아있는 인스턴스로 라우팅
```

---

## 모놀리식과 비교

| | 모놀리식 | MSA + Gateway |
|---|---|---|
| **진입점** | 서버 하나 | Gateway 하나 |
| **라우팅** | 내부 컨트롤러 | Gateway가 서비스로 분산 |
| **인증** | 서버 내부 필터 | Gateway에서 중앙 처리 |
| **복잡도** | 낮음 | 높음 (Gateway, 디스커버리 등 추가) |

---

## 관련 개념

- [BFF 패턴 (Backend for Frontend)](/log/bff-pattern/)
- Spring Cloud Gateway
- Netflix Zuul
- Eureka (서비스 디스커버리)
- Kong, AWS API Gateway (상용 솔루션)
