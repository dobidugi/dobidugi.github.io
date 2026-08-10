---
title: "DDD 개념 정리"
date: 2026-04-30
category: "ARCHITECTURE"
tags: ["reference","DDD","도메인주도설계","아키텍처"]
description: "개인적으로 공부하며 이해한 DDD 핵심 개념 레퍼런스."
minutes: 21
---
개인적으로 공부하며 이해한 DDD 핵심 개념 레퍼런스.

## DDD란 무엇인가

에릭 에반스가 2003년 출간한 책에서 유래한 방법론. 정식 명칭은 "Domain-Driven Design"이지만, 부제인 **"소프트웨어의 복잡성을 다룬 지혜"** 가 본질에 더 가깝다.

- 구현 패턴 모음이 아니라 **비즈니스 문제를 어떻게 모델링할 것인가**에 대한 철학
- 개념적 기반: 객체지향 + 애자일
- DDD는 "DDD를 합시다"로 시작하지 않는다. 필요한 것부터 하나씩 도입하다 보면 "하고 보니 DDD"가 되는 것

### DDD 전체 구조도

```
┌─────────────────────────────────────────────────────┐
│                   전략적 설계                         │
│                                                     │
│  [바운디드 컨텍스트 A] ── 컨텍스트 맵 ── [바운디드 컨텍스트 B]  │
│        │                                    │       │
│   유비쿼터스 언어 A                     유비쿼터스 언어 B  │
│   하이 도메인 분류 (Core / Supporting / Generic)        │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│                   전술적 설계                         │
│                                                     │
│  ┌──────────────────────────────┐                   │
│  │     Aggregate (Root)         │                   │
│  │  ┌─────────┐  ┌──────────┐  │                   │
│  │  │ Entity  │  │  Value   │  │  Domain Event      │
│  │  │         │  │  Object  │  │  Domain Service    │
│  │  └─────────┘  └──────────┘  │  Repository        │
│  └──────────────────────────────┘  Factory           │
└─────────────────────────────────────────────────────┘
```

## 핵심 개념들

### 유비쿼터스 언어 (Ubiquitous Language)

개발자, 기획자, 디자이너 등 프로젝트 참여자 전체가 동일하게 사용하는 공통 용어.

**왜 중요한가:** 코드 용어와 비즈니스 용어가 다르면, 6개월 후 코드의 의미를 해석하는 부담이 생긴다.

```java
// 나쁜 예 — 코드와 비즈니스 언어가 다름
post.setStatus(2); // 2가 뭔지 아무도 모름

// 좋은 예 — 비즈니스 언어 그대로
post.publish();
post.submitForReview();
post.reject("부적절한 내용");
```

**관리 방법:**
- README 파일에 한글명 + 영문명 + 설명 + 예시를 기록
- 소스코드와 함께 형상관리 (Git) → 용어도 코드 리뷰 대상
- 명사뿐 아니라 **동사(행위)도 포함** (move, publish, reject 등)
- 용어 사전은 인수 테스트 작성 과정에서 자연스럽게 발전됨

---

### Entity vs Value Object

DDD의 가장 기본적인 빌딩 블록 구분.

**Entity:** **식별자(ID)** 로 구분되는 객체. 속성이 바뀌어도 같은 객체다.

```java
// User는 Entity — id가 같으면 같은 사람
class User {
    private UserId id;   // 식별자
    private String name; // 이름이 바뀌어도 같은 User

    @Override
    public boolean equals(Object o) {
        return this.id.equals(((User) o).id); // id로 동일성 판단
    }
}
```

**Value Object:** **값 자체** 로 구분되는 객체. 식별자 없음. 불변(Immutable).

