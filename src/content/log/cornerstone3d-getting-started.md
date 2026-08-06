---
title: "Cornerstone3D 시작하기 — 개념·기본 사용법·뷰포트 종류"
date: 2026-08-05
category: "FE"
tags: ["프론트엔드","Cornerstone3D","DICOM","WebGL","의료영상"]
description: "Cornerstone3D는 브라우저에서 의료영상을 그리는 렌더링 라이브러리다. <img> 와 달리 원본 픽셀 값을 그대로 들고 있어서 윈도잉·계측·3D 재구성이 된다. 핵심은 네 가지 — image…"
minutes: 12
---
> <span class="co co-abstract">📋 요약 한 줄 요약</span>
> Cornerstone3D는 **브라우저에서 의료영상을 그리는 렌더링 라이브러리**다. `<img>` 와 달리 원본 픽셀 값을 그대로 들고 있어서 윈도잉·계측·3D 재구성이 된다. 핵심은 네 가지 — **imageId**(영상 주소), **ImageLoader**(주소→픽셀), **RenderingEngine**(WebGL 소유자), **Viewport**(그리는 창). 뷰포트 종류는 "데이터를 2D 낱장으로 보느냐 3D 덩어리로 보느냐"로 갈린다.

## 1. 이게 왜 필요한가

의료영상을 `<img src="ct.jpg">` 로 못 그리는 건 아니다. 문제는 **브라우저가 그 순간 픽셀을 뭉개버린다**는 점이다.

CT 한 장은 보통 12~16비트로, 값의 범위가 대략 -1000(공기) ~ +3000(뼈) 이다. 이걸 JPG로 만들면 0~255로 눌러 담아야 하고, 그 과정에서 **어떤 밝기 구간을 살릴지 한 번 정해지면 되돌릴 수 없다.** 폐를 보려고 만든 JPG로는 뼈를 볼 수 없다.

Cornerstone3D는 원본 값을 그대로 GPU로 넘기고, 화면에 보일 때만 "지금은 -1000~200 구간을 0~255로 펴서 보여줘"를 적용한다. 이걸 **윈도잉(windowing) / VOI(Value Of Interest)** 라고 한다. 판독자가 슬라이더를 움직이면 원본에서 다시 계산하므로 정보 손실이 없다.

| 기능 | `<img>` | Cornerstone3D |
|---|---|---|
| **Pixel data** (픽셀 값) | 0~255 로 이미 눌림 | 원본 비트심도 유지 |
| **Windowing / VOI** (밝기·대비) | CSS filter (되돌릴 수 없는 근사) | 원본에서 재계산 |
| **Measurement** (길이·각도 계측) | 불가 (mm 정보가 없음) | 가능 (pixelSpacing 사용) |
| **Stack scroll** (여러 장 넘기기) | 이미지 교체 | 스택 인덱스 이동 |
| **MPR** (단면 재구성) | 불가 | 볼륨 뷰포트 |

> <span class="co co-tip">💡 TIP 일반 사진(JPG/PNG)에도 쓸 만한가</span>
> 쓸 만하다. 포맷별로 뷰어가 갈라지는 걸 막을 수 있다. → [Cornerstone3D 로 JPG·PNG 까지 렌더링하기](/log/cornerstone3d-custom-image-loader/)

## 2. 패키지 구성

```
@cornerstonejs/core                 렌더링 엔진·뷰포트·캐시  (필수)
@cornerstonejs/tools                확대/팬/윈도잉/계측 도구  (선택)
@cornerstonejs/dicom-image-loader   DICOM 파싱·디코딩        (DICOM 쓸 때)
```

`core` 만으로도 그림은 그려진다. 마우스 조작이 필요할 때 `tools` 를 얹는다.

## 3. 핵심 개념 4가지

```
 imageId                ImageLoader              RenderingEngine        Viewport
"wadouri:https://…"  →  주소를 실제 픽셀로   →   WebGL 컨텍스트 1개  →  <div> 안의 화면
"web:blob:…"            (스킴별로 등록)          (앱 전체에 하나)       (여러 개 가능)
"dicomfile:0"
                              ↑
                        metaData provider
                     (크기·비트심도·픽셀간격 등)
```

### imageId — 영상 한 장의 주소

`스킴:나머지` 형태의 문자열이다. **스킴이 어떤 로더를 쓸지 결정한다.**

| imageId 예시 | 로더 | 쓰임 |
|---|---|---|
| `wadouri:https://…/1.dcm` | dicom-image-loader | 서버의 DICOM 파일 |
| `dicomfile:0` | dicom-image-loader | 사용자가 방금 올린 DICOM |
| `web:https://…/a.jpg` | 직접 등록 | 일반 이미지 |

### ImageLoader — 주소를 픽셀로

스킴별로 등록한다. 반환값이 Promise가 아니라 **`{ promise }` 객체**라는 게 첫 함정이다.

```ts
imageLoader.registerImageLoader('web', (imageId) => ({ promise: /* Promise<IImage> */ }))
```

### metaData provider — "이 영상이 몇 픽셀짜리인지"

