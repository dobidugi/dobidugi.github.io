---
title: "Expo"
date: 2026-08-05
category: "RN"
tags: ["reference","react-native","expo","mobile","빌드"]
description: "Expo는 React Native로 앱을 만들 때 필요한 것들을 미리 묶어놓은 도구 모음이다. React Native의 대체재가 아니라 그 위에 얹히는 층으로, 네이티브 프로젝트(Xcode/Andr…"
minutes: 9
---
> <span class="co co-abstract">📋 요약 한 줄 요약</span>
> **Expo는 React Native로 앱을 만들 때 필요한 것들을 미리 묶어놓은 도구 모음**이다. React Native의 대체재가 아니라 그 위에 얹히는 층으로, 네이티브 프로젝트(Xcode/Android Studio)를 직접 열지 않고도 카메라·파일시스템 같은 네이티브 기능을 쓰고 빌드까지 할 수 있게 해준다. 핵심 아이디어는 **"네이티브 코드를 손으로 관리하지 않는다"**.

## 1. React Native와 무슨 관계인가

**React Native**는 JS/TS로 쓴 코드를 iOS·Android의 진짜 네이티브 UI로 그려주는 프레임워크다. 하지만 RN만 쓰면 직접 해야 하는 게 많다.

- `ios/`, `android/` 네이티브 프로젝트를 직접 들고 관리
- 라이브러리 하나 붙일 때마다 Podfile·Gradle·권한 설정을 손으로 수정
- 빌드하려면 macOS + Xcode(iOS), Android Studio(Android) 필요

**Expo는 이 뒤치다꺼리를 대신한다.** 개발자는 JS/TS와 설정 파일(`app.json`) 하나만 만지고, 네이티브 쪽은 Expo가 생성·관리한다.

```
[ 내 코드 (TS/React) ]
        ↓
[ Expo SDK — expo-camera, expo-file-system, expo-font ... ]
        ↓
[ React Native ]
        ↓
[ iOS / Android 네이티브 ]
```

## 2. 핵심 개념

### 2.1 Expo SDK

네이티브 기능을 감싼 공식 모듈 묶음. `expo-image-picker`(사진 선택), `expo-file-system`(파일), `expo-font`(폰트), `expo-notifications`(푸시) 같은 것들이다.

중요한 점: **SDK는 버전 단위로 통째로 움직인다.** SDK 57을 쓰면 그 안의 모듈들도 57 계열로 맞춰야 하고, 모듈 API가 메이저 버전에서 갈아엎히는 경우가 있다. (예: `expo-file-system` 57은 예전 함수 호출 방식 대신 `new File(uri)` 같은 객체 API를 쓴다.) 그래서 **Expo는 검색 결과보다 해당 버전 공식 문서를 봐야 한다** — 오래된 블로그 글의 코드가 그대로 안 도는 일이 잦다.

### 2.2 Expo Go vs Development Build

| | Expo Go | Development Build (dev client) |
|---|---|---|
| 뭔가 | 스토어에서 받는 **미리 만들어진 껍데기 앱** | 내 프로젝트로 직접 빌드한 개발용 앱 |
| 설치 | 앱스토어/플레이스토어에서 바로 | EAS 등으로 빌드해서 설치 |
| 쓸 수 있는 것 | **Expo SDK에 포함된 모듈만** | 네이티브 라이브러리 아무거나 |
| 언제 | 초기 개발, 빠른 확인 | 서드파티 네이티브 모듈이 필요해질 때 |

Expo Go는 이미 빌드된 앱이라 그 안에 들어있지 않은 네이티브 코드는 못 쓴다. 소셜 로그인 SDK처럼 Expo SDK 밖의 네이티브 모듈이 필요해지는 순간 dev client로 넘어가야 한다.

### 2.3 CNG (Continuous Native Generation)

`ios/`, `android/` 폴더를 **저장소에 두지 않고**, `app.json` 설정으로부터 빌드할 때마다 새로 생성하는 방식. `npx expo prebuild`가 그 생성 작업을 한다.

