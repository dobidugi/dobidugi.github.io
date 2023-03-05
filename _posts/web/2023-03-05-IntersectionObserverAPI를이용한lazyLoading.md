---
title: Intersection Observer API를 이용한 lazy loading
layout: story
category: web
tags: ["web","html","react"]
---
웹 페이지에 접속하면 무수히 많은 리소스를 다운받는걸 볼 수 있다.
이 중에서 이미지와 비디오같은 리소스는 텍스트형식 리소스보다 크기가 상대적으로 크다.
만약 사용자가 웹 페이지에 접속하여 많은 이미지, 비디오 리소스를 다운받았는데 사용자가 다운받은 리소스들을 모두 보지 않고 페이지를 떠나버리면 엄청난 낭비가 되어버린다.

# lazy loading
이런 낭비를 조금이나마 막기위해 만들어진것이 lazy loading 기법이다.
lazy loading기법은 리소스 중요성을 식별하고 필요한경우에만 로드해 페이지 로드 시간을 단축 시킬 수 있다.
나는 이미지 리소스에 lazy loading기법을 적용해 보았다.

# lazy loading 적용 이전
먼저 lazy loading기법을 사용하기전 어떤상황이 발생하는지 살펴보자.
아래 컴포넌트는 `https://picsum.photos/v2/list`로부터 이미지 리소스 URL들을 받아와 이미지를 화면에 뿌려주는 컴포넌트이다.
```tsx
//App.tsx
import React, { useEffect, useState } from 'react';

interface ImgType {
  download_url: string;
  id: string;
}

export default function App() {
  const [imgs, setImages] = useState<ImgType[]>([]);
  useEffect(() => {
    fetch("https://picsum.photos/v2/list")
      .then((res) => res.json())
      .then((res) => setImages(res));
  }, []);
  return (
    <div className="App">
      <ul>
        {
          imgs &&
          imgs.map((img) => (
            <img src={img.download_url} alt="" />
          ))
        }
      </ul>
    </div>
  );
}
```

![r1](/assets/lazyloading/r1.gif)
사진을보면 화면에는 첫번째 이미지만 표시되는데 현재 표시되지않은 나머지 이미지까지 받아오는걸 볼 수 있다.
img 태그같은경우 src속성에 값이 들어가있으면 브라우저는 바로 해당 URL에서 이미지를 가져와 페이지에 삽입하기때문이다.
위처럼 수 많은 이미지들을 받아왔지만 사용자가 그대로 페이지를 떠나버리게 된다면 자원을 엄청나게 낭비하게 되버리기때문에 lazy loading기법을 적용해보자

# lazy loading 적용 해보기
적용하는 방법은 여러가지가 있다고 하지만 나는 `Intersection Observer API`를 이용해서 구현했다.
## Intersection Observer API
Intersection Observer API 같은경우 대상 요소와 상위 요소, 또는 대상 요소와 최상위 문서의 뷰포트가 서로 교차하는 영역이 달라지는 경우 이를 비동기적으로 감지할 수 있는 수단을 제공한다고 한다.
한마디로 해당 요소가 현재 뷰포트 즉 사용자 화면에 보이고 있는지 감지 할 수 있는 수단을 제공한다는거다.

