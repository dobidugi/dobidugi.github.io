---
title: "Cornerstone3D 로 JPG·PNG 까지 렌더링하기"
date: 2026-08-05
category: "FE"
tags: ["프론트엔드","Cornerstone3D","DICOM","WebGL","의료영상"]
description: "Cornerstone3D는 DICOM 로더만 기본으로 준다. JPG·PNG를 같은 뷰어에서 보려면 이미지 로더(주소 → 픽셀)와 메타데이터 프로바이더(이 영상이 몇 픽셀인지) 두 개를 직접 등록해야…"
minutes: 16
---
> <span class="co co-abstract">📋 요약 한 줄 요약</span>
> Cornerstone3D는 DICOM 로더만 기본으로 준다. JPG·PNG를 같은 뷰어에서 보려면 **이미지 로더**(주소 → 픽셀)와 **메타데이터 프로바이더**(이 영상이 몇 픽셀인지) 두 개를 직접 등록해야 한다. 둘 다 붙이면 DICOM이든 JPG든 **imageId 문자열만 다르고 나머지 코드는 완전히 같아진다.**

전제 개념(imageId·로더·엔진·뷰포트)은 [Cornerstone3D 시작하기 — 개념·기본 사용법·뷰포트 종류](/log/cornerstone3d-getting-started/) 에 있다. 이 노트는 그중 **로더를 직접 만드는 부분**만 깊게 다룬다.

## 1. 왜 JPG까지 cornerstone으로 그리나

의료영상 화면에는 보통 두 종류가 섞인다. 기기에서 나온 DICOM과, 그걸 변환해 둔 JPG(썸네일·비식별 저장본·목업 샘플)다. 자연스럽게 이런 코드가 나온다.

```tsx
{image.isDicom ? <CornerstoneView … /> : <img src={image.url} />}
```

당장은 잘 돌아간다. 문제는 **기능을 붙일 때마다 두 벌씩 만들어야 한다**는 것이다.

| 기능                        | `<img>` 경로                | cornerstone 경로                  |
| ------------------------- | ------------------------- | ------------------------------- |
| **Grayscale** (회색조)       | CSS `filter: grayscale()` | VOI / colormap                  |
| **Zoom · Pan** (확대·이동)    | transform 직접 구현           | 카메라                             |
| **Windowing** (밝기·대비)     | 불가                        | 기본 제공                           |
| **Measurement** (길이 계측)   | 불가                        | 도구 제공                           |
| **Flip** (좌우 반전)          | CSS `scaleX(-1)`          | `setCamera({ flipHorizontal })` |

"회색조 토글"을 넣는다고 하면 한쪽은 CSS로, 한쪽은 VOI로 두 번 구현해야 한다. 두 결과가 미묘하게 다른 것도 문제고(CSS 회색조는 sRGB 가중 평균, VOI는 픽셀 값 기반), 나중에 확대 기능을 추가하면 `<img>` 쪽은 처음부터 다시 만들어야 한다.

**경로를 하나로 합치면 분기가 imageId 문자열 하나로 줄어든다.**

```
업로드한 DICOM   →  dicomfile:0          (기본 제공 wadouri 로더)
업로드한 JPG/PNG →  web:blob:…           (직접 만든 로더)
서버의 JPG       →  web:https://…/a.jpg  (직접 만든 로더)
                          ↓
                   똑같은 StackViewport
```

컴포넌트는 `csImageIds` 문자열 배열만 받는다. 나중에 회색조를 CSS에서 VOI로 옮겨도 **컴포넌트를 안 건드린다.**

## 2. imageId 스킴이 하는 일

`imageId` 는 `스킴:나머지` 형태의 문자열인데, 앞의 스킴이 **어떤 로더를 호출할지 정하는 라우팅 키**다. URL의 `https:` 와 같은 역할이다.

```
web:https://cdn.example.com/a.jpg
└─┬─┘└──────────────┬──────────────┘
스킴          로더에게 넘어갈 나머지
```

