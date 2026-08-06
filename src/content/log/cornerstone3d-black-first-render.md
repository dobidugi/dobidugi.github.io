---
title: "Cornerstone3D 첫 렌더 검은 화면 (Apple GPU · ANGLE Metal)"
date: 2026-08-05
category: "FE"
tags: ["troubleshooting","프론트엔드","Cornerstone3D","WebGL","의료영상"]
description: "Cornerstone3D 뷰포트가 첫 렌더에서만 통째로 검게 나오는 현상. render()·resize()를 같은 크기로 몇 번 불러도 안 살아나고, 캔버스 크기가 실제로 바뀔 때만 복구된다. 마운…"
minutes: 7
---
> <span class="co co-abstract">📋 요약 한 줄 요약</span>
> Cornerstone3D 뷰포트가 **첫 렌더에서만** 통째로 검게 나오는 현상. `render()`·`resize()`를 같은 크기로 몇 번 불러도 안 살아나고, **캔버스 크기가 실제로 바뀔 때만** 복구된다. 마운트 직후 폭을 1px 왕복시켜 오프스크린 GL 표면을 강제 재생성하면 해결. 셋업은 [Cornerstone3D 로 JPG·PNG 까지 렌더링하기](/log/cornerstone3d-custom-image-loader/).

## 증상

- 뷰포트는 정상적으로 생성됨 (`getViewports().length === 1`, actor 1개, imageId 정상)
- 온스크린 캔버스 크기도 정상 (`1044x598`)
- 그런데 픽셀이 전부 0 — 화면은 검은 사각형
- 콘솔에 에러 **없음**. `CornerstoneRender: using GPU rendering` 로그만 찍힘

에러가 안 나기 때문에 "로딩 중"·"렌더 실패"·"정상인데 검은 영상"이 구분되지 않는다.

## 재현 환경

| 항목 | 값 |
|---|---|
| GPU | `ANGLE (Apple, ANGLE Metal Renderer: Apple M5)` |
| 브라우저 | Chrome (실제 GPU 사용) |
| 라이브러리 | `@cornerstonejs/core` v5 |
| 렌더링 모드 | `RenderingEngineModeEnum.ContextPool` (v5 기본값) |

> <span class="co co-warning">⚠️ 주의 헤드리스에서는 재현되지 않는다</span>
> `--headless=new --disable-gpu` 로 띄운 Chrome은 **SwiftShader(소프트웨어 렌더러)** 로 동작해서 이 버그가 안 나온다.
> CDP 스크린샷으로만 검증하면 "잘 되는데요?" 가 되고 실제 사용자만 검은 화면을 본다.
> WebGL이 얽힌 문제는 반드시 **GPU를 쓰는 헤드풀 Chrome**(`--remote-debugging-port` 만 주고 `--headless` 없이)으로 확인할 것.

## 원인 규명

Cornerstone3D는 오프스크린 WebGL 캔버스에 그린 뒤 뷰포트별 2D 캔버스로 복사한다.

```
vtk.js (offscreen WebGL canvas)
   └─ renderWindow.render()
        └─ onScreenContext.drawImage(offScreenCanvas, ...)   ← 여기로 복사
```

이 하드웨어에서는 **처음 잡힌 오프스크린 표면이 빈 채로 남는다.** 무엇이 복구시키는지 하나씩 분리해서 확인:

| 시도 | 캔버스 결과 |
|---|---|
| 최초 렌더 | `1044x598` → 유효 픽셀 **0** |
| `engine.resize(true, false)` (같은 크기) | 0 |
| `viewport.render()` 재호출 | 0 |
| `engine.renderViewport(id)` 재호출 | 0 |
| **부모 폭을 600px로 변경** | `600x598` → **205** ✅ |

즉 **호출 횟수의 문제가 아니라 크기 변화 유무의 문제**다.

`ContextPoolRenderingEngine._resizeOffScreenCanvasForViewport()` 가
`updateViewportSize()` 결과가 바뀌지 않으면 곧바로 early-return 하기 때문에,
같은 크기로는 오프스크린 표면이 절대 다시 만들어지지 않는다.

## 해결

### 1. 마운트 직후 폭 1px 왕복 (핵심)

```ts
function forceOffscreenRebuild(el: HTMLElement, resize: () => void) {
  const width = el.clientWidth
  if (!width) return

  el.style.width = `${width - 1}px`
  resize()
  requestAnimationFrame(() => {
    el.style.width = ''
    resize()
  })
}

// setStack() 이 resolve 된 뒤
viewport.render()
forceOffscreenRebuild(el, () => engine.resize(true, false))
```

한 프레임 안에 끝나고 그 시점 화면은 어차피 검은 배경이라 눈에 띄지 않는다.

### 2. ResizeObserver 로 크기 변화 추적

