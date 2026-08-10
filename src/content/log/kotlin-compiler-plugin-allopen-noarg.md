---
title: "코틀린 컴파일러 플러그인 (all-open, no-arg)"
date: 2026-08-06
category: "KOTLIN"
tags: ["reference","Kotlin","Spring","JPA","컴파일러플러그인"]
description: "코틀린 클래스는 기본이 final이고 기본 생성자도 없다. 그런데 Spring은 상속으로 프록시를 만들고 JPA는 빈 객체를 만들어 리플렉션으로 채운다. all-open과 no-arg 플러그인이 이…"
minutes: 24
---
> <span class="co co-abstract">📋 요약 한 줄 요약</span>
> 코틀린 클래스는 기본이 `final`이고 기본 생성자도 없다. 그런데 Spring은 상속으로 프록시를 만들고 JPA는 빈 객체를 만들어 리플렉션으로 채운다. all-open과 no-arg 플러그인이 **이미 붙이고 있는 애노테이션을 보고** 컴파일 타임에 이 문제를 풀어준다.

---

## "코틀린 플러그인"은 세 가지를 가리킨다

먼저 용어부터 구분해야 헷갈리지 않는다.

| 종류                   | 하는 일                   | 예시                                       |
| -------------------- | ---------------------- | ---------------------------------------- |
| **Gradle 플러그인**      | 빌드 스크립트에 태스크/설정 추가     | `kotlin("jvm")`                          |
| **Kotlin 컴파일러 플러그인** | 컴파일 과정에 끼어들어 코드 자체를 변형 | all-open, no-arg, serialization, Compose |
| **IntelliJ 플러그인**    | IDE 기능 (문법 강조, 리팩터링)   | Kotlin IDE Plugin                        |

이 중에 자바만 하다 온 사람에게 낯선 건 가운데 있는 **컴파일러 플러그인**이다. 자바에는 이에 대응되는 게 없다.

헷갈리는 이유가 하나 더 있다. 컴파일러 플러그인도 결국 Gradle 플러그인으로 감싸서 배포하기 때문에, 빌드 스크립트에서는 둘이 똑같이 생겼다는 것이다.

```kotlin
plugins {
    kotlin("jvm")             // 진짜 Gradle 플러그인
    kotlin("plugin.spring")   // 컴파일러 플러그인인데 생김새는 똑같다
}
```

앞으로 이 노트에서 그냥 "플러그인"이라고 하면 전부 컴파일러 플러그인 얘기다.

---

## 왜 컴파일러 플러그인이 필요한가

Java의 애노테이션 프로세서(APT)는 **새 파일을 생성**할 수만 있고 기존 클래스를 **수정할 수 없다**. Lombok이 "해킹"이라 불리는 이유 — 비공식 내부 API로 AST를 억지로 건드린다.

코틀린은 이걸 아예 **공식 확장 지점**으로 열어놨다. 컴파일러가 코드를 처리하는 중간에 정식으로 끼어들어서 클래스를 `open`으로 바꾸거나, 생성자를 만들어 넣거나, 함수 몸통을 통째로 찍어낼 수 있다.

컴파일은 대략 이렇게 흘러간다.

```
소스 코드 → 프론트엔드(FIR) → 백엔드(IR) → 바이트코드
```

- **프론트엔드(FIR)** 는 선언을 해석하는 단계다. all-open은 여기서 "이 클래스 `final` 떼라"고 끼어든다.
- **백엔드(IR)** 는 실제 코드를 만들어내는 단계다. no-arg는 여기서 빈 생성자를 만들어 넣고, serialization은 직렬화 함수를 찍어낸다.

여기서 중요한 건 **컴파일할 때 다 끝난다**는 것이다. 실행 중에 리플렉션을 돌리거나 바이트코드를 다시 손대는 비용이 없다. 게다가 공식 확장 지점이라 JDK 버전이 올라가도 안 깨진다 — Lombok과 갈리는 지점이다.

---

## all-open (`kotlin-spring`)

### 문제

코틀린 클래스는 기본이 `final`이다. 그런데 Spring은 `@Transactional`, `@Cacheable`, `@Configuration`에 **CGLIB 프록시(상속 기반)** 를 쓴다. final 클래스는 상속이 안 되니 프록시를 만들지 못하고 실패한다.

```
@Configuration class ... cannot be subclassed as it is final
```

### 해결