cornerstone은 `:` 앞을 떼어내 등록된 로더 표에서 찾는다. `wadouri` 는 DICOM 로더가 이미 선점했고, `web` 은 아무도 안 쓰므로 우리가 등록하면 된다. 스킴 이름 자체에 의미는 없다 — `myapp` 이라 해도 동작한다.

## 3. 이미지 로더 등록

로더는 imageId를 받아 **`{ promise }` 객체**를 반환한다. Promise를 그대로 반환하면 안 된다.

```ts
import { imageLoader, type Types } from '@cornerstonejs/core'

imageLoader.registerImageLoader('web', (imageId: string) => {
  const promise = new Promise<Types.IImage>((resolve, reject) => {
    const el = new Image()
    // 다른 도메인 이미지를 캔버스로 읽으려면 필요하다. 없으면 캔버스가 오염(tainted)돼서
    // getImageData() 가 보안 예외를 던진다
    el.crossOrigin = 'anonymous'
    el.onload = () => resolve(toCornerstoneImage(el, imageId))
    el.onerror = () => reject(new Error(`이미지를 불러오지 못했습니다: ${imageId}`))
    // 첫 콜론 뒤가 실제 주소다. indexOf 를 쓰는 건 'https://' 안에도 콜론이 있어서
    // split(':') 로 자르면 URL이 망가지기 때문
    el.src = imageId.slice(imageId.indexOf(':') + 1)
  })

  return { promise }
})
```

> <span class="co co-note">📝 NOTE 왜 Promise를 객체로 한 번 감싸나</span>
> cornerstone은 **로딩을 취소할 수 있어야 하기 때문**이다. 사용자가 영상을 빠르게 넘기면 아직 안 끝난 요청을 버려야 하는데, 이때 cornerstone은 캐시에 저장해 둔 같은 객체의 `cancelFn()` 을 호출한다 (`imageLoader.js` 의 `cancelLoadImage`). Promise 하나만 반환하면 붙잡을 손잡이가 없다.
> 취소가 필요 없으면 `{ promise }` 만 줘도 되고, 필요하면 `cancelFn` 을 같이 넣는다.

## 4. 디코딩 결과를 IImage 로 감싸기

브라우저가 `<img>` 를 다 읽으면 캔버스에 그려서 픽셀을 꺼낼 수 있다. 이걸 cornerstone이 아는 형태(`IImage`)로 바꿔야 한다.

### 먼저 RGBA를 RGB로

캔버스는 항상 **RGBA 4채널**을 준다. 그런데 cornerstone에는 **RGB 3채널**로 넘긴다. 알파 채널을 빼는 건 의료영상에 투명도 개념이 없기 때문이고, 채널이 하나 줄면 GPU로 올리는 데이터도 25% 줄어든다.

```ts
const canvas = document.createElement('canvas')
canvas.width = columns
canvas.height = rows
const ctx = canvas.getContext('2d')!
ctx.drawImage(el, 0, 0)

const rgba = ctx.getImageData(0, 0, columns, rows).data
const rgb = new Uint8Array(rows * columns * 3)
for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
  rgb[j] = rgba[i]          // R
  rgb[j + 1] = rgba[i + 1]  // G
  rgb[j + 2] = rgba[i + 2]  // B
  // rgba[i + 3] (알파) 는 버린다
}
```

### VoxelManager 만들기

`VoxelManager` 는 **"픽셀 배열에서 (x, y) 값을 어떻게 꺼내는가"를 아는 객체**다. cornerstone v5는 픽셀 데이터를 직접 읽지 않고 항상 이걸 통해 접근한다. 2D 이미지든 3D 볼륨이든, 8비트든 16비트든 같은 방식으로 다루기 위한 추상화다.

```ts
const voxelManager = utilities.VoxelManager.createImageVoxelManager({
  width: columns,
  height: rows,
  numberOfComponents: 3,  // RGB 니까 3
  scalarData: rgb,
})
```