```java
// Money는 Value Object — 1000원짜리 두 개는 동일
class Money {
    private final int amount;
    private final Currency currency;

    // 변경 시 새 객체 반환 (불변)
    public Money add(Money other) {
        return new Money(this.amount + other.amount, this.currency);
    }

    @Override
    public boolean equals(Object o) {
        // 값으로 동일성 판단 (id 없음)
        return this.amount == ((Money) o).amount
            && this.currency == ((Money) o).currency;
    }
}
```

**Value Object를 써야 하는 이유:**

```java
// 나쁨 — 원시값 사용 (단위가 뭔지, 음수도 되는지 모름)
class Order {
    private int price;
    private String currency;
}

// 좋음 — Value Object로 의미와 규칙을 담음
class Order {
    private Money price; // 음수 불가 규칙, 통화 단위 포함
}

class Money {
    private final int amount;
    private final Currency currency;

    public Money(int amount, Currency currency) {
        if (amount < 0) throw new IllegalArgumentException("금액은 0 이상이어야 합니다");
        this.amount = amount;
        this.currency = currency;
    }
}
```

**판단 기준:**

| | Entity | Value Object |
|---|---|---|
| 식별자 필요? | O | X |
| 변경 가능? | O (상태 변함) | X (불변, 새 객체 생성) |
| 동일성 기준 | ID | 값 전체 |
| 예시 | User, Post, Order | Money, Address, Email, UserId |

> 실무 팁: `UserId`, `PostId` 같은 ID 타입도 Value Object로 만들면 `Long` 타입을 잘못 넘기는 실수를 컴파일 시점에 잡을 수 있다.

```java
// Long 쓰면 실수 가능
postService.findByUser(userId, postId); // 순서 바꿔도 컴파일 통과

// Value Object 쓰면 컴파일 오류
postService.findByUser(UserId id, PostId postId); // 타입이 다르면 바로 잡힘
```

---

### Domain Service vs Application Service

로직을 어디에 둘지 결정할 때 자주 헷갈리는 부분.

**Application Service (유스케이스 조율):**
- 도메인 객체를 불러오고, 도메인에게 일을 시키고, 결과를 저장하는 **흐름 조율**
- 비즈니스 규칙 없음. 트랜잭션, 인증 등 인프라 관심사 처리

```java
// Application Service — 조율만 함
class TransferService {
    public void transfer(TransferCommand cmd) {
        User from = userRepository.findById(cmd.fromId());
        User to = userRepository.findById(cmd.toId());
        from.transfer(to, cmd.amount()); // 규칙은 도메인에게
        userRepository.save(from);
        userRepository.save(to);
    }
}
```

**Domain Service:**
- 특정 Entity나 Value Object에 자연스럽게 속하지 않는 **도메인 로직**
- 도메인 개념을 담고 있음. 인프라 의존 없음

```java
// 환율 계산은 어느 한 객체의 책임이 아님 → Domain Service
class CurrencyExchangeService {
    public Money exchange(Money source, Currency target) {
        // 환율 로직 — 도메인 규칙이지만 Money나 Currency 단독 책임이 아님
        ExchangeRate rate = exchangeRatePolicy.getRate(source.currency(), target);
        return new Money(source.amount() * rate.value(), target);
    }
}
```

**판단 기준:**

| | Entity/VO 메서드 | Domain Service | Application Service |
|---|---|---|---|
| 도메인 규칙 있음? | O | O | X |
| 특정 객체 책임? | O | X (여러 객체 관여) | X |
| 인프라 의존? | X | X | O (Repository 등) |
| 예시 | `user.transfer()` | `CurrencyExchangeService` | `TransferAppService` |

---

### 빈약한 도메인 모델 vs 풍부한 도메인 모델

**빈약한 도메인 모델 (Anemic Domain Model):** 도메인 객체가 데이터만 가지고, 로직은 서비스에 몰려 있는 구조.

```java
// 빈약한 모델 — Service가 모든 로직 처리
public class UserService {
    public void transfer(Long fromId, Long toId, int amount) {
        User from = userRepository.findById(fromId);
        from.setBalance(from.getBalance() - amount); // 서비스가 직접 조작
        User to = userRepository.findById(toId);
        to.setBalance(to.getBalance() + amount);
    }
}
```