## Intersection Observer 생성하기
Intersection observer를 생성하기 위해서는 생성자 호출 시 콜백 함수와 몇가지 옵션들을 제공해야 한다. 
이 콜백 함수는 threshold가 한 방향 혹은 다른 방향으로 교차할 때 실행된다고 [mdn](https://developer.mozilla.org/ko/docs/Web/API/Intersection_Observer_API#intersection_observer_%EC%9D%98_%EC%BB%A8%EC%85%89%EA%B3%BC_%EC%82%AC%EC%9A%A9) 문서에 적혀있다.
```js
let options = {
  root: document.querySelector('#scrollArea'),
  rootMargin: '0px',
  threshold: 1.0
}

let observer = new IntersectionObserver(callback, options);
```
options값은 observer 콜백이 호출되는 상황을 조작할 수 있고 아래와 같은 필드를 가진다.

- root: 대상 객체의 가시성을 확인할 때 사용되는 뷰포트 요소이다 이는 대상 객체의 조상 요소여야만함 
기본값은 브라우저 뷰포트이며, root 값이 null 이거나 지정되지 않을 때 기본값으로 설정됨.

- rootMargin: root 가 가진 여백 이 속성의 값은 CSS의 margin 속성과 유사하다.

- threshold: observer의 콜백이 실행될 대상 요소의 가시성 퍼센티지를 나타내는 단일 숫자 혹은 숫자 배열 만일 50%만큼 요소가 보여졌을 때를 탐지하고 싶다면 0.5로 설정하면됨
기본값은 0이며이는 요소가 1픽셀이라도 보이자 마자 콜백이 실행됨을 의미한다.

## 내 코드에 적용해보기
이제 내 코드에 Intersection Observer를 적용해보려한다.
나는 일단 img 태그에 직접 IntersectionObserver를 거는게 아닌 이미지와 같은 크기의 div태그에 observer를 걸고 사용자 뷰표트에 div태그가 보이고있는게 감지가된다면 div태그를 img태그로 변경해주는 코드를 작성할 것이다.

```tsx
//App.tsx
import React, { useEffect, useState } from 'react';
import Img from './Img';

interface ImgType {
  download_url: string;
  id: string;
}

export default function App() {
  const [imgs, setImages] = useState<ImgType[]>([]);
  useEffect(() => {
    fetch("https://picsum.photos/v2/list")
      .then((res) => res.json())
      .then((res) => setImages(res));
  }, []);
  return (
    <div className="App">
        <ul>
         {
          imgs &&
          imgs.map((img: ImgType) => (
            <Img
              key={img.id}
              src={img.download_url}
            />
          ))
        }
        </ul>
    </div>
  );
}
```
위 App.tsx 코드와 달라진점은 Img라는 컴포넌트를 새로 만든것 뿐이다.

```tsx
//Img.tsx
import { useCallback, useEffect, useRef, useState } from "react";
interface props {
    src: string;
}
export default function Img({ src }: props) {
    const [isShown, setIsShown] = useState<boolean>(false);
    // 실제 화면에 보여지고 있는지 여부를 확인
    const divRef = useRef<HTMLDivElement>(null);
    // div 태그 요소
    const observer = useRef<IntersectionObserver>();
    // IntersectionObserver 변수

    // IntersectionObserver Callback
    const intersectionObserverCallback =
        useCallback((entries: IntersectionObserverEntry[], io: IntersectionObserver) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) { // 관찰되고 있는 entry가 보여지게 된 다면
                    io.unobserve(entry.target); // 관찰 종료
                    setIsShown(true); // 로딩 체크
                    console.log("show")
                }
            })
        }, []);

    useEffect(() => {
        observer.current =
            new IntersectionObserver(intersectionObserverCallback, {
                root: null, // 루트 요소를 지정하지 않으면 브라우저의 뷰포트
                rootMargin: "0px", // 루트 요소의 margin값
                threshold: 0, // 관찰 대상이 루트 요소와 얼마나 겹쳐져 있는지를 나타내는 값
            });
        divRef.current && observer.current.observe(divRef.current); // div 태그 관찰 시작
    }, [intersectionObserverCallback])

    return (
        <li>
            {
                isShown ?
                    <img src={src} alt="" style={{ width: '100%', height: '100%' }} />
                    :
                    <div className="dummy" ref={divRef} style={{ minWidth: '100%', minHeight: '100%' }}>
                    </div>
            }
        </li>
    )
}
```
나는 Observer생성시 threshold값을 0설정해 div태그가 뷰포트에 1px이라도 보이게된다면 observer가 작동되게하였다.

# 결과
![r2](/assets/lazyloading/r2.gif)
결과를 확인해보면 처음과 다르게 사용자에게 보이는 부분의 이미지만 다운받아서 보여주는걸 볼수가있다.