> <span class="co co-warning">⚠️ 주의 `voxelManager` 를 빠뜨리면 조용히 안 그려진다</span>
> v5에서는 `getPixelData` 만 넣어도 **에러 없이 그냥 빈 화면**이 나온다. 예전 버전 예제를 보고 따라 하면 여기서 막힌다.

### IImage 객체 조립

필드가 많아 보이지만 네 묶음이다.

```ts
return {
  imageId,

  // ① 이 픽셀이 어떤 형태인가
  color: true,              // 컬러 이미지 (흑백이면 false)
  rgba: false,              // 알파를 뺐으니 false
  numberOfComponents: 3,
  dataType: 'Uint8Array',

  // ② 크기 — columns/rows 와 width/height 를 둘 다 요구한다
  columns, rows,
  width: columns, height: rows,

  // ③ 픽셀 값 → 표시 밝기 변환 규칙
  intercept: 0, slope: 1,   // 값 보정 없음 (CT라면 HU 변환에 쓰인다)
  invert: false,
  minPixelValue: 0, maxPixelValue: 255,
  windowCenter: 128, windowWidth: 255,   // 0~255 전체를 그대로 표시
  voiLUTFunction: Enums.VOILUTFunctionType.LINEAR,

  // ④ 실제 물리 크기 (mm)
  columnPixelSpacing: 1, rowPixelSpacing: 1,

  sizeInBytes: rgb.byteLength,
  getPixelData: () => rgb,
  getCanvas: () => canvas,
  voxelManager,
} as unknown as Types.IImage
```

③이 낯설 텐데, **DICOM에서 온 개념**이다. CT는 픽셀 값이 -1000~3000 범위라 `windowCenter`/`windowWidth` 로 "어느 구간을 0~255로 펴서 보여줄지" 정해야 한다. JPG는 이미 0~255이므로 **전 구간을 그대로 통과시키는 값**(중심 128, 폭 255)을 넣어 아무 변환도 일어나지 않게 한다.

`slope`/`intercept` 도 같은 맥락이다. CT는 `실제값 = 픽셀값 × slope + intercept` 로 HU 단위를 복원하는데, JPG는 변환이 필요 없으니 `1`과 `0`을 넣어 항등식으로 만든다.

> <span class="co co-warning">⚠️ 주의 pixelSpacing 을 1로 두면 계측 수치는 의미가 없다</span>
> `columnPixelSpacing: 1` 은 "픽셀 하나가 1mm"라는 뜻이다. JPG에는 이 정보가 없어서 임의로 넣는 값이다. **화면 종횡비는 맞지만 자로 잰 길이는 전부 거짓**이 된다.
> 계측 기능을 붙일 거라면 촬영 기기별 실제 픽셀 간격을 받아 채워야 한다. 안 그러면 화면에 그럴듯한 숫자가 뜨는데 근거가 없다.

## 5. 메타데이터 프로바이더

로더만 등록하면 아직 안 그려진다. **뷰포트는 픽셀을 받기 전에 "이 영상 크기가 얼마고 비트심도가 뭐냐"를 먼저 물어보기** 때문이다. 로더는 이 질문에 답하지 않는다 — 별도의 프로바이더가 답한다.

질문은 낱개 항목이 아니라 **모듈** 단위로 온다. DICOM 표준이 태그를 주제별로 묶어 둔 단위를 그대로 쓴다.

| 모듈 | 뷰포트가 알고 싶은 것 |
|---|---|
| `imagePixelModule` | 픽셀이 몇 개고 몇 비트이며 컬러인가 |
| `imagePlaneModule` | 실제 물리 크기(mm)와 공간상 위치 |
| `voiLutModule` | 기본 밝기·대비 |
| `modalityLutModule` | 픽셀 값 → 실제 물리량 변환식 |
| `generalSeriesModule` | 촬영 종류(CT/MR/안저 등) |

