---
title: "Spring OAuth2 Client"
date: 2026-04-12
category: "SPRING"
tags: ["reference","Oauth","Spring","Security","Backend"]
description: "Spring Security가 제공하는 OAuth2 Authorization Code Flow 구현체."
minutes: 14
---
Spring Security가 제공하는 OAuth2 Authorization Code Flow 구현체.
Google, Kakao, Naver 등 외부 provider와의 소셜 로그인을 서버 사이드에서 처리한다.

---

# 전체 흐름

<pre class="mermaid">
sequenceDiagram
    actor 사용자
    participant 프론트
    participant 백엔드(Spring)
    participant Google

    사용자-&gt;&gt;프론트: 로그인 버튼 클릭
    프론트-&gt;&gt;백엔드(Spring): GET /oauth2/authorization/google
    백엔드(Spring)-&gt;&gt;사용자: Google 로그인 페이지로 redirect (state 포함)
    사용자-&gt;&gt;Google: 로그인 + 권한 동의
    Google-&gt;&gt;백엔드(Spring): GET /login/oauth2/code/google?code=...&amp;state=...
    백엔드(Spring)-&gt;&gt;Google: code + client_id + client_secret으로 token 요청
    Google-&gt;&gt;백엔드(Spring): access_token + id_token 발급
    백엔드(Spring)-&gt;&gt;Google: access_token으로 유저 정보 요청
    Google-&gt;&gt;백엔드(Spring): email, name, sub 등 유저 정보 응답
    백엔드(Spring)-&gt;&gt;프론트: JWT 발급 후 redirect
</pre>

Spring이 자동으로 처리하는 부분:
- `/oauth2/authorization/{registrationId}` → Google 로그인 URL 생성 + redirect
- `/login/oauth2/code/{registrationId}` → code 수신 + token 교환 + 유저 정보 조회
- `state` 파라미터 생성/검증 (CSRF 방지)

개발자가 구현해야 하는 부분:
- `OAuth2UserService` (유저 정보 처리, DB 저장)
- `SuccessHandler` (JWT 발급 + 프론트 redirect)
- `FailureHandler` (실패 처리)

---

# 핵심 개념

## client_id / client_secret
OAuth2 표준(RFC 6749)에 정의된 개념. Google만의 것이 아님.

| 항목 | 설명 | 공개 여부 |
|---|---|---|
| `client_id` | 우리 앱을 식별하는 ID | 공개 가능 |
| `client_secret` | 우리 앱임을 증명하는 비밀키 | **백엔드에만 보관** |

> `client_secret`은 절대 프론트엔드나 앱에 포함되면 안 됨.

## registrationId
Spring Security가 provider를 식별하는 이름. properties에 설정한 키 이름이 그대로 사용됨.

```properties
spring.security.oauth2.client.registration.google.client-id=...
#                                              ^^^^^^
#                                         registrationId = "google"
```

## state 파라미터
CSRF 공격 방지를 위해 Spring이 자동으로 생성하는 랜덤 값.
로그인 요청 시 세션에 저장하고, 콜백 시 Google이 돌려보낸 값과 비교해 검증한다.
→ **`SessionCreationPolicy.STATELESS`면 state 검증 실패로 로그인 불가**

## scope
우리 앱이 Google에 요청하는 권한 범위.

| scope | 내용 | Google 검수 |
|---|---|---|
| `openid` | OIDC 인증 | 불필요 |
| `email` | 이메일 | 불필요 |
| `profile` | 이름, 프로필 사진 | 불필요 |
| `https://www.googleapis.com/auth/drive` | Google Drive 접근 | **검수 필요** |

→ 소셜 로그인용이면 `openid,email,profile` 만으로 충분하고 검수 없이 배포 가능.

## OIDC vs OAuth2
- **OAuth2**: 권한 위임 프로토콜. access_token으로 리소스 접근.
- **OIDC (OpenID Connect)**: OAuth2 위에 인증을 추가한 표준. id_token(JWT)으로 유저 정보 포함.
- Google은 OIDC를 지원 → `OidcUserService` 사용.
- Kakao, Naver는 OIDC 미지원 → `DefaultOAuth2UserService` 사용.

---

# 설정

## 의존성
```gradle
implementation 'org.springframework.boot:spring-boot-starter-oauth2-client'
```