특정 애노테이션이 달린 클래스를 컴파일 시점에 자동으로 `open`으로 만든다. 클래스뿐 아니라 **non-private 멤버까지** 함께 열린다.

```kotlin
// 작성한 코드
@Service
class OrderService {
    fun place() {}
}

// 컴파일러가 보는 것 (개념적으로)
@Service
open class OrderService {
    open fun place() {}
}
```

소스 파일은 그대로고, 바이트코드에서만 `final`이 빠진다.

### 메타 애노테이션을 따라간다

`kotlin-spring`이 실제로 등록하는 트리거는 딱 다섯 개뿐이다.

```
@Component, @Async, @Transactional, @Cacheable, @SpringBootTest
```

그런데 이 목록에 없는 `@Service`, `@Repository`, `@RestController`, `@Configuration`을 붙여도 클래스가 잘 열린다. 왜일까?

**메타 애노테이션** 때문이다. 애노테이션 자체에 붙어 있는 애노테이션을 말한다. `@Service`의 실제 정의를 보면 이렇게 생겼다.

```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Component                    // ← @Service 위에 @Component가 붙어 있다
public @interface Service {
    ...
}
```

all-open은 클래스에 달린 애노테이션만 보고 마는 게 아니라, **그 애노테이션에 또 뭐가 붙어 있는지 타고 올라간다.**

```
@Service 가 붙은 클래스 발견
   ↓ @Service 정의를 열어봄
@Component 발견 → 등록된 트리거다! → 이 클래스 open으로 변경
```

한 단계만 보는 것도 아니다. `@RestController`는 두 단계를 거친다.

```
@RestController → @Controller → @Component  ✅
```

덕분에 트리거 다섯 개만 등록해두면 Spring의 스테레오타입 애노테이션 전부가 자동으로 커버된다. 직접 만든 애노테이션도 마찬가지라, 아래처럼 `@Component`를 메타 애노테이션으로 달아두면 all-open 설정을 건드릴 필요가 없다.

```kotlin
@Component
annotation class DomainService

@DomainService
class OrderPolicy { ... }   // 자동으로 open
```

> <span class="co co-warning">⚠️ 주의 no-arg는 다르다</span>
> 이건 all-open 얘기다. `kotlin-jpa`가 쓰는 no-arg는 `@Entity`, `@Embeddable`, `@MappedSuperclass`를 **직접 달았을 때만** 동작한다고 보는 게 안전하다. 어차피 JPA 애노테이션은 메타로 감싸 쓸 일이 거의 없으니 실무에서 문제 되진 않는다.

---

## no-arg (`kotlin-jpa`)

### 문제

JPA 스펙은 엔티티에 파라미터 없는 기본 생성자를 요구한다. 코틀린에서 `class Order(val id: Long, val amount: Int)`는 기본 생성자가 없다.

### 해결

`@Entity`, `@Embeddable`, `@MappedSuperclass`가 붙은 클래스에 **synthetic 기본 생성자**를 바이트코드 레벨로 추가한다.

### 하이버네이트가 실제로 하는 일

```
1. SELECT 실행 → ResultSet 획득
2. Order.class.getDeclaredConstructor().newInstance()   ← no-arg 생성자 필요
3. 영속성 컨텍스트에 빈 인스턴스 등록 (아직 값 없음)
4. 리플렉션으로 필드에 컬럼 값 주입 (hydration)
5. 완성된 객체 반환
```

핵심은 **2번과 4번이 나뉘어 있다**는 점이다. "빈 껍데기부터 만들어 놓고 값은 나중에 채운다" — 이게 진짜 목적이고, 리플렉션은 그걸 하는 방법일 뿐이다.

### 왜 주 생성자를 쓰지 않나

| 이유 | 설명 |
|---|---|
| **순환 참조** | `Order` ↔ `Member`가 서로 참조하면 생성자 방식은 무한 루프. 빈 껍데기를 먼저 컨텍스트에 등록해야 순환이 끊긴다 |
| **지연 로딩 프록시** | `LAZY` 프록시는 **값이 없는 상태**로 존재해야 한다. 실제 접근 시점에야 SELECT를 날리므로 생성자 주입과 맞지 않는다 |
| **파라미터 매핑 불가** | 컴파일된 바이트코드에는 생성자 파라미터 이름이 기본적으로 남지 않는다(`-parameters` 없이는). 컬럼을 몇 번째 인자에 넣을지 알 방법이 없다 |

