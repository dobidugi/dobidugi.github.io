---
title: "OAuth로 소셜 로그인 흐름 이해하기"
date: 2026-07-20
category: "CS"
tags: ["reference","Oauth","CS","Backend"]
description: "소셜 로그인은 외부 서비스가 확인한 사용자 정보를 우리 서비스의 회원과 연결하는 과정이다. OAuth 2.0과 OIDC의 역할, 토큰의 용도, 로그인 상태를 관리하는 위치를 구분해 살펴본다."
minutes: 3
---
> <span class="co co-abstract">📋 요약 한 줄 요약</span>
> 소셜 로그인은 외부 서비스가 확인한 사용자 정보를 우리 서비스의 회원과 연결하는 과정이다. OAuth 2.0과 OIDC의 역할, 토큰의 용도, 로그인 상태를 관리하는 위치를 구분해 살펴본다.

서비스에 ‘Google로 로그인’ 버튼을 넣으면 사용자는 새 비밀번호를 만들지 않고 기존 계정으로 가입할 수 있다. 우리 서비스는 Google이 확인한 사용자 정보를 받아 회원을 찾거나 새로 등록한다.

## OAuth 2.0과 OIDC의 역할

이 흐름을 이해하려면 OAuth 2.0과 OpenID Connect의 역할부터 구분하는 것이 좋다. OAuth 2.0은 외부 서비스의 리소스에 접근할 권한을 위임하는 방식이다. OpenID Connect(OIDC)는 그 위에 사용자 인증을 위한 규칙을 추가한다. Google 로그인에서는 OIDC의 ID Token으로 사용자를 확인할 수 있다. [Google OIDC 문서](https://developers.google.com/identity/openid-connect/openid-connect)

로그인 과정에 등장하는 값들은 용도가 다르다.

| 값 | 역할 |
|---|---|
| Authorization Code | 토큰으로 교환하기 위해 잠시 사용하는 코드 |
| Access Token | 허용된 범위에서 외부 서비스의 API를 호출하는 데 사용하는 토큰 |
| ID Token | 인증된 사용자에 관한 정보를 담은 토큰 |

## 백엔드에서 코드를 교환하는 흐름

백엔드에서 Authorization Code를 교환하는 흐름은 다음과 같다.

1. 사용자가 로그인 버튼을 누르면 외부 서비스의 로그인 화면으로 이동한다.
2. 사용자가 로그인하고 필요한 권한에 동의한다.
3. 외부 서비스가 등록된 콜백 주소로 Authorization Code를 전달한다.
4. 백엔드가 요청의 유효성을 확인하고 코드를 토큰으로 교환한다.
5. 백엔드가 사용자 정보를 검증한 뒤, 우리 서비스의 회원과 연결하고 로그인 상태를 만든다.

여기서 외부 서비스의 로그인과 우리 서비스의 로그인은 구분해야 한다. Google이 사용자를 확인해줬더라도, 우리 서비스는 그 사용자가 어떤 회원인지 판단하고 자체적인 로그인 상태를 관리해야 한다.

## SDK로 받은 ID Token을 검증하는 흐름

제공자의 SDK로 ID Token을 받아 백엔드에 전달하는 구성도 있다. 이때 백엔드는 토큰의 서명, 발급자, 대상 앱, 만료 시간을 검증한다. Google은 운영 환경에서 검증 라이브러리 사용을 권장하며, `tokeninfo` 엔드포인트는 개발·디버깅 용도로 안내한다. 회원을 연결할 때는 변경될 수 있는 이메일보다 제공자의 사용자 식별자인 `sub`를 기준으로 삼는다. [Google ID Token 검증 안내](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)

구현 방식을 ‘모바일은 클라이언트 방식, 웹은 서버 방식’으로 나눌 필요는 없다. 네이티브 앱도 Authorization Code와 PKCE를 사용한다. 플랫폼 이름보다 제공자가 지원하는 흐름, 백엔드의 역할, 토큰을 다루는 위치를 기준으로 선택하는 편이 정확하다. [네이티브 앱 OAuth 표준](https://www.rfc-editor.org/rfc/rfc8252)

## 비밀값과 우리 서비스의 로그인 상태

`client_id`는 앱을 식별하는 공개 값이다. `client_secret`을 사용하는 구성에서는 이를 백엔드에 보관한다. 브라우저 코드나 배포되는 모바일 앱에 비밀값을 넣어두고 안전하다고 가정해서는 안 된다.

우리 서비스가 브라우저에 자체 Access Token과 Refresh Token을 발급한다면, Access Token은 메모리에만 두고 Refresh Token은 서버가 설정하는 HttpOnly 쿠키로 관리한다. 운영 환경에서는 Secure와 적절한 SameSite 정책을 적용하고, 갱신·로그아웃 요청에도 CSRF 방어를 적용한다. 토큰을 리다이렉트 URL에 붙이거나 브라우저 저장소에 남기는 흐름은 사용하지 않는다.

Spring Security에서는 `oauth2Login()`으로 Authorization Code 기반 로그인을 구성할 수 있다. 실제 설정과 사용자 처리 코드는 [Spring OAuth2 Client](/log/spring-oauth2-client/) 글에서 이어서 다룬다. [Spring Security 문서](https://docs.spring.io/spring-security/reference/servlet/oauth2/login/core.html)