Cornerstone은 요소 크기 변화를 자동으로 따라가지 않는다. N분할 전환·창 크기 변경 때
`engine.resize()` 를 안 걸면 **늘어난 캔버스에 옛 카메라가 남아 영상이 타원으로 찌그러진다.**

```ts
const observer = new ResizeObserver(() => {
  if (disposed) return
  engine.resize(true, false)   // (immediate, keepCamera)
})
observer.observe(el)
```

### 3. GPU 렌더 자체 검증 → 실패 시 CPU 폴백

Cornerstone의 `init()` 은 **WebGL이 아예 없을 때만** CPU로 떨어진다
(`capabilities.webgl` 검사). "GPU는 잡히는데 결과가 안 나오는" 경우는 못 잡는다.

그래서 화면 밖에 32×32 뷰포트를 만들어 흰 영상을 한 장 그려보고 판정한다:

```ts
const probe = new RenderingEngine('gpu-probe')
probe.enableElement({ viewportId: 'probe', type: Enums.ViewportType.STACK, element: host })
const vp = probe.getViewport('probe') as Types.IStackViewport
await vp.setStack([WHITE_8x8_IMAGE_ID])

// render() 는 다음 프레임에 그린다 — 실제로 그려질 때까지 기다린다
await new Promise<void>((resolve) => {
  const done = () => { host.removeEventListener(Enums.Events.IMAGE_RENDERED, done); resolve() }
  setTimeout(done, 1500)
  host.addEventListener(Enums.Events.IMAGE_RENDERED, done)
  vp.render()
})

if (!hasVisiblePixels(vp.canvas)) {
  setUseCPURendering(true)   // 이미 떠 있는 뷰포트도 함께 갱신된다
}
```

- `setUseCPURendering(status, updateViewports = true)` 는 **기존 뷰포트의 렌더링 파이프라인까지 교체**해 준다
- 판정 불가(2D 컨텍스트를 못 얻음 등)일 때는 **멀쩡한 GPU를 괜히 내리지 않도록 통과** 처리
- CPU 렌더링 경로는 같은 하드웨어에서 정상 동작함을 확인함 (폴백이 실효성 있음)

## 디버깅 요령

### 개발 모드에서 엔진을 window에 노출

```ts
if (process.env.NODE_ENV !== 'production') {
  ;(window as unknown as { __csEngine?: RenderingEngine }).__csEngine = engine
}
```

콘솔에서 `__csEngine.getViewports()[0]` 으로 `sWidth`/`sHeight`/`canvas`/`getActors()` 를 바로 확인할 수 있다.
"이미지 로딩이 실패한 건지, 그려놓고 안 보이는 건지"가 여기서 갈린다.

### 캔버스 픽셀 직접 세기

`getImageData` 로 유효 픽셀을 세면 "검다"를 숫자로 만들 수 있다. 스크린샷 눈대중보다 훨씬 빠르다.

```js
[...document.querySelectorAll('canvas')].map((c) => {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
  let n = 0
  for (let i = 0; i < d.length; i += 4000) if (d[i] > 10 || d[i+1] > 10 || d[i+2] > 10) n++
  return `${c.width}x${c.height}:${n}`
})
```

### 로딩 폴백을 검게 두지 말 것

`next/dynamic` 의 `loading` 을 검은 div로 두면 **청크 로딩 실패 / 렌더링 실패 / 정상 대기**가 전부 같은 그림이 된다.
문구를 넣어야 어디서 멈췄는지 구분된다.

```tsx
loading: () => (
  <div className="flex h-full w-full items-center justify-center bg-black">
    <span className="text-xs">영상 불러오는 중…</span>
  </div>
)
```

`enableElement()` 도 던질 수 있으므로(WebGL 미지원·컨텍스트 소진) try/catch 로 잡아 화면에 표시한다.
안 잡으면 예외가 `useEffect` 밖으로 새서 React 트리가 통째로 죽는다.

## 교훈

1. **소프트웨어 렌더러로 한 검증은 WebGL 검증이 아니다.** 헤드리스 스크린샷이 초록불이어도 실제 GPU에서는 다를 수 있다.
2. 증상이 "검은 화면"이면 **어느 단계에서 검어지는지**부터 분리한다 — 이미지 로드 / 액터 생성 / 렌더 / 오프스크린→온스크린 복사.
3. 라이브러리 API를 반복 호출해도 안 되면 **호출이 아니라 상태 변화가 트리거**인지 의심한다. 여기서는 "크기가 바뀌어야만" 이었다.

## 관련 노트

- [Cornerstone3D 시작하기 — 개념·기본 사용법·뷰포트 종류](/log/cornerstone3d-getting-started/)
- [Cornerstone3D 로 JPG·PNG 까지 렌더링하기](/log/cornerstone3d-custom-image-loader/)