### synthetic이라는 것의 의미

```kotlin
Order()                                          // ❌ 컴파일 에러
Order::class.java.getDeclaredConstructor()       //✅ 리플렉션은 접근 가능
       .apply { isAccessible = true }
       .newInstance()
```

컴파일러(코틀린/자바 모두)는 이 생성자를 **없는 것처럼** 취급하고, 리플렉션에는 보인다. "프레임워크는 쓸 수 있게, 개발자는 실수로 못 쓰게" — 딱 필요한 만큼만 뚫어주는 설계.

---

## 두 플러그인 대조

| | all-open | no-arg |
|---|---|---|
| **해결하는 코틀린 제약** | 클래스가 `final` | 기본 생성자 없음 |
| **누가 필요로 하나** | 상속 기반 프록시 (CGLIB, 하이버네이트 LAZY) | 리플렉션 인스턴스화 |
| **동작** | `final` 제거 | synthetic 생성자 추가 |
| **한 문장** | *상속할 수 있게* | *만들 수 있게* |

**엔티티는 둘 다 필요하다.** `kotlin-jpa`가 no-arg만 해주기 때문에 all-open은 직접 등록해야 한다. (아래 주의점 5번)

---

## 실제 build.gradle.kts

```kotlin
plugins {
    kotlin("jvm") version "2.1.0"
    kotlin("plugin.spring") version "2.1.0"   // all-open 프리셋
    kotlin("plugin.jpa") version "2.1.0"      // no-arg 프리셋
    id("org.springframework.boot") version "3.4.1"
}

// 엔티티 지연 로딩을 위해 open 대상 추가 (필수)
allOpen {
    annotation("jakarta.persistence.Entity")
    annotation("jakarta.persistence.MappedSuperclass")
    annotation("jakarta.persistence.Embeddable")
}

kotlin {
    compilerOptions {
        // Java 라이브러리의 @Nullable/@NonNull을 코틀린 타입 시스템에 엄격 반영
        freeCompilerArgs.addAll("-Xjsr305=strict")
    }
    jvmToolchain(21)
}
```

`kotlin("plugin.spring")`은 `id("org.jetbrains.kotlin.plugin.spring")`의 축약형.

### `allOpen {}` 블록 읽는 법

```kotlin
allOpen {
    annotation("jakarta.persistence.Entity")
}
```

> `jakarta.persistence.Entity`가 **달린 클래스**를 발견하면 `open`으로 바꿔라

애노테이션이 열리는 게 아니라 **애노테이션이 붙은 클래스**가 열린다. 애노테이션은 **조건**이고 `open`은 **결과**.

### 세 줄을 다 쓰는 이유

| 애노테이션               | 왜 필요한가                                              |
| ------------------- | --------------------------------------------------- |
| `@Entity`           | 지연 로딩 프록시가 엔티티를 상속함                                 |
| `@MappedSuperclass` | `BaseTimeEntity` 같은 공통 부모 — final이면 엔티티가 상속 자체를 못 함 |
| `@Embeddable`       | `Address`, `Money` 같은 값 객체도 하이버네이트가 프록시/인스턴스화       |

`@MappedSuperclass`가 빠지면 아예 컴파일이 안 된다:

```kotlin
@MappedSuperclass
class BaseEntity { ... }   // final

@Entity
class Order : BaseEntity() // ❌ This type is final, so it cannot be inherited from
```

### Spring 없이 순수 JPA라면

`allOpen {}` 블록은 all-open 플러그인이 제공한다. `kotlin("plugin.spring")`이 내부적으로 all-open을 적용하므로 별도 선언 없이 쓸 수 있지만, Spring 플러그인이 없다면 명시해야 한다.

```kotlin
plugins {
    kotlin("jvm") version "2.1.0"
    kotlin("plugin.allopen") version "2.1.0"  // allOpen {} 블록용
    kotlin("plugin.jpa") version "2.1.0"      // no-arg 생성자용
}
```

> <span class="co co-note">📝 NOTE 프리셋을 덮어쓰지 않고 더한다</span>
> `allOpen {}` 블록을 써도 `kotlin-spring`이 등록한 `@Component`·`@Transactional` 등은 사라지지 않는다. 두 목록이 합쳐진다.

---

## 주의점

### 1. 애노테이션이 있어야 동작한다