```ts
metaData.addProvider((type: string, imageId: string) => {
  // ★ 내 스킴이 아니면 손대지 않는다
  if (typeof imageId !== 'string' || !imageId.startsWith('web:')) return undefined

  const size = sizes.get(imageId)   // 로더가 디코딩할 때 넣어둔 크기
  if (!size) return undefined
  const { rows, columns } = size

  if (type === 'imagePixelModule') return {
    photometricInterpretation: 'RGB', samplesPerPixel: 3, samples: 3,
    pixelRepresentation: 0, planarConfiguration: 0,
    rows, columns, bitsAllocated: 8, bitsStored: 8, highBit: 7,
  }
  if (type === 'imagePlaneModule') return { rows, columns, pixelSpacing: [1, 1] /* … */ }
  if (type === 'voiLutModule') return { windowWidth: [255], windowCenter: [128] }
  if (type === 'modalityLutModule') return { rescaleSlope: 1, rescaleIntercept: 0 }
  if (type === 'generalSeriesModule') return { modality: 'OP' }  // Ophthalmic Photography
  return undefined
}, 10000)
```

> <span class="co co-danger">🚨 위험 남의 imageId에 답하면 DICOM 뷰어가 망가진다</span>
> 프로바이더는 **우선순위대로 줄 세워 놓고 하나씩 물어보다가, `undefined` 가 아닌 값이 나오면 거기서 멈춘다.** 우선순위를 `10000` 으로 높게 준 우리 프로바이더가 `wadouri:` imageId에도 아무 값이나 반환하면, **뒤에 있는 DICOM 프로바이더는 영영 호출되지 않는다.** 그러면 CT가 8비트 RGB로 잘못 해석돼 화면이 이상해진다.
> 첫 줄의 스킴 검사가 이 노트에서 제일 중요한 한 줄이다.

크기는 어떻게 아느냐 — **로더가 이미지를 디코딩하는 시점에 기록해 둔다.** 프로바이더는 동기 함수라 그 자리에서 이미지를 열어볼 수 없기 때문이다.

```ts
const sizes = new Map<string, { rows: number; columns: number }>()
// 로더 안에서: sizes.set(imageId, { rows: el.naturalHeight, columns: el.naturalWidth })
```

> <span class="co co-note">📝 NOTE 순서가 보장되는 이유</span>
> 뷰포트는 항상 **로딩 완료 후**에 메타데이터를 묻는다. 그래서 프로바이더가 불릴 때는 `sizes` 에 값이 이미 들어 있다.

## 6. Next.js 설정 두 가지

### WASM 코덱의 Node 분기 끄기

cornerstone은 JPEG2000·JPEG-LS 같은 의료영상 전용 압축을 풀려고 C 라이브러리(charls, openjpeg, libjpeg-turbo)를 WebAssembly로 컴파일해 쓴다. emscripten이 만든 이 글루 코드는 **브라우저와 Node 양쪽에서 돌도록** 쓰여 있어서, 파일 시스템에서 `.wasm` 을 읽는 Node용 분기가 들어 있다.

브라우저에서는 실행되지 않는 죽은 코드지만, **번들러는 `require('fs')` 를 보고 모듈을 찾다가 빌드를 실패시킨다.** 그래서 "그런 모듈 없음"으로 처리하라고 알려준다.

```ts
// next.config.ts
webpack: (config) => {
  config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false }
  return config
},
```

### SSR 끄기

뷰어는 WebGL 컨텍스트와 Web Worker를 쓴다. 서버에는 둘 다 없으므로 서버 렌더링을 하면 죽는다.

```tsx
const CornerstoneView = dynamic(() => import('./CornerstoneView').then((m) => m.CornerstoneView), {
  ssr: false,
  loading: () => <div className="…">영상 불러오는 중…</div>,
})
```

> <span class="co co-tip">💡 TIP `loading` 을 검은 `<div>` 로 두지 말 것</span>
> 뷰어 배경도 검은색이라, 로딩 중인지 렌더링에 실패한 건지 구분이 안 된다. 실제로 이 때문에 헛디버깅을 했다.

## 7. 렌더링 엔진은 앱 전체에 하나