로더와 **별개로** 등록해야 한다. 뷰포트는 픽셀을 받기 전에 크기·비트심도·픽셀 간격을 먼저 물어본다. 내 스킴이 아니면 반드시 `undefined` 를 반환해서 다음 provider에게 넘겨야 한다.

### RenderingEngine — WebGL 컨텍스트 소유자

브라우저는 WebGL 컨텍스트 수를 제한한다(보통 8~16개). 그래서 **엔진은 앱에 하나만 만들고 뷰포트를 여러 개 붙인다.** 9분할 화면이어도 엔진 1개 / 뷰포트 9개다.

> <span class="co co-warning">⚠️ 주의 `engine.resize()` 는 전체 뷰포트에 영향을 준다</span>
> `resize(immediate, keepCamera)` 에서 `keepCamera=false` 면 **엔진에 붙은 모든 뷰포트**의 카메라가 초기화된다. 타일 하나가 리사이즈될 때 옆 타일의 확대/반전 상태까지 같이 날아간다. 상태를 엔진 밖에 따로 보관했다가 복구해야 한다.

### Viewport — 실제로 그리는 창

`<div>` 하나에 뷰포트 하나가 붙는다. cornerstone이 그 안에 `<canvas>` 를 만든다.

## 4. 최소 사용법

```ts
import { init, RenderingEngine, Enums, type Types } from '@cornerstonejs/core'

await init()                                   // 앱에서 한 번만

const engine = new RenderingEngine('engine')   // 앱에서 한 번만
engine.enableElement({
  viewportId: 'vp1',                           // 영숫자로. React useId()는 `:r0:` 라 그대로 못 쓴다
  type: Enums.ViewportType.STACK,
  element: divRef.current,                     // 크기가 0이면 아무것도 안 보인다
})

const viewport = engine.getViewport('vp1') as Types.IStackViewport
await viewport.setStack(imageIds, 0)           // 두 번째 인자 = 시작 인덱스
viewport.render()

// 정리
engine.disableElement('vp1')
```

조작 몇 가지:

```ts
await viewport.setImageIdIndex(3)                    // Stack scroll — 3번째 장으로
viewport.getCurrentImageIdIndex()                    // 지금 몇 번째인지
viewport.setProperties({ voiRange: { lower: -1000, upper: 200 } })  // Windowing
viewport.setProperties({ invert: true, colormap: { name: 'hsv' } }) // Invert / Colormap
viewport.setCamera({ flipHorizontal: true })         // Flip
viewport.resetCamera()                               // Reset camera
```

> <span class="co co-danger">🚨 위험 좌우 반전은 판독 오류로 이어진다</span>
> `flipHorizontal` 은 표시용 보정일 뿐이다. **실제 촬영 영상에 임의로 걸면 좌/우안이 뒤바뀌어 오진의 원인**이 된다. 목업·데모 자산 정렬 같은 명확한 용도가 아니면 쓰지 않는다.

React에서는 SSR을 꺼야 한다 (WebGL·Web Worker를 쓴다).

```tsx
const Viewer = dynamic(() => import('./Viewer'), { ssr: false })
```

## 5. 뷰포트 종류 — 무엇이 다른가

`Enums.ViewportType` 에 정의돼 있다. 갈리는 기준은 **입력 데이터의 모양**이다.

```
2D 낱장의 나열            3D 복셀 격자              특수 포맷
─────────────────        ─────────────────        ─────────────────
STACK                    ORTHOGRAPHIC             VIDEO
                         PERSPECTIVE              WHOLE_SLIDE
                         VOLUME_3D                ECG
```

### 전체 표 (v5 기준)

| ViewportType | 실제 클래스 | 데이터 | 언제 쓰나 |
|---|---|---|---|
| `STACK` | `StackViewport` | imageId 배열 | **가장 흔함.** X-ray, 안저, 내시경, CT를 한 장씩 넘겨 보기 |
| `ORTHOGRAPHIC` | `VolumeViewport` | 3D 볼륨 | MPR — 축상/관상/시상 단면. 평행 투영 |
| `PERSPECTIVE` | `VolumeViewport` | 3D 볼륨 | 원근 투영. 가상 내시경 같은 "안에서 보는" 화면 |
| `VOLUME_3D` | `VolumeViewport3D` | 3D 볼륨 | 볼륨 렌더링 — 덩어리를 통째로 3D로 |
| `VIDEO` | `VideoViewport` | 비디오 스트림 | 초음파 시네, 혈관조영 동영상 |
| `WHOLE_SLIDE` | `WSIViewport` | 타일 피라미드 | 디지털 병리 슬라이드 (기가픽셀급, 지도처럼 타일 로딩) |
| `ECG` | `ECGViewport` | 파형 | 심전도 |

> <span class="co co-note">📝 NOTE `*_NEXT` 타입은 직접 쓰지 않는다</span>
> `PLANAR_NEXT`, `VIDEO_NEXT` 등은 v5가 내부적으로 도입한 차세대 구현이다. `BaseRenderingEngine.NEXT_TYPE_REMAP` 이 `STACK`/`ORTHOGRAPHIC` → `PLANAR_NEXT` 처럼 알아서 바꿔치기한다. **코드에는 계속 `STACK` 을 쓰면 된다.**