- 장점: 네이티브 프로젝트 파일 충돌·머지 지옥이 없고, SDK 업그레이드가 설정 갱신으로 끝난다
- 대가: 네이티브 파일을 손으로 고치면 다음 생성 때 날아간다. 고쳐야 하면 **config plugin**으로 "이렇게 고쳐라"를 코드로 적어둔다

### 2.4 app.json / config plugin

앱 이름, 아이콘, 번들 ID, 권한 문구 등을 한 파일에서 선언한다. 네이티브 설정이 필요한 라이브러리는 플러그인으로 등록하면 prebuild 때 알아서 반영된다.

```json
"plugins": [
  ["expo-image-picker", {
    "photosPermission": "추억 사진을 기록에 넣기 위해 사진 접근이 필요해요."
  }],
  "expo-font"
]
```

권한 문구를 `Info.plist`/`AndroidManifest.xml`에 직접 쓰지 않고 여기서 선언한다는 게 요점.

### 2.5 Expo Router — 파일 기반 라우팅

SDK 49 이후 Expo가 미는 표준 네비게이션. **`app/` 폴더의 파일 구조가 곧 화면 경로**가 된다. React Navigation을 직접 설정하는 대신 파일을 만들면 라우트가 생긴다.

```text
app/
├── _layout.tsx          # 공통 레이아웃 (전역 Provider, 테마)
├── index.tsx            # "/"        홈
├── record/
│   ├── _layout.tsx      # 이 그룹의 레이아웃 (스택/탭)
│   ├── index.tsx        # "/record"
│   └── [date].tsx       # "/record/2026-08-05"  동적 경로
└── (tabs)/              # 괄호 폴더 = 경로에 안 들어가는 그룹
    ├── home.tsx         # "/home"
    └── settings.tsx     # "/settings"
```

```tsx
import { Link, router, useLocalSearchParams } from 'expo-router';

// 선언형 이동
<Link href="/record/2026-08-05">기록 보기</Link>

// 명령형 이동
router.push('/record/2026-08-05');
router.back();

// 동적 경로 파라미터 받기 — [date].tsx 안에서
const { date } = useLocalSearchParams<{ date: string }>();
```

- `[date].tsx` 대괄호는 **동적 세그먼트**, `(tabs)` 괄호는 **경로에 포함되지 않는 그룹 폴더**(레이아웃만 공유)
- 딥링크가 공짜로 따라온다 — `myapp://record/2026-08-05`가 해당 화면으로 바로 연결된다. 소셜 로그인 콜백을 받을 때 이 점이 중요해진다
- 웹까지 같은 코드로 도는 게 설계 의도(React Native Web)

### 2.6 EAS (Expo Application Services)

Expo가 운영하는 클라우드 서비스.

- **EAS Build** — 클라우드에서 앱을 빌드한다. **macOS 없이 iOS 빌드가 가능**한 게 실질적으로 가장 큰 이점. 프로파일별로 산출물을 나눈다 (내부 배포용 APK / 스토어용 AAB 등)
- **EAS Submit** — 빌드 결과를 스토어에 업로드
- **EAS Update (OTA)** — JS 번들만 교체해서 스토어 심사 없이 배포. 단 **JS 레벨 변경만** 가능하고, 네이티브 모듈이 바뀌면 새로 빌드해야 한다

### 2.7 환경변수와 시크릿

RN 앱은 번들이 기기에 통째로 내려가므로 **"앱에 넣는 값은 다 공개된다"** 를 전제로 나눠야 한다.

```bash
# .env — EXPO_PUBLIC_ 접두사가 붙은 것만 앱 코드에서 읽힌다
EXPO_PUBLIC_API_URL=https://api.example.com
```

```ts
const apiUrl = process.env.EXPO_PUBLIC_API_URL;
```

- `EXPO_PUBLIC_*` 는 **빌드 시점에 번들에 박제**된다. API 주소나 클라이언트 ID처럼 노출돼도 되는 값만 넣는다
- 서버 시크릿(DB 비밀번호, 서비스 키)은 앱에 절대 넣지 않는다. 필요하면 백엔드를 경유한다
- 빌드 과정에만 필요한 값(스토어 자격증명 등)은 **EAS Secrets**(`eas secret:create`)로 클라우드에 두고 번들에는 포함시키지 않는다
- 소셜 로그인의 **네이티브 앱 키는 클라이언트에 들어가는 게 정상**이다. 대신 서버에서 토큰 검증을 반드시 한다