플러그인은 "애노테이션 안 붙여도 되게" 해주는 게 아니다. **이미 붙이고 있는 애노테이션을 보고** 코틀린 특유의 제약을 풀어주는 도구다. 애노테이션 없는 평범한 코틀린 클래스는 플러그인을 넣든 말든 여전히 `final`이고 기본 생성자도 없다.

```kotlin
class PaymentGateway {          // final 그대로
    fun charge() {}
}
// 테스트에서 mock 시도 → Mockito cannot mock/spy because : final class
```

`open`을 직접 붙이거나, `mockito-inline`을 쓰거나, MockK로 가면 된다. MockK는 final 클래스를 알아서 처리해줘서 코틀린에서 많이 쓴다.

### 2. 커스텀 애노테이션도 등록할 수 있다

직접 만든 애노테이션을 트리거로 쓰고 싶다면 FQN을 등록하면 된다. no-arg도 같은 방식이다.

```kotlin
allOpen {
    annotation("com.mycompany.annotation.DomainService")
}

noArg {
    annotation("com.mycompany.annotation.Poko")
}
```

```kotlin
annotation class DomainService

@DomainService
class OrderPolicy { ... }       // open으로 컴파일된다
```

all-open이라면 빌드 스크립트를 안 건드리는 방법도 있다. 이미 트리거로 등록된 애노테이션을 메타 애노테이션으로 달아주면 된다.

```kotlin
@Component                      // 이미 kotlin-spring 트리거 목록에 있음
annotation class DomainService  // → allOpen 설정 없이도 열린다
```

다만 `@Component`를 달면 컴포넌트 스캔에 걸려 빈으로 등록된다. 그걸 원하지 않으면 위쪽 방식으로 등록하는 게 맞다.

프리셋과 개별 등록을 섞어 쓸 수도 있다. 둘은 합쳐지므로 하나가 다른 하나를 무효화하지 않는다.

```kotlin
allOpen {
    preset("spring")                              // = kotlin-spring
    annotation("com.mycompany.DomainService")     // 여기에 추가로 얹기
}
```

실무에서 쓸 만한 곳은 **테스트용 개방**이다. 프로덕션 코드에 `open`을 흩뿌리는 대신 애노테이션 하나만 붙이면, "이건 테스트 때문에 연 것"이라는 의도가 코드에 남는다.

```kotlin
annotation class OpenForTesting
```

### 3. 멀티 모듈이면 모듈마다 설정해야 한다

`allOpen {}`은 Gradle 프로젝트 단위 설정이라, 그 모듈의 컴파일 태스크에만 옵션이 전달된다. 애노테이션을 어디에 정의했는지와는 무관하게, **그 애노테이션을 사용하는 모듈마다** 설정이 있어야 한다.

```
domain/     ← @DomainService 정의 + allOpen 설정
api/        ← @DomainService 를 쓰는데 allOpen 설정이 없음
            → api 모듈의 클래스는 안 열린다
```

한 번에 처리하려면 루트에서 `subprojects {}`로 적용하거나, `buildSrc`의 컨벤션 플러그인에 넣는 편이 깔끔하다.

### 4. 패키지명이 틀리면 조용히 무시된다

Spring Boot 2.x는 `javax.persistence.Entity`, 3.x는 `jakarta.persistence.Entity`다. 문자열이 안 맞아도 **에러 없이 무시**되기 때문에, "설정은 했는데 왜 안 되지" 상황이 자주 여기서 나온다. 커스텀 애노테이션도 마찬가지라 클래스명만 쓰면 안 되고 패키지까지 정확히 적어야 한다.

### 5. `@Entity`는 `kotlin-spring`이 열어주지 않는다

`kotlin-jpa`는 no-arg 생성자만 만들어주고 `open`까지는 해주지 않는다. 그렇다고 `kotlin-spring`의 트리거 목록에 `@Entity`가 있는 것도 아니다. 결국 엔티티는 `final`로 남는다.

이 상태에서 하이버네이트가 지연 로딩 프록시(`getReference()`, `@ManyToOne(fetch = LAZY)`)를 만들려고 엔티티를 상속하는 순간 실패한다. 앞서 나온 `allOpen {}` 블록을 반드시 같이 넣어야 하는 이유다.

### 6. 프로퍼티 초기화식이 실행되지 않는다

no-arg 플러그인에는 `invokeInitializers`라는 옵션이 있는데, 기본값이 `false`다.