브라우저는 한 페이지가 쓸 수 있는 WebGL 컨텍스트 수를 제한한다(보통 8~16개). 한도를 넘으면 브라우저가 **오래된 컨텍스트부터 강제로 회수**해서, 먼저 띄운 화면이 갑자기 검게 변한다.

엔진 하나가 컨텍스트 하나를 잡으므로 **엔진은 하나만 만들고 뷰포트를 여러 개 붙인다.** 9분할이어도 뷰포트 9개 / 엔진 1개다.

```ts
engine.enableElement({ viewportId, type: Enums.ViewportType.STACK, element: el })
const viewport = engine.getViewport(viewportId) as Types.IStackViewport
await viewport.setStack([imageId])
viewport.render()

// 언마운트 시
engine.disableElement(viewportId)
```

React의 `useId()` 는 `:r0:` 형태라 그대로 쓰면 안 된다 — 영숫자만 남긴다.

```ts
const viewportId = `vp${useId().replace(/[^a-zA-Z0-9]/g, '')}`
```

## 8. DICOM 파일 업로드

사용자가 고른 DICOM은 서버를 거치지 않고 브라우저 메모리에서 바로 띄울 수 있다.

```ts
import { wadouri } from '@cornerstonejs/dicom-image-loader'

const imageId = wadouri.fileManager.add(blob)   // → 'dicomfile:0'
```

DICOM인지 아닌지는 **확장자가 아니라 매직바이트로 판별**한다. `.dcm` 확장자는 없는 경우도 많고, 반대로 아무 파일에나 붙일 수 있어서다.

```
파일 시작
├─ 0 ~ 127   preamble (128바이트, 보통 전부 0)
└─ 128 ~ 131 "DICM"   ← 이 4글자로 판별
```

```ts
const head = new Uint8Array(await blob.slice(128, 132).arrayBuffer())
const isDicom = String.fromCharCode(...head) === 'DICM'
```

> <span class="co co-danger">🚨 위험 DICOM 헤더에는 환자 식별정보가 들어 있다</span>
> `PatientName`·`PatientID`·`StudyDate` 같은 태그가 파일 안에 그대로 박혀 있다. **파일을 그대로 저장하면 식별정보를 같이 저장하는 것**이다.
> 저장·전송 전에 **서버에서 태그를 제거하고 비식별 이미지로 변환**해야 한다. 브라우저에서 지우는 건 신뢰할 수 없다 — 원본을 가진 클라이언트가 규칙을 지킨다는 보장이 없다.

## 9. 함정 모음

- **로더 반환값은 `{ promise }`** — Promise를 그대로 반환하면 동작하지 않는다 (취소용 손잡이가 필요해서)
- **`voxelManager` 없으면 에러 없이 빈 화면** — `getPixelData` 만으로는 부족하다
- **메타데이터 프로바이더에서 남의 imageId에 응답 금지** — `undefined` 를 반환해야 다음 프로바이더로 넘어간다
- **`crossOrigin = 'anonymous'` 없으면 캔버스가 오염된다** — 타 도메인 이미지에서 `getImageData()` 가 예외
- **pixelSpacing 을 1로 두면 계측 수치에 근거가 없다** — 표시하지 말거나 실제 값을 채운다
- **한 스택에 중복 imageId 금지** — 뒤쪽 장이 조용히 안 그려진다 (`imageIds.indexOf` 로 위치를 대조하기 때문)
- **요소 크기 변화를 자동 추적하지 않는다** — `ResizeObserver` + `engine.resize()` 를 직접 붙인다
- **첫 렌더가 검게 나오는 하드웨어가 있다** → [Cornerstone3D 첫 렌더 검은 화면 (Apple GPU · ANGLE Metal)](/log/cornerstone3d-black-first-render/)

## 관련 노트

- [Cornerstone3D 시작하기 — 개념·기본 사용법·뷰포트 종류](/log/cornerstone3d-getting-started/)
- [Cornerstone3D 첫 렌더 검은 화면 (Apple GPU · ANGLE Metal)](/log/cornerstone3d-black-first-render/)