**풍부한 도메인 모델 (Rich Domain Model):** 로직이 도메인 객체 안에 있음.

```java
// 풍부한 모델 — 도메인 객체가 스스로 책임
public class User {
    public void transfer(User to, int amount) {
        if (this.balance < amount) throw new InsufficientBalanceException();
        this.balance -= amount;
        to.balance += amount;
    }
}

public class UserService {
    public void transfer(Long fromId, Long toId, int amount) {
        User from = userRepository.findById(fromId);
        User to = userRepository.findById(toId);
        from.transfer(to, amount); // 로직은 도메인에게
    }
}
```

**점진적으로 가는 방법:**
1. 게터/세터로 시작 (도메인 지식이 없을 때 괜찮음)
2. `getX() → setX()` 패턴이 반복되면 → 메서드로 추출
3. 반복할수록 풍부한 도메인 모델이 됨

---

### 애그리거트 (Aggregate)

**일관성을 보장해야 하는 객체들의 묶음.** 외부에서는 루트(Aggregate Root)를 통해서만 접근한다.

```
  외부
   │
   ▼
┌──────────────────────────────┐
│        Post (Root)           │  ← 외부는 여기만 접근 가능
│                              │
│  ┌───────────┐  ┌─────────┐  │
│  │  Comment  │  │   Tag   │  │  ← 외부에서 직접 접근 불가
│  └───────────┘  └─────────┘  │
└──────────────────────────────┘
  애그리거트 = 트랜잭션 경계
```

```java
// Post가 Aggregate Root, Comment는 Post를 통해서만 접근
class Post {
    private List<Comment> comments;

    public void addComment(Comment comment) {
        // 댓글 추가 시 비즈니스 규칙 적용 가능 (ex. 게시글 잠금 여부 확인)
        if (this.isLocked) throw new PostLockedException();
        this.comments.add(comment);
    }
}

// Repository도 Aggregate Root 단위로만
postRepository.save(post); // Comment는 따로 save하지 않음
// commentRepository.save(comment) — 애그리거트 원칙 위반
```

**다른 애그리거트는 반드시 ID로만 참조한다:**

```java
// 나쁨 — 다른 애그리거트를 객체로 직접 참조
class Post {
    private User author;   // User 애그리거트에 강하게 결합
                           // User가 바뀌면 Post도 영향받음
}

// 좋음 — ID(Value Object)로만 참조
class Post {
    private UserId authorId; // User 내부 구조를 전혀 몰라도 됨
}
```

이 원칙이 중요한 이유:
- **트랜잭션 경계 보장** — 애그리거트 하나 = 트랜잭션 하나. 두 애그리거트를 한 트랜잭션에서 동시에 수정해야 한다면 설계를 의심해야 한다
- **결합도 감소** — User가 바뀌어도 Post 코드는 변경 없음
- **성능** — 연관 객체를 무조건 로딩하지 않아도 됨

→ 조합이 필요한 경우 애플리케이션 레이어에서 처리. '도메인 간 의존 관계' 섹션 참조

---

### 바운디드 컨텍스트 (Bounded Context)

**도메인 모델이 유효한 경계.** 같은 단어라도 컨텍스트에 따라 의미가 다를 수 있다.

```
// "상품"의 의미가 컨텍스트마다 다름
전시 컨텍스트: 상품 = { 이름, 이미지, 설명, 카테고리 }
주문 컨텍스트: 상품 = { 가격, 재고, 옵션 }
정산 컨텍스트: 상품 = { 원가, 마진, 세금 }
```

억지로 하나의 모델로 합치면 모든 컨텍스트의 복잡성이 뒤섞인다. **같은 현실 세계의 "상품"이라도 컨텍스트마다 별도의 클래스로 정의하는 것이 맞다.** 코드 중복처럼 보여도, 각 컨텍스트가 독립적으로 진화할 수 있게 해주는 의도적인 분리다.