### Stack vs Volume — 실질적인 차이

이 둘의 구분이 제일 중요하다.

|            | StackViewport     | VolumeViewport (ORTHOGRAPHIC) |
| ---------- | ----------------- | ----------------------------- |
| 데이터        | 2D 이미지 **N장의 목록** | 하나의 **3D 복셀 격자**              |
| 장끼리의 관계    | 없음. 그냥 순서         | 실제 3차원 위치로 정렬됨                |
| 로딩         | 보이는 장만 받으면 됨      | **전부 받아야** 볼륨이 완성됨            |
| 크기가 달라도 되나 | 된다 (한 장씩 독립)      | 안 된다 (격자가 균일해야 함)             |
| 임의 단면 자르기  | 불가                | 가능 (MPR)                      |
| 초기 비용      | 낮음                | 높음 (메모리·시간)                   |

핵심은 이렇다. **스택은 사진첩을 넘기는 것**이고, **볼륨은 식빵 덩어리를 아무 각도로나 썰어 보는 것**이다.

CT 200장을 스택으로 열면 촬영된 그 방향(축상)으로만 볼 수 있다. 같은 200장을 볼륨으로 만들면 옆에서 자른 단면(관상·시상)을 새로 계산해 낼 수 있다. 대신 200장이 다 도착할 때까지 기다려야 하고 메모리도 훨씬 많이 쓴다.

```ts
// 스택 — 낱장을 나열
const vp = engine.getViewport(id) as Types.IStackViewport
await vp.setStack(imageIds, 0)

// 볼륨 — 3D 격자를 만들고 방향을 정해서 본다
const volume = await volumeLoader.createAndCacheVolume('vol1', { imageIds })
volume.load()
const vp3d = engine.getViewport(id) as Types.IVolumeViewport
await vp3d.setVolumes([{ volumeId: 'vol1' }])
vp3d.setOrientation(Enums.OrientationAxis.AXIAL)
```

**단면 방향**은 `Enums.OrientationAxis` 로 정한다 — `AXIAL`(가로로 썰기), `CORONAL`(정면에서 썰기), `SAGITTAL`(옆에서 썰기), `ACQUISITION`(촬영된 그대로).

### 그래서 뭘 골라야 하나

- **안저·X-ray·내시경 등 2D 촬영** → `STACK`. 고민할 것 없다
- **CT/MRI를 한 장씩만 넘겨 봄** → `STACK` 으로 충분하다. 볼륨은 과하다
- **CT/MRI를 여러 방향 단면으로 봐야 함** → `ORTHOGRAPHIC`
- **3D 입체로 보여줘야 함** → `VOLUME_3D`
- **동영상/병리 슬라이드** → `VIDEO` / `WHOLE_SLIDE`

> <span class="co co-tip">💡 TIP 스택으로 시작하고, 필요할 때 볼륨으로</span>
> `utilities.convertVolumeToStackViewport` 같은 전환 헬퍼가 있다. 처음부터 볼륨으로 갈 이유는 대개 없다.

## 6. 자주 밟는 함정

- **엔진은 하나** — 뷰포트마다 만들면 WebGL 컨텍스트가 금방 마른다
- **`engine.resize(_, false)` 는 전 뷰포트 카메라를 초기화** — 확대·반전 상태가 옆 타일까지 날아간다
- **크기 변화를 자동 추적하지 않는다** — `ResizeObserver` + `engine.resize()` 를 직접 붙인다
- **한 스택에 같은 imageId를 두 번 넣지 말 것** — 로딩 완료 후 `imageIds.indexOf(imageId)` 로 위치를 되찾아 현재 인덱스와 대조하는데, 중복이면 항상 첫 번째를 가리켜서 **뒤쪽 장이 아무 오류 없이 안 그려진다**
- **로더 반환값은 `{ promise }`** — Promise 자체가 아니다
- **첫 렌더가 검게 나오는 하드웨어가 있다** → [Cornerstone3D 첫 렌더 검은 화면 (Apple GPU · ANGLE Metal)](/log/cornerstone3d-black-first-render/)
- **`<div>` 크기가 0이면 아무것도 안 보인다** — 부모 레이아웃부터 확인

> <span class="co co-danger">🚨 위험 DICOM 헤더에는 환자 식별정보가 들어 있다</span>
> `PatientName`·`PatientID`·`StudyDate` 가 파일에 그대로 박혀 있다. 브라우저에서 열어 보는 건 괜찮지만, **저장·전송 전에는 서버에서 태그를 제거하고 비식별 이미지로 변환**해야 한다.

## 관련 노트

- [Cornerstone3D 로 JPG·PNG 까지 렌더링하기](/log/cornerstone3d-custom-image-loader/)
- [Cornerstone3D 첫 렌더 검은 화면 (Apple GPU · ANGLE Metal)](/log/cornerstone3d-black-first-render/)