이름을 뜯어보면 뜻이 그대로 나온다. **invoke는 "호출한다"**, **initializer는 프로퍼티 선언 뒤에 붙는 `= ...` 부분**, 즉 초기화식이다. 합치면 "초기화식을 호출할까?"인데 기본이 `false`니까 **안 부른다**는 뜻이다.

```kotlin
val createdAt: LocalDateTime = LocalDateTime.now()
//                             ^^^^^^^^^^^^^^^^^^^ 이게 initializer
```

평소 `Order(...)`로 객체를 만들 땐 당연히 실행되는 코드지만, 플러그인이 만든 빈 생성자로 들어오면 이 부분이 통째로 건너뛰어진다.

```kotlin
@Entity
class Order {
    @OneToMany
    val items: MutableList<Item> = mutableListOf()       // 하이버네이트가 채워준다

    @Column(nullable = false)
    val createdAt: LocalDateTime = LocalDateTime.now()   // 컬럼 값으로 hydration 된다

    @Transient
    val tempFlags: MutableMap<String, Any> = mutableMapOf()   // ← 위험. 아무도 안 채워준다
}
```

세 필드 모두 no-arg 생성자를 거치는 순간 일단 **null**이 된다. 차이는 그다음이다. `items`는 하이버네이트가 `PersistentBag`으로 교체해주고 `createdAt`은 컬럼 값으로 채워지지만, **`@Transient`처럼 매핑이 없는 필드는 채워줄 주체가 없어서 null인 채로 남는다.** 코틀린 타입은 non-null로 선언돼 있는데 실제로는 null — 접근 순간 NPE.

즉 위험한 건 "초기화식이 있는 필드" 전부가 아니라 **매핑되지 않은 파생 값·캐시 필드**다.

```kotlin
noArg {
    invokeInitializers = true
}
```

다만 JPA에서는 보통 끄는 쪽이 맞다. 어차피 hydration 단계에서 덮어쓸 값이라 초기화식을 실행할 이유가 없고, 로딩 시 불필요한 객체 생성만 늘어난다.

### 7. 엔티티에 `data class`는 피한다

플러그인과 직접 관련은 없지만, 코틀린으로 JPA를 쓰기 시작하면 반드시 같이 밟게 되는 문제다.

`data class`를 쓰면 컴파일러가 `equals`, `hashCode`, `toString`, `copy`를 자동으로 만들어준다. 편하니까 엔티티에도 그냥 붙이고 싶어지는데, 이 세 개가 전부 JPA와 충돌한다.

#### equals / hashCode — 판단 기준이 다르다

`data class`가 만드는 `equals`는 **주 생성자에 선언한 프로퍼티를 전부** 비교한다. 반면 JPA에서 "같은 엔티티냐"의 기준은 오직 **식별자(id)** 하나다. 애초에 보는 곳이 다르다.

이 차이가 터지는 대표적인 상황:

```kotlin
@Entity
data class Order(@Id @GeneratedValue val id: Long = 0, var amount: Int)

val order = Order(amount = 1000)   // 아직 id = 0
val set = hashSetOf(order)         // id=0 기준으로 해시 계산해서 담김

orderRepository.save(order)        // 저장되면서 id = 42로 바뀜

set.contains(order)                // false ❗ 분명 같은 객체인데 못 찾는다
```

`hashCode`가 `id`를 포함해 계산되는데 저장 시점에 `id`가 바뀌어버리니, 이미 담아둔 버킷에서 영영 못 찾는다.

지연 로딩 프록시도 마찬가지다. 프록시는 아직 값을 안 채운 빈 껍데기라, 실제 엔티티와 비교하면 모든 필드가 어긋나서 `equals`가 `false`를 뱉는다.

#### toString — 로그 한 줄에 쿼리가 나간다

`data class`의 `toString`은 모든 프로퍼티를 찍는다. 연관관계 필드도 예외가 아니다.

```kotlin
log.debug("주문 조회: $order")   // 그냥 로그 한 줄 찍었을 뿐인데
```

`order.items`를 문자열로 만들려고 **LAZY 로딩이 발동해서 SELECT가 나간다.** 로그 레벨을 debug로 켰더니 갑자기 쿼리 수가 늘어나는 상황이 여기서 나온다.

양방향 연관관계라면 더 심각하다.