```
// 하나로 합치면 생기는 문제
class Product {
    // 전시팀이 필요한 것
    String imageUrl;
    String description;
    // 주문팀이 필요한 것
    int stock;
    BigDecimal price;
    // 정산팀이 필요한 것
    BigDecimal costPrice;
    BigDecimal taxRate;
    // → 모든 팀의 변경이 하나의 클래스에 충돌
}

// 컨텍스트별 분리 — 각자 자신에게 필요한 것만
class catalog.Product { String name; String imageUrl; }   // 전시
class order.Product   { int stock; Money price; }         // 주문
class settlement.Product { Money cost; TaxRate tax; }     // 정산
```

**바운디드 컨텍스트를 나누는 기준:**
1. 같은 용어가 다른 의미를 가질 때
2. 같은 대상을 다르게 지칭할 때
3. 외부 시스템과의 경계

**나누는 방법:** 처음부터 모두 나누는 빅뱅 방식이 아니라 **점진적으로**. 가장 작거나, 영향력이 적거나, 가장 중요한 것부터 하나씩.

---

### 도메인 이벤트 (Domain Event)

도메인에서 의미있는 사건을 명시적으로 표현. 도메인 간 직접 의존 대신 이벤트로 통신.

```java
class Post {
    public void publish() {
        this.status = PUBLISHED;
        registerEvent(new PostPublishedEvent(this.id)); // 사건을 명시적으로 발행
    }
}

// 다른 도메인이 이벤트를 구독 — Post를 직접 알 필요 없음
class NotificationHandler {
    @EventListener
    public void on(PostPublishedEvent event) {
        notificationService.notifyFollowers(event.getPostId());
    }
}
```

---

### 하이 도메인 & 코어 도메인

큰 비즈니스 도메인을 작은 단위로 쪼갠 것이 **하이 도메인(Subdomain)**.

예) 전자상거래 → 상품 / 전시 / 주문 / 결제 / 정산

**코어 도메인 차트로 분류:**

| 종류 | 설명 | 예시 |
|---|---|---|
| 핵심 도메인 (Core) | 경쟁 우위를 만드는 영역, 내부에서 직접 개발 | 추천 알고리즘, 배달 최적화 |
| 지원 도메인 (Supporting) | 핵심을 뒷받침하는 영역 | 주문, 정산 |
| 일반 도메인 (Generic) | 범용적, 외부 서비스로 대체 가능 | 이메일, SMS |

이 분류로 **한정된 리소스(인력, 시간)를 어디에 집중할지** 결정한다.

---

### 전략적 설계 vs 전술적 설계

DDD의 두 축. 대부분 전술만 공부하고 전략을 놓친다.

**전략적 설계 (Strategic Design) — "무엇을 만들 것인가"**
- 비즈니스 도메인을 어떻게 나눌 것인가
- 팀/조직 간 관계를 어떻게 설계할 것인가
- 코드보다 **대화, 워크숍, 다이어그램**이 도구

> 바운디드 컨텍스트, 컨텍스트 맵, 하이 도메인, 유비쿼터스 언어가 여기 속함

**전술적 설계 (Tactical Design) — "어떻게 만들 것인가"**
- 도메인 모델을 코드로 어떻게 표현할 것인가
- 구체적인 패턴들

> Entity, Value Object, Aggregate, Domain Service, Domain Event, Repository, Factory가 여기 속함

**흔한 실수:** 전술적 패턴(애그리거트, 도메인 이벤트 등)만 적용하고 전략(바운디드 컨텍스트, 도메인 분석)은 건너뜀. 그러면 코드 모양만 DDD고 실제로는 아님.

---

### Context Mapping — 바운디드 컨텍스트 간 관계

두 바운디드 컨텍스트가 어떻게 협력하는지 표현하는 패턴들.

