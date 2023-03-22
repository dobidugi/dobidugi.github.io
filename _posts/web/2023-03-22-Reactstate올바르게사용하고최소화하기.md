---
title: React state 올바르게 사용하고 최소화하기
layout: story
category: web
tags: ["web","html","react"]
---
React state는 컴포넌트에 대한 데이터나 정보를 포함하고, 컴포넌트의 동작을 제어하는 데 사용된다.
그렇다고해서 컴포넌트에 대한 모든 데이터나 정보를 state로 관리할 필요도 없고 관리해서는 안된다.
state를 잘못 사용하게되면 버그를 유발해 서비스가 원하는대로 동작하지 않을수 있고 성능적으로 문제가 될 수 있기때문에 올바르게 사용해야한다.

이 글은 컴포넌트 내에서의 state를 최소화하고 올바르게 사용하는법에 대해 적었으며 해당 [공식문서](https://ko.reactjs.org/docs/thinking-in-react.html#step-3-identify-the-minimal-but-complete-representation-of-ui-state)를 참고했다.

# 어느값을 state로 관리해야할까?
state를 올바르게 사용하기위해서는 state가 변경되면 어떤일이 발생되고 언제사용해야하는지 알아야한다.

## state가 변경되면 발생되는 일
React 컴포넌트가 리 랜더링되는 상황이 여러가지가 있는데 그중 하나가 state값이 바뀌면 리 랜더링 된다는것이다.
이때 state는 반드시 setState()를 이용해 변경해야지만 React가 감지를해서 해당 컴포넌트를 리 랜더링한다.

## 언제 state를 사용해야하는가?
컴포넌트내 데이터가 지속적으로 변경되거나 화면에 그려진 값을 갱신해주고싶을때 state를 사용하는게 적절하다.

# state 올바르게 사용하고 최소화하기

## 1. 부모로부터 props을 통해 전달되는 값
React에서 개발하다보면 부모컴포넌트에서 자식컴포넌트로 값을 보내주는 경우가 자주 발생한다. 
이때 자식 컴포넌트는 부모에게서 받은 값을 다시 state로 만들필요는 없다.
```js
// bad
import React, { useState } from 'react';

function View({ value }) {
  const [newValue] = useState(value);
  return <div>{newValue}</div>;
}

function App() {
  const [value, setValue] = useState(0);
  return (
    <div className="App">
      <View value={value} />
      <button onClick={() => setValue(value + 1)}>Increment</button>
    </div>
  );
}

export default App;
```
```js
// good
import React, { useState } from 'react';

function View({ value }) {
  return <div>{value}</div>;
}

function App() {
  const [value, setValue] = useState(0);
  return (
    <div className="App">
      <View value={value} />
      <button onClick={() => setValue(value + 1)}>Increment</button>
    </div>
  );
}

export default App;

```

부모 컴포넌트 value state가 변경되면 자식 컴포넌트도 리 랜더링 되기때문에 View 컴포넌트에서 props값을 다시 state로 만들필요는 없다.

## 2. 시간이 지나도 변하지 않는값
시간이 지나도 절대로 변하지 않는 값은 state로 관리할 필요 없다.
당연한 이야기지만 시간이 지나도 변하지 않는다는 것은 그 값으로 인해 화면을 다시 그릴 일은 없고 리 랜더링할 필요가 없다는 것이다. 이러한값을 state로 관리하는 걸 지양해야 한다.
```js
// bad
import React, { useState } from 'react';

function App() {
  const [title, setTitle] = useState('Title!!');
  return (
    <div className="App">
      <h1>{title}</h1>
    </div>
  );
}

export default App;
```
```js
// good
import React, { useState } from 'react';

function App() {
  const title = "Title!!";
  return (
    <div className="App">
      <h1>{title}</h1>
    </div>
  );
}

export default App;
```

## 3. 컴포넌트 안의 다른 state나 props를 가지고 계산할 수 있는 값
기존에 있는 state값이나 props값들로 계산이 가능한값이라면 state로 관리할 필요가 없다.
```js
// bad
import React, { useState } from 'react';

function App() {
  const [value, setValue] = useState('');
  const [flag, setFlag] = useState(false);
  const onChange = (e) => {
    setValue(e.target.value);
    if(e.target.value>=3) {
      setFlag(() => true);
    }
    else {
      setFlag(() => false);
    }
  }
  return (
    <div className="App">
      <input
        type="text"
        value={value}
        onChange={onChange}
        />
      {flag ? 
      <p style={{ color: "green"}}>유효하다</p>
      : 
      <p style={{ color: "red"}}>유효하지 않다</p>
      }
    </div>
  );
}

export default App;
```
위 코드는 입력값이 변경될때마다 onChange함수를 호출하고 값이 3글자 이상이면 flag값을 변경해 유효하다 라는 문구를 출력해주는 코드이지만. 원하는대로 동작하지않고 flag값을 불필요하게 state로 관리할 필요가없다.

그 이유는 value값이 변경되면 어차피 컴포넌트는 리 랜더링되고 flag값은 변경된 value state로 충분히 계산할 수 있기 떄문에 위 코드 처럼 flag를 state값으로 줄 필요는 없다.
```js
// good
import React, { useState } from 'react';

function App() {
  const [value, setValue] = useState('');
  const flag = value.length >= 3;
  const onChange = (e) => {
    setValue(e.target.value);
  }
  return (
    <div className="App">
      <input
        type="text"
        value={value}
        onChange={onChange}
        />
      {flag ? 
      <p style={{ color: "green"}}>유효하다</p>
      : 
      <p style={{ color: "red"}}>유효하지 않다</p>
      }
    </div>
  );
}

export default App;
```



