## application.properties
```properties
# Google 등록
spring.security.oauth2.client.registration.google.client-id=${GOOGLE_CLIENT_ID}
spring.security.oauth2.client.registration.google.client-secret=${GOOGLE_CLIENT_SECRET}
spring.security.oauth2.client.registration.google.scope=openid,email,profile
spring.security.oauth2.client.registration.google.redirect-uri={baseUrl}/login/oauth2/code/{registrationId}

# 프론트엔드 redirect URL (JWT 전달용)
oauth.redirect-url=${OAUTH_REDIRECT_URL:http://localhost:3000/oauth/callback}
```

> Google, GitHub, Facebook, Okta는 `CommonOAuth2Provider`에 사전 정의되어 있어서
> `client-id`, `client-secret`만 설정해도 나머지(authorization-uri, token-uri 등)는 자동 설정됨.
> Kakao, Naver 등 커스텀 provider는 `provider` 설정 추가 필요.

## 커스텀 Provider (Kakao 예시)
```properties
spring.security.oauth2.client.registration.kakao.client-id=${KAKAO_CLIENT_ID}
spring.security.oauth2.client.registration.kakao.client-secret=${KAKAO_CLIENT_SECRET}
spring.security.oauth2.client.registration.kakao.scope=profile_nickname,account_email
spring.security.oauth2.client.registration.kakao.redirect-uri={baseUrl}/login/oauth2/code/{registrationId}
spring.security.oauth2.client.registration.kakao.authorization-grant-type=authorization_code
spring.security.oauth2.client.registration.kakao.client-authentication-method=client_secret_post

spring.security.oauth2.client.provider.kakao.authorization-uri=https://kauth.kakao.com/oauth/authorize
spring.security.oauth2.client.provider.kakao.token-uri=https://kauth.kakao.com/oauth/token
spring.security.oauth2.client.provider.kakao.user-info-uri=https://kapi.kakao.com/v2/user/me
spring.security.oauth2.client.provider.kakao.user-name-attribute=id
```

---

# 구현

## SecurityConfig
```java
@Bean
@Order(2)
public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
    http
        .cors(Customizer.withDefaults())
        .csrf(AbstractHttpConfigurer::disable)
        // OAuth2 flow에서 state를 세션에 저장하므로 IF_REQUIRED 필수
        .sessionManagement(session ->
            session.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED))
        .authorizeHttpRequests(authorize -> authorize
            .requestMatchers(PUBLIC_ENDPOINTS).permitAll()
            .anyRequest().authenticated()
        )
        .oauth2Login(oauth2 -> oauth2
            .userInfoEndpoint(userInfo -> userInfo
                .oidcUserService(oAuth2LoginService))   // Google (OIDC)
            .successHandler(oAuth2SuccessHandler)
            .failureHandler(oAuth2FailureHandler)
        )
        .addFilterBefore(userJwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

    return http.build();
}
```

> **왜 IF_REQUIRED인가?**
> STATELESS면 세션이 없어서 state 검증 실패 → OAuth2 로그인 동작 안 함.
> IF_REQUIRED는 OAuth2 flow에서만 세션을 생성하고, 일반 JWT 인증에서는 세션을 만들지 않음.
> JWT 발급 후 redirect하고 나면 세션은 사실상 사용되지 않으므로 Stateless와 동일하게 동작.

## OAuth2LoginService (유저 정보 처리)
Google은 OIDC이므로 `OidcUserService` 상속.

```java
@RequiredArgsConstructor
@Service
public class OAuth2LoginService extends OidcUserService {

    private final Map<OauthProvider, OauthStrategy> strategies;

    @Override
    public OidcUser loadUser(OidcUserRequest userRequest) throws OAuth2AuthenticationException {
        OidcUser oidcUser = super.loadUser(userRequest);

        // registrationId로 provider 식별
        String registrationId = userRequest.getClientRegistration().getRegistrationId();
        OauthProvider provider = OauthProvider.from(registrationId);

        // Strategy 패턴으로 provider별 유저 정보 추출
        OauthStrategy strategy = strategies.get(provider);
        OauthUserInfo userInfo = strategy.extractUserInfo(oidcUser);

        // DB에서 회원 조회 or 신규 가입 처리
        // ...

        return oidcUser;
    }
}
```

## OAuth2SuccessHandler
인증 성공 후 JWT 발급 + 프론트엔드로 redirect.