**Shared Kernel (공유 커널)**
두 컨텍스트가 일부 모델을 공유. 변경 시 양쪽 모두 동의 필요.
```
[주문 BC] ── 공유 ──  [결제 BC]
         Money, OrderId
```
- 장점: 중복 없음
- 단점: 변경 시 두 팀 조율 필요. 결합도 높음

**Customer-Supplier (고객-공급자)**
한쪽(Supplier)이 API를 제공하고, 다른 쪽(Customer)이 사용.
```
[User BC] ──제공──→ [Post BC]
  (Supplier)          (Customer)
```
- Supplier가 Customer 요구를 반영해줄 의지가 있을 때 작동
- 현실에서 팀 간 권력 관계에 따라 무너지기 쉬움

**Conformist (순응자)**
Customer가 Supplier 모델을 그냥 그대로 따름. 협상력 없을 때.
```
[외부 결제 API] ──→ [우리 서비스]
                    (외부 모델 그대로 사용)
```
- 단점: 외부 모델 변경에 종속됨

**ACL (Anti-Corruption Layer, 부패방지계층)**
외부 모델을 내부 언어로 번역. 외부 변경으로부터 내부를 보호.
```java
class KakaopayAdapter { // ACL 역할
    public PaymentResult pay(Order order) {
        KakaopayRequest req = translate(order); // 내부 → 외부 번역
        KakaopayResponse res = kakaopayApi.pay(req);
        return translate(res); // 외부 → 내부 번역
    }
}
```
- 외부 서비스(카카오페이, AWS 등) 연동 시 가장 현실적인 패턴

**Open Host Service (공개 호스트 서비스)**
내 BC를 여러 Consumer가 사용할 때, 안정적인 공개 API/프로토콜을 정의.
```
[User BC]
   ├── REST API (공개 인터페이스)
   ├── [Post BC] 가 사용
   └── [Comment BC] 가 사용
```

**실무에서 가장 많이 쓰이는 조합:**
- 내부 BC 간 → Customer-Supplier 또는 Shared Kernel
- 외부 서비스 연동 → ACL
- 우리 서비스를 외부에 공개 → Open Host Service

## 도메인 간 의존 관계

### 의존을 없애는 게 목표가 아니다

의존의 **방향과 형태를 제어하는 것**이 목표.

```java
// 나쁨 — 도메인 객체 직접 참조 (강한 결합)
class Post {
    private User author; // User 전체에 의존
}

// 좋음 — ID(값 객체)로만 참조 (느슨한 결합)
class Post {
    private UserId authorId; // User 내부 모델 몰라도 됨
}
```

조합이 필요한 시점은 **애플리케이션 레이어**에서 처리:

```java
// Application Layer
public PostDetailResponse getPost(PostId postId) {
    Post post = postRepository.findById(postId);
    User author = userRepository.findById(post.getAuthorId());
    return new PostDetailResponse(post, author);
}
```

### 외부 의존 차단 패턴 3가지

**1. DTO** — 외부와의 데이터 교환 전용 객체로 도메인 모델 노출 차단

**2. DIP (의존성 역전 원칙)** — 도메인이 구현체가 아닌 인터페이스에만 의존

```java
// 도메인 안에 인터페이스 (Port)
interface UserRepository {
    User findById(UserId id);
}

// infrastructure에 구현체 (Adapter)
class JpaUserRepository implements UserRepository { ... }
```

**3. ACL (Anti-Corruption Layer, 부패방지계층)** — 외부 시스템의 용어/모델이 내부로 침투하지 못하게 번역

```java
// 외부 API 호출 시 우리 언어로 번역하는 메서드 하나만 있어도 ACL
class PaymentAdapter {
    public PaymentResult pay(Order order) {
        ExternalPayRequest req = toExternalRequest(order); // 번역
        ExternalPayResponse res = externalPayApi.pay(req);
        return toPaymentResult(res); // 번역
    }
}
```