## 3. 자주 쓰는 명령어

| 명령어 | 용도 |
|---|---|
| `npx create-expo-app@latest <name>` | 프로젝트 생성 |
| `npx expo start` | 개발 서버 실행 (`--dev-client` 붙이면 dev build용) |
| `npx expo install <pkg>` | **SDK 버전에 맞는 버전으로** 설치 — `npm install` 대신 이걸 쓴다 |
| `npx expo install --check` | 설치된 패키지가 현재 SDK와 맞는지 점검 |
| `npx expo prebuild --clean` | `ios/`·`android/` 재생성 (CNG) |
| `npx expo-doctor` | 버전 충돌·설정 문제 진단 |
| `eas build --profile development --platform android` | dev client 빌드 |
| `eas build --profile production --platform all` | 스토어용 빌드 |
| `eas update --branch production` | OTA 배포 (JS만) |

> <span class="co co-tip">💡 TIP 막혔을 때 첫 두 가지</span>
> 원인 모를 빌드·런타임 오류는 대개 **버전 불일치**다. `npx expo-doctor`와 `npx expo install --check`를 먼저 돌려보면 상당수가 여기서 잡힌다.

## 4. 한계 / 주의점

- **네이티브를 아예 안 봐도 되는 건 아니다.** Expo SDK 밖의 기능이 필요해지면 dev client + config plugin을 알아야 한다
- **버전 결합이 강하다.** RN·React·Expo SDK 버전이 서로 묶여 있어서 임의로 올리면 깨진다. `npx expo install`을 쓰면 SDK에 맞는 버전으로 설치해준다
- **앱 용량이 순정 RN보다 큰 편**
- **문서 버전 확인이 필수.** 위에 쓴 대로 메이저 버전에서 API가 바뀐다

### 자주 걸리는 예: 소셜 로그인

Expo Go의 한계가 가장 먼저 드러나는 지점. 이유는 두 겹이다.

**① 네이티브 SDK가 Expo Go 안에 없다.** 카카오·네이버가 제공하는 로그인 SDK는 네이티브 모듈이다. Expo Go는 이미 컴파일된 앱이라 그 안에 없는 네이티브 코드는 `npm install`을 해도 런타임에 존재하지 않는다. 모듈이 null이라는 에러로 나타난다.

**② Expo Go에서 실행 주체는 내 앱이 아니다.** 소셜 로그인 플랫폼에 앱을 등록할 때 안드로이드 패키지명 / iOS 번들 ID / 키 해시 / 리다이렉트 URI를 등록하는데, Expo Go로 띄우면 그걸 실행하는 건 **Expo Go 앱**(`host.exp.exponent`)이다. 내 앱 기준으로 등록한 값과 맞지 않고, 로그인 후 돌아오는 딥링크 스킴도 `myapp://`가 아니라 Expo Go의 `exp://` 계열이라 어긋난다.

**우회로는 있다.** 네이티브 SDK 대신 **웹 OAuth(REST) 방식**을 `expo-auth-session`으로 태우면 브라우저에서 인증하고 돌아오는 흐름이라 Expo Go에서도 개발은 가능하다. 다만 카카오톡 앱으로 전환되는 간편 로그인 같은 네이티브 경험은 포기해야 하고, 실제 배포용 스킴을 쓰려면 어차피 development build가 필요하다. Apple 로그인은 네이티브 entitlement가 필요해서 Expo Go로는 불가능하다.

정리하면 **"소셜 로그인 = Expo Go 졸업 시점"** 으로 보는 편이 안전하다.

## 링크

- 공식 문서(버전 고정): https://docs.expo.dev/versions/v57.0.0/
- Expo Router: https://docs.expo.dev/router/introduction/
- EAS Build: https://docs.expo.dev/build/introduction/