```java
@RequiredArgsConstructor
@Component
public class OAuth2SuccessHandler implements AuthenticationSuccessHandler {

    private final JwtTokenProvider jwtTokenProvider;

    @Value("${oauth.redirect-url}")
    private String redirectUrl;

    @Override
    public void onAuthenticationSuccess(
            HttpServletRequest request,
            HttpServletResponse response,
            Authentication authentication) throws IOException {

        // JWT 발급
        String accessToken = jwtTokenProvider.generateAccessToken(userSeq);

        // 프론트엔드로 redirect (token을 query param으로 전달)
        response.sendRedirect(redirectUrl + "?token=" + accessToken);
    }
}
```

> token을 query param으로 전달하는 이유: 서버 redirect 시 프론트의 localStorage에 직접 쓸 수 없으므로,
> 프론트가 콜백 페이지에서 query param을 파싱해 저장한다.

## OAuth2FailureHandler
인증 실패 시 처리.

```java
@RequiredArgsConstructor
@Component
public class OAuth2FailureHandler implements AuthenticationFailureHandler {

    @Value("${oauth.redirect-url}")
    private String redirectUrl;

    @Override
    public void onAuthenticationFailure(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationException exception) throws IOException {
        log.error("OAuth2 인증 실패: {}", exception.getMessage());
        response.sendRedirect(redirectUrl + "?error=oauth_failed");
    }
}
```

## Strategy 패턴 (Provider별 유저 정보 추출)
provider마다 OAuth2User의 attribute 구조가 다르므로 Strategy로 분리.

```java
public interface OauthStrategy {
    OauthProvider provider();
    OauthUserInfo extractUserInfo(OAuth2User user);
}

@Component
public class GoogleOauthStrategy implements OauthStrategy {

    @Override
    public OauthProvider provider() { return OauthProvider.GOOGLE; }

    @Override
    public OauthUserInfo extractUserInfo(OAuth2User user) {
        return new OauthUserInfo(
            user.getAttribute("email"),
            user.getAttribute("name"),
            user.getAttribute("sub")    // Google 고유 유저 ID
        );
    }
}
```

새 provider 추가 시 구현체만 추가하면 됨 (OCP 준수).

---

# Google Cloud Console 설정

1. [console.cloud.google.com](https://console.cloud.google.com) 접속
2. APIs & Services → **사용자 인증 정보** → OAuth 2.0 클라이언트 ID 생성
3. 애플리케이션 유형: **웹 애플리케이션** (모바일 앱이어도 백엔드용은 웹 애플리케이션)
4. **승인된 리디렉션 URI** 등록:
   ```
   http://localhost:8080/login/oauth2/code/google   (개발)
   https://yourdomain.com/login/oauth2/code/google  (운영)
   ```
5. OAuth 동의 화면 → **테스트 사용자** 추가 (개발 중, 등록된 계정만 로그인 가능)
6. 서비스 출시 시 **앱 게시** (email/profile/openid scope는 검수 불필요)

---

# 테스트 방법 (프론트 없이)

백엔드만 실행 후 브라우저에서 직접 접속:
```
http://localhost:8080/oauth2/authorization/google
```

Google 로그인 완료 후 `oauth.redirect-url`로 redirect됨.
프론트가 없으면 redirect 실패하지만 로그에서 JWT 발급 여부 확인 가능.

임시로 redirect URL을 백엔드 주소로 설정하면 끝까지 확인 가능:
```
OAUTH_REDIRECT_URL=http://localhost:8080/test
```

---

# 주의사항

## 멀티 서버 환경
OAuth2 flow 중 state를 세션에 저장하므로, 다중 서버 배포 시 세션 공유 필요.
→ Spring Session + Redis 도입 고려.
단일 서버라면 문제없음.

## Google 유저 정보 필드
| 필드 | 설명 |
|---|---|
| `sub` | Google 고유 유저 ID. **변경 불가** → DB 식별자로 사용 |
| `email` | 이메일 (변경 가능) |
| `name` | 이름 |
| `aud` | 토큰이 발급된 client_id (검증용) |

## Kakao/Naver는 OidcUserService 사용 불가
OIDC 미지원 provider는 `DefaultOAuth2UserService` 사용.
Google과 Kakao를 동시 지원하려면 두 서비스를 분리하거나 조건 분기 처리 필요.