## 도메인 간 검색 문제 (실전 트레이드오프)

### 문제 상황

`Post`는 `authorId`만 갖고 있는데, `userName`으로 게시글을 검색해야 할 때.

### 해법 비교

| 방법               | 방식                           | 장점        | 단점                |
| ---------------- | ---------------------------- | --------- | ----------------- |
| Application Join | UserRepo에서 id 찾고 PostRepo 검색 | 단순        | 쿼리 2번, DB 분리 시 불가 |
| 비정규화             | Post에 authorName 저장          | 쿼리 단순, 빠름 | 이름 변경 시 동기화 필요    |
| CQRS             | 읽기 전용 모델(뷰) 별도 운영            | 읽기/쓰기 최적화 | 구조 복잡             |
| DB Join 쿼리       | 같은 DB면 그냥 Join               | 제일 현실적    | DB 분리 시 불가        |

**현실적 조언:** DB가 분리되지 않은 모놀리식이면 그냥 Join 쿼리. DB가 분리된 MSA라면 비정규화 + 이벤트 동기화.

## 아키텍처와 DDD의 관계

### 내 현재 구조 (도메인별 레이어드)

```
user/
  controller/
  service/
  infrastructure/
post/
  controller/
  service/
  infrastructure/
```

→ **Package by Feature + 3-tier Layered Architecture**. DDD도 헥사고날도 아니지만 나쁜 구조가 아님. 좋은 출발점.

### 헥사고날 아키텍처와의 차이

핵심은 **의존 방향**. 도메인이 외부(DB, HTTP)를 모르고, 외부가 도메인에 맞춰야 함.

```
user/
  domain/
    User.java                  # 외부 의존 없는 순수 도메인
    UserRepository.java        # 인터페이스 (Port) — 도메인 안에 있음
  application/
    UserService.java           # 유스케이스
  adapter/
    in/
      UserController.java      # HTTP 어댑터 (Driving)
    out/
      UserRepositoryImpl.java  # DB 어댑터 (Driven)
```

| 비교 | 레이어드 | 헥사고날 |
|---|---|---|
| UserRepository 위치 | infrastructure/ | domain/ (인터페이스) |
| Service가 JPA 알아? | 보통 앎 | 모름 (Port만 앎) |
| 도메인 순수성 | 보장 안 됨 | 보장됨 |

### 점진적으로 발전시키는 방법

1. 지금 구조 유지
2. 로직을 Service → 도메인 객체로 옮기기 → DDD에 가까워짐
3. Repository를 인터페이스(domain) + 구현체(infrastructure)로 분리 → 헥사고날에 가까워짐
4. 처음부터 클린/헥사고날 아키텍처 패키지 구조 잡는 것보다, 리팩토링하다 보면 자연스럽게 그 형태가 됨

## 자주 하는 오해

| 오해 | 실제 |
|---|---|
| DDD = 헥사고날/클린 아키텍처 | 별개 개념. 함께 쓰이지만 동일하지 않음 |
| DDD를 하려면 MSA가 필요하다 | 모놀리식에서도 DDD 가능. 오히려 모놀리식 먼저 권장 |
| 완벽한 설계 후 DDD 도입 | 완벽한 설계는 없음. 점진적으로 도입 |
| 도메인에 행위를 넣으면 DDD | 객체지향임. DDD는 거기에 더해 비즈니스 모델링이 핵심 |
| 도메인 간 의존을 없애야 한다 | 의존 자체가 아니라 방향과 형태를 제어하는 것이 목표 |

## 참고 자료

- 우아콘2024 — DDD 그거 그렇게 하는 거 아닌데 (박재성) youtube-summaries/DDD 그거 그렇게 하는 거 아닌데
- 소프트웨어 장인 (책)
- 팀 토폴로지 (책)
- 소프트웨어 아키텍처 101 (책)
