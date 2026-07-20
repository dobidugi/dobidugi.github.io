---
title: "Oauth"
date: 2026-04-03
category: "CS"
tags: ["reference","Oauth","CS","Backend","인가"]
description: "리소스 소유자(사용자 또는 서비스)가 자신의 자원에 대한 접근 권한을 제3자에게 위임하기 위한 인가(Authorization) 프로토콜."
minutes: 4
---
리소스 소유자(사용자 또는 서비스)가 자신의 자원에 대한 접근 권한을 제3자에게 위임하기 위한 인가(Authorization) 프로토콜.
소셜 로그인은 이 위임 구조를 인증에 활용한 대표적 사례다.

# OAuth 1.0 vs 2.0

|                   | 1.0                                | 2.0                                      |
| ----------------- | ---------------------------------- | ---------------------------------------- |
| **보안 방식**         | 매 요청마다 HMAC-SHA1 서명 (HTTPS 없이도 안전) | HTTPS 강제, 서명 불필요                         |
| **토큰 흐름**         | Request Token → Access Token 2단계   | Authorization Code → Access Token (더 단순) |
| **Refresh Token** | 없음                                 | 있음                                       |
| **Grant Type**    | 하나뿐 (웹서버 플로우)                      | 용도별 여러 종류                                |
| **클라이언트 종류**      | 서버 앱만 가정                           | 모바일, SPA, 서버, IoT 등 다양                   |
| **구현 난이도**        | 서명 구현이 까다로움                        | 상대적으로 쉬움                                 |

핵심: 1.0은 **서명 기반 보안**이라 구현이 복잡하고, 2.0은 **HTTPS에 보안을 맡기고 프로토콜 자체를 단순화**한 것.

# Grant Type (OAuth 2.0)

## Authorization Code
가장 일반적. 서버가 있는 웹앱용.

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
    Google/Apple-&gt;&gt;우리서비스: Access Token (+ Refresh Token, ID Token) 발급
    우리서비스-&gt;&gt;Google/Apple: Access Token으로 사용자 정보 요청
    Google/Apple-&gt;&gt;우리서비스: 사용자 정보 응답 (email, name 등)
    우리서비스-&gt;&gt;사용자: 회원가입 or 로그인 처리 완료
</pre>

## Authorization Code + PKCE
모바일/SPA용. client_secret을 안전하게 저장 못하는 환경.
- 랜덤 `code_verifier` 생성 → 해시값(`code_challenge`)을 인증 요청에 포함
- 토큰 교환 시 원본 `code_verifier` 제출해서 검증
- Authorization Code를 탈취당해도 `code_verifier` 없으면 토큰 못 받음

## Client Credentials
사용자 없이 **서버 대 서버** 통신용.
- 예: 백엔드가 다른 API 서비스에 직접 인증할 때
- client_id + client_secret만으로 바로 Access Token 발급

## Implicit (deprecated)
옛날 SPA용. code 없이 바로 Access Token 발급.
토큰이 URL fragment에 노출돼서 보안 취약 → **PKCE로 대체됨**

## Resource Owner Password (deprecated)
사용자 ID/PW를 우리 서비스가 직접 받아서 토큰 요청.
OAuth의 취지(ID/PW 안 넘기기)에 모순 → **레거시 마이그레이션용으로만**

# 토큰 종류

**Access Token**
- API 호출용, 짧은 만료 (보통 30분~1시간)
- 만료되면 재로그인 필요 → Refresh Token이 이를 해결

**Refresh Token**
- Access Token 갱신용, 긴 만료 (수일~수개월)
- Access Token 만료 시 Refresh Token으로 새 Access Token 발급
- 사용자가 매번 로그인 안 해도 되는 이유

**ID Token** (OIDC 사용 시)
- JWT 형태, 사용자 정보(이메일, 이름 등)가 토큰 안에 포함
- 별도 API 호출 없이 사용자 정보 확인 가능
