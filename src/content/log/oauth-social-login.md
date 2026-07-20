---
title: "Oauth 인증"
date: 2026-07-20
category: "CS"
tags: ["reference","Oauth","CS","Backend"]
description: "사용자가 서비스에 ID/PW를 직접 입력하지 않고, 이미 가입된 외부 서비스(Google, Apple, Kakao 등)를 통해 인증하는 방식."
minutes: 6
---
사용자가 서비스에 ID/PW를 직접 입력하지 않고, 이미 가입된 외부 서비스(Google, Apple, Kakao 등)를 통해 인증하는 방식.
외부 서비스는 사용자 동의 하에 Access Token을 발급하고, 우리 서비스는 이 토큰으로 사용자 정보(이메일, 이름 등)를 조회해 회원가입/로그인에 활용한다

# Oauth 흐름

<pre class="mermaid">
sequenceDiagram
    actor 사용자
    participant 우리서비스
    participant Google/Apple

    사용자-&gt;&gt;우리서비스: 소셜 로그인 버튼 클릭
    우리서비스-&gt;&gt;사용자: 외부 서비스 로그인 페이지로 리다이렉트
    사용자-&gt;&gt;Google/Apple: ID/PW 입력 및 권한 동의
    Google/Apple-&gt;&gt;우리서비스: Authorization Code 전달 (redirect_uri)
    우리서비스-&gt;&gt;Google/Apple: Authorization Code로 Access Token 요청
    Google/Apple-&gt;&gt;우리서비스: Access Token (+ ID Token) 발급
    우리서비스-&gt;&gt;Google/Apple: Access Token으로 사용자 정보 요청
    Google/Apple-&gt;&gt;우리서비스: 사용자 정보 응답 (email, name 등)
    우리서비스-&gt;&gt;사용자: 회원가입 or 로그인 처리 완료
</pre>

# Client-Side vs Server-Side

## Client-Side (idToken 방식)
프론트/앱이 OAuth Flow를 직접 처리하고, 백엔드는 idToken 검증만 담당한다.

```
앱/프론트 → Google SDK로 로그인 → idToken 획득
         → POST /v1/oauth/google { idToken }
백엔드   → Google tokeninfo API로 검증
         → 유저 정보 추출 → JWT 발급
```

- 모바일 앱, SPA에 적합
- `client_secret` 불필요
- Spring OAuth2 의존성 불필요
- Google tokeninfo 검증 시 `aud` 클레임으로 타 앱 토큰 공격 방어

## Server-Side (Authorization Code 방식)
백엔드가 OAuth Flow 전체를 담당한다.

```
프론트 → /oauth2/authorization/google (Spring이 자동 처리)
       → Google 로그인 → code 발급
       → /login/oauth2/code/google 콜백 (Spring이 자동 처리)
백엔드 → code로 Google에 토큰 교환 → 유저 정보 조회
       → JWT 발급 → 프론트로 redirect
```

- `client_secret` 필요 (백엔드에만 존재, 보안 유리)
- Spring OAuth2 Client 의존성 사용 (`spring-boot-starter-oauth2-client`)
- state 파라미터로 CSRF 방지 자동 처리
- 새 provider 추가 시 `application.properties` 설정만 추가하면 됨

## 선택 기준
| | Client-Side | Server-Side |
|---|---|---|
| 모바일 앱 | ✅ 적합 | ❌ |
| SPA (React/Vue) | ✅ 가능 | ✅ 가능 |
| SSR | ❌ | ✅ 적합 |
| client_secret 노출 위험 | 없음 (사용 안 함) | 없음 (백엔드에만 존재) |

# Spring Security OAuth2 설정 (Server-Side)

→ [Spring OAuth2 Client](/log/spring-oauth2-client/) 참고

# client_id / client_secret

OAuth2 표준 스펙(RFC 6749)에 정의된 개념으로 Google만의 것이 아니다.
모든 OAuth2 provider(Google, Kakao, Naver, GitHub, Apple 등)가 동일하게 사용한다.

| 항목 | 설명 | 공개 여부 |
|---|---|---|
| `client_id` | 우리 앱을 식별하는 ID | 공개 가능 |
| `client_secret` | 우리 앱임을 증명하는 비밀키 | 백엔드에만 보관 |

- Client-Side 방식은 `client_secret` 사용 안 함
- Server-Side 방식은 `code → token` 교환 시 `client_secret` 필요
- `client_secret`은 절대 프론트엔드/앱에 포함되면 안 됨

# Spring OAuth2 Client 상세

## 의존성
```gradle
implementation 'org.springframework.boot:spring-boot-starter-oauth2-client'
```

## 자동 제공 엔드포인트
Spring Security가 자동으로 아래 두 URL을 처리한다. 별도 컨트롤러 구현 불필요.

| URL | 역할 |
|---|---|
| `/oauth2/authorization/{registrationId}` | Google 로그인 페이지로 redirect |
| `/login/oauth2/code/{registrationId}` | Google 콜백 수신, code → token 교환 |

## 세션 설정 주의
OAuth2 Authorization Code Flow는 CSRF 방지를 위해 `state` 파라미터를 서버 세션에 저장한다.
`SessionCreationPolicy.STATELESS`로 설정하면 state 검증 실패로 로그인이 동작하지 않는다.
→ **`IF_REQUIRED`** 로 설정해야 함

```java
.sessionManagement(session ->
    session.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED))
```

OAuth2 flow 완료 후 JWT 발급하고 나면 세션은 사용하지 않으므로 실질적으로 Stateless와 동일하게 동작한다.

## SecurityConfig 설정
```java
.oauth2Login(oauth2 -> oauth2
    .userInfoEndpoint(userInfo -> userInfo
        .oidcUserService(oAuth2LoginService))  // OIDC (Google)
    .successHandler(oAuth2SuccessHandler)
    .failureHandler(oAuth2FailureHandler)
)
```

## OAuth2LoginService
`OidcUserService`를 상속받아 인증 성공 후 유저 정보를 처리한다.
Strategy 패턴으로 provider별 유저 정보 추출 → DB 저장/조회 로직 수행.

```java
@Service
public class OAuth2LoginService extends OidcUserService {

    @Override
    public OidcUser loadUser(OidcUserRequest userRequest) {
        OidcUser oidcUser = super.loadUser(userRequest);
        // provider 식별 → Strategy로 유저 정보 추출
        // DB에서 회원 조회 or 신규 가입 처리
        return oidcUser;
    }
}
```

## SuccessHandler
인증 성공 후 JWT를 발급하고 프론트엔드로 redirect한다.

```java
@Component
public class OAuth2SuccessHandler implements AuthenticationSuccessHandler {
    @Override
    public void onAuthenticationSuccess(...) {
        // 1. OAuth2User에서 유저 정보 추출
        // 2. JWT 발급
        // 3. 프론트엔드로 redirect (token을 query param으로 전달)
        response.sendRedirect(redirectUrl + "?token=" + accessToken);
    }
}
```

## FailureHandler
인증 실패 시 프론트엔드 에러 페이지로 redirect한다.

```java
@Component
public class OAuth2FailureHandler implements AuthenticationFailureHandler {
    @Override
    public void onAuthenticationFailure(...) {
        response.sendRedirect(redirectUrl + "/error");
    }
}
```

## 멀티 서버 환경 주의
OAuth2 flow 중 세션을 사용하므로 다중 서버 배포 시 세션 공유가 필요하다.
→ Spring Session + Redis 도입 고려