```
Order.toString() → items 출력 → Item.toString() → order 출력 → Order.toString() → ...
                                                              StackOverflowError
```

#### 그래서 이렇게 쓴다

일반 `class`로 선언하고, `equals`/`hashCode`는 **id만 보도록** 직접 구현한다.

```kotlin
@Entity
class Order(
    @Id @GeneratedValue
    val id: Long = 0,
    var amount: Int
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is Order) return false          // 프록시도 Order의 자식이라 통과
        return id != 0L && id == other.id          // 미영속(id=0)이면 동일성 비교만
    }

    // id가 나중에 바뀌어도 해시가 흔들리지 않도록 상수를 쓴다.
    // javaClass 를 쓰면 프록시에서 다른 값이 나올 여지가 있다
    override fun hashCode(): Int = 31

    // 연관관계 필드는 뺀다
    override fun toString(): String = "Order(id=$id, amount=$amount)"
}
```

`hashCode`가 상수인 게 이상해 보이지만, 규약이 요구하는 건 "같은 객체는 같은 해시"뿐이고 "다른 객체는 다른 해시"는 요구하지 않는다. 한 `HashSet`에 같은 타입 엔티티를 수천 개 담으면 성능이 떨어지지만, 실무에서 그럴 일은 거의 없고 **id가 저장 시점에 바뀌어도 해시가 안 흔들린다**는 이득이 훨씬 크다.

`copy()`도 함께 사라지는데, 이건 오히려 잘된 일이다. 엔티티를 `copy()`하면 **같은 id를 가진 detached 객체**가 하나 더 생겨서 영속성 컨텍스트가 꼬인다.

> <span class="co co-tip">💡 TIP</span>
> `data class`는 DTO에서 쓰라고 있는 기능이다. 엔티티는 "DB 행과 1:1로 대응되는 식별자 있는 객체"고, DTO는 "값 덩어리"다. 성격이 다르니 도구도 다르게 쓴다.

### 8. `val` vs `var`

리플렉션 주입 방식 때문에 엔티티 프로퍼티는 **`var`가 안전**하다. `val`도 필드 접근으로 동작하는 경우가 있지만, 하이버네이트 버전이나 접근 전략(`@Access`)에 따라 깨질 여지가 있어 모험할 이유가 없다.

```kotlin
@Entity
class Order(
    @Id @GeneratedValue
    val id: Long = 0,           // 식별자는 val 유지 가능

    @Column(nullable = false)
    var status: OrderStatus,    // 변경되는 상태는 var

    var amount: Int
) {
    fun cancel() { status = OrderStatus.CANCELED }  // 변경은 메서드로 캡슐화
}
```

`var`로 열어두되 **수정 경로를 도메인 메서드로 제한**하는 게 일반적인 절충안.

### 9. 기본값이 전부 있으면 no-arg 플러그인 없이도 된다

코틀린은 **주 생성자 파라미터에 기본값이 하나도 빠짐없이 있으면** 인자 없는 생성자를 하나 더 만들어 준다. 플러그인과 무관하게 컴파일러가 원래 하는 일이다.

```kotlin
@Entity
class Order(
    var amount: Int = 0,
    var status: OrderStatus = OrderStatus.NEW,
)
// → 바이트코드에 public Order() 가 존재한다. kotlin-jpa 없이도 JPA가 동작
```

"플러그인 안 넣었는데 왜 되지" 와 "기본값 하나 지웠더니 갑자기 인스턴스화가 깨지네" 가 둘 다 여기서 나온다. 파라미터 하나만 기본값을 잃어도 이 생성자는 조용히 사라진다.

그렇다고 이쪽에 기대는 건 권하지 않는다. **두 생성자는 동작이 다르기 때문이다.**

| | 코틀린이 기본값으로 만든 것 | no-arg 플러그인이 만든 것 |
|---|---|---|
| 코드에서 `Order()` 호출 | 가능 | 불가 (컴파일 에러) |
| 초기화식 실행 | **실행된다** | 안 된다 (6번) |

즉 6번에서 다룬 `invokeInitializers` 문제는 기본값으로 생성자가 생긴 엔티티에는 **애초에 없다.** 두 경로가 섞여 있으면 "어떤 엔티티는 초기화식이 돌고 어떤 건 안 도는" 상태가 되므로, 플러그인 쪽으로 통일해두는 편이 예측 가능하다. 기본값은 엔티티 인스턴스화를 위해서가 아니라 **필요할 때만** 붙인다.

---

## 적용 확인 방법

바이트코드를 직접 보는 게 확실하다.

```bash
javap -p build/classes/kotlin/main/com/example/Order.class
```

- **all-open 적용됨** → 클래스 선언에 `final`이 **없음** (`public class com.example.Order`)
- **no-arg 적용됨** → `public com.example.Order();` 가 목록에 **있음**

---

## 그 외 알아둘 만한 플러그인

| 플러그인                             | 용도                                               |
| -------------------------------- | ------------------------------------------------ |
| `kotlin("plugin.serialization")` | `@Serializable` 클래스의 직렬화 코드를 컴파일 타임 생성 (리플렉션 없음) |
| `kotlin("plugin.lombok")`        | Java/Kotlin 혼용 모듈에서 코틀린이 Lombok 생성 멤버를 인식하게 함    |
| `kotlin("plugin.power-assert")`  | 테스트 assertion 실패 시 중간 값까지 보여주는 상세 메시지            |
| `kotlin("kapt")`                 | Java APT를 코틀린에서 실행. **유지보수 모드** — 신규는 KSP 권장     |
| KSP                              | 코틀린 네이티브 심볼 프로세싱                                 |

**kapt vs KSP:** kapt는 코틀린 코드를 Java 스텁으로 변환한 뒤 APT를 돌려서 느리다. KSP는 코틀린 컴파일러 API를 직접 사용해 2~4배 빠르다. QueryDSL은 전통적으로 kapt를 썼지만 요즘은 KSP 지원 포크나 [Kotlin JDSL](https://github.com/line/kotlin-jdsl) 같은 대안으로 넘어가는 추세.

### no-arg가 JPA 말고 쓰이는 곳

- **Jackson** — 단, 코틀린에서는 `jackson-module-kotlin`이 주 생성자를 직접 읽으므로 no-arg 불필요
- **JAXB / 일부 XML 바인딩**
- **Kryo 등 일부 직렬화 라이브러리**

실무에서 no-arg를 켜는 이유는 사실상 JPA 하나.

---

## 정리

결국 이 두 플러그인은 **번역기**다.

코틀린은 "상속은 위험하니 기본으로 막아두고, 객체는 생성자로 완전하게 만들자"는 입장이다. 반대로 Spring과 하이버네이트는 "상속해서 프록시를 만들고, 일단 빈 객체를 찍어낸 다음 리플렉션으로 채우자"는 입장이다. 각자 나름의 이유가 있는 설계인데, 그냥 붙여놓으면 서로 말이 안 통한다. all-open과 no-arg가 그 사이에서 통역을 해주는 셈이다.

여기서 오해하기 쉬운 게 하나 있다. 플러그인만 넣으면 알아서 다 처리해줄 것 같지만, 실제로는 **`@Entity`나 `@Service` 같은 애노테이션을 봤을 때만** 움직인다. 애노테이션이 없는 평범한 코틀린 클래스는 플러그인을 넣든 말든 여전히 `final`이고 기본 생성자도 없다.

그리고 Spring Boot에 JPA를 얹는다면 `plugin.spring`과 `plugin.jpa`를 넣는 것만으로는 부족하다. **`@Entity`를 `open`으로 만들어주는 곳이 어디에도 없기 때문이다.** `allOpen {}` 블록에 직접 등록해야 한다. 이거 하나 빠뜨려서 지연 로딩이 터지는 게 이 노트에서 제일 강조하고 싶은 부분이다.

### 새 프로젝트 시작할 때 확인할 것

- [ ] `plugin.spring` / `plugin.jpa` 넣었나
- [ ] `allOpen {}`에 `@Entity`, `@MappedSuperclass`, `@Embeddable` 등록했나
- [ ] Spring Boot 버전에 맞는 패키지명인가 (2.x는 `javax`, 3.x는 `jakarta`)
- [ ] 엔티티를 `data class`로 만들지 않았나

---

## 링크

- [Kotlin 공식 문서 — Compiler plugins](https://kotlinlang.org/docs/all-open-plugin.html)
- [Spring 공식 가이드 — Kotlin support](https://docs.spring.io/spring-framework/reference/languages/kotlin.html)

## 관련 노트

- [DDD 개념 정리](/log/ddd-concepts/)
- [AI 시대 코프링은 살아남을 수 있을까](/log/kopring-in-ai-era/)
