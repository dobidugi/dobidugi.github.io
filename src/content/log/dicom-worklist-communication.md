---
title: "DICOM Worklist 통신 이해하기"
date: 2026-10-12
category: "Dicom"
tags: ["dicom","mwl","worklist","pacs","network"]
description: "MWL은 C-FIND로 촬영 예약을 조회한다. TCP 연결, AE Title과 서비스 협상, 실제 검색 조건을 구분하면 요청과 응답의 구조를 이해할 수 있다."
minutes: 28
---
> <span class="co co-abstract">📋 요약 한 줄 요약</span>
> MWL은 C-FIND로 촬영 예약을 조회한다. TCP 연결, AE Title과 서비스 협상, 실제 검색 조건을 구분하면 요청과 응답의 구조를 이해할 수 있다.

이전 회사에서 WebPACS를 만들면서 Study 목록을 조회하고, 선택한 검사의 영상을 뷰어에 렌더링하는 기능을 구현했다.

이번에는 영상이 PACS에 저장되기 전, 촬영 장비에서 검사 정보를 조회하는 과정이 궁금해졌다.
CT나 MRI 장비는 촬영할 환자가 누구인지, 어떤 검사가 예약되어 있는지 어떻게 받아오는 걸까?

이때 사용하는 것이 Worklist다.
WebPACS에서 저장된 검사를 찾아 영상을 열었다면, 촬영 장비에서는 Worklist로 앞으로 수행할 검사와 환자 정보를 확인한다.
장비가 어떤 서버에 연결하고, 어떤 조건으로 목록을 요청하며, 응답으로 어떤 정보를 받는지 알아보고 싶어졌다.

목록을 조회한다는 점에서는 비슷해 보이는데, 이것도 C-FIND를 사용하는 걸까?

찾아보니 Worklist도 C-FIND로 조회한다. 다만 Study 목록과는 조회 대상이 다르고, 요청과 응답에 담는 정보도 다르다. 먼저 둘의 차이를 살펴보고, 장비가 서버에 연결해 예약 정보를 받아오기까지의 과정을 따라가 보자.

## Study List와 Modality Worklist는 무엇을 조회할까

이 글에서 Worklist는 **Modality Worklist, 줄여서 MWL**을 뜻한다. 영상의학과 의사의 판독 대기 목록처럼 제품 화면에서 Worklist라고 부르는 다른 목록과는 구분한다.

| 구분 | PACS의 Study List | Modality Worklist |
|---|---|---|
| 알고 싶은 것 | 저장된 검사에 어떤 것이 있는가 | 장비에서 수행할 검사가 무엇인가 |
| 결과의 기준 | Study 수준으로 조회한 검사 | Scheduled Procedure Step, 예약된 검사 수행 단계 |
| 검색 조건 예 | 환자 ID, 검사일, Study Instance UID | 환자 ID, 예약일, Modality, 배정 장비 |
| 선택 후의 흐름 | 영상을 가져와 뷰어에서 표시 | 환자·검사 정보를 장비에 적용하고 촬영 |
| 영상의 필요 여부 | 저장된 검사 데이터 기준 | 아직 촬영한 영상이 없어도 조회 가능 |

MWL은 환자와 촬영 예약 정보를 장비에 전달한다. 장비는 작업자가 선택한 항목의 정보를 이후 생성할 DICOM 영상에 반영할 수 있다. 결과 한 건은 예약된 검사 수행 단계이므로, 한 오더에 여러 단계가 있으면 여러 항목으로 나올 수 있다. [DICOM PS3.4 K.6](https://dicom.nema.org/medical/dicom/current/output/chtml/part04/sect_K.6.html)

예를 들어 흉부 CT 오더를 등록하고 촬영 시간과 장비를 배정하면, CT 장비는 MWL을 조회해 해당 예약을 선택한다.
촬영한 영상이 PACS에 저장되면 WebPACS에서 검사 목록을 조회하고 영상을 열 수 있다.

촬영과 저장이 진행 중인 Study도 목록에 나타날 수 있으므로 Study List를 반드시 촬영이 완료된 목록으로 볼 필요는 없다.

C-FIND 자체는 영상 픽셀을 가져오는 동작이 아니다. Study 조회든 MWL 조회든 검색 결과의 속성을 받는 것이고, 뷰어가 사용할 영상은 별도의 영상 조회·전송 과정을 거친다. [DICOM Query/Retrieve](https://dicom.nema.org/medical/dicom/current/output/chtml/part04/sect_C.4.html)

## AE Title은 세 가지 위치에서 만난다

AE Title은 DICOM 통신에 참여하는 애플리케이션 엔터티의 이름이다. 설명을 위해 CT 장비의 이름을 `CT_01`, MWL 서버의 이름을 `MWL_SERVER`라고 정하자. 실제 시스템에서는 한 물리 장비나 서버가 용도별로 여러 AE를 가질 수도 있다.

| 항목 | 예시 값 | 쓰이는 위치와 의미 |
|---|---|---|
| Calling AE Title | `CT_01` | 연결 요청을 보내는 쪽의 이름 |
| Called AE Title | `MWL_SERVER` | 연결하려는 상대의 이름 |
| Scheduled Station AE Title | `CT_01` | 검색할 검사 수행 단계에 배정된 장비 |

Calling과 Called는 **연결을 요청할 때** 사용한다. CT 장비가 “나는 CT_01이고 MWL_SERVER에 연결하고 싶다”라고 전달하는 정보다. 서버가 응답한다고 이 연결의 Calling과 Called가 서로 바뀌거나, 서버가 새 AE Title을 발급하는 것은 아니다. [DICOM PS3.8 7.1](https://dicom.nema.org/medical/dicom/current/output/chtml/part08/chapter_7.html)

Scheduled Station AE Title은 **예약을 검색할 때** 사용하는 태그다. “CT_01에 배정된 예약을 찾겠다”는 조건이다. 이 예시에서는 Calling AE Title과 같은 값을 쓰지만 두 항목의 용도는 다르다. 장비를 특정하지 않고 날짜나 환자 정보로 조회하는 것도 가능하다.

오더 화면에서도 사람이 `CT_01`을 직접 입력해야 하는 것은 아니다. 시스템에 `1번 검사실 CT → CT_01` 매핑을 등록해 두고, 검사실을 선택하면 예약 정보에 AE Title을 채우도록 구현할 수 있다. 오더 등록과 시간·장비 배정을 서로 다른 단계로 처리하는 구성도 가능하다. 이는 업무 시스템의 구현 예시이며, DICOM이 오더 화면의 입력 절차를 정하는 것은 아니다.

## 서버에 장비를 등록하는 것은 어떤 의미일까

장비에는 접속할 MWL 서버의 IP, 포트, AE Title을 설정한다. 서버 제품에 따라서는 `CT_01`을 허용할 원격 AE로 등록하고, 필요하면 장비 IP나 서비스별 허용 여부도 설정한다.

다만 **PACS 관리자 화면에서 모든 장비를 반드시 사전 등록해야 한다는 일률적인 표준 의무는 없다.**

연결 요청의 형식과 수락·거절 절차는 DICOM 규칙을 따르지만, 원격 AE를 등록하는 UI와 저장 방식, 사전 등록이 필요한 접근 정책은 제품과 운영 설정에 따라 달라진다.
DICOM에는 구성 관리 규격도 있으며, 선호하는 AE 목록에 없는 상대의 연결 수락을 금지하지 않는다.

[DICOM 구성 관리 규격](https://dicom.nema.org/medical/dicom/current/output/chtml/part15/chapter_H.html#sect_H.1.1.2)

조회 허용과 검색 조건도 분리해서 봐야 한다. 서버가 `CT_01`의 연결을 받아준다는 사실만으로 조회 결과가 자동으로 `CT_01`의 예약에 한정되는 것은 아니다. 실제 C-FIND 조건과 서버의 필터 정책이 결과를 결정한다. [Orthanc MWL 설정 예시](https://orthanc.uclouvain.be/book/plugins/worklists-plugin-new.html#basic-configuration)

또한 장비가 접속할 대상은 **MWL 서비스를 제공하는 서버**다. PACS가 MWL도 제공하면 그 서비스를 설정하고, RIS나 별도 서버가 제공하면 해당 서버의 접속 정보를 사용한다. 영상 저장용 AE와 MWL용 AE가 같다고 가정해서는 안 된다.

## TCP 연결과 DICOM Association을 나눠서 보기

장비 설정 화면에서는 IP, 포트, AE Title을 함께 입력하지만 실제 통신에서는 단계가 나뉜다.

1. IP와 포트로 TCP 연결을 만든다.
2. 그 연결 위에서 AE Title과 사용할 DICOM 서비스·데이터 형식을 협상한다.
3. 협상된 조건으로 C-FIND를 요청하고 결과를 받는다.

아래는 정상 연결을 기준으로 한 흐름이다. TCP 확인 응답과 데이터 분할의 세부 동작은 생략하고, 처음 연결을 만드는 3-way handshake와 DICOM 메시지를 표시했다.

<pre class="mermaid">
sequenceDiagram
    participant CT01
    participant MWLServer
    CT01-&gt;&gt;MWLServer: TCP SYN
    MWLServer--&gt;&gt;CT01: TCP SYN + ACK
    CT01-&gt;&gt;MWLServer: TCP ACK
    CT01-&gt;&gt;MWLServer: A-ASSOCIATE-RQ · 연결 조건 제안
    MWLServer--&gt;&gt;CT01: A-ASSOCIATE-AC · 수락 및 협상 결과
    CT01-&gt;&gt;MWLServer: C-FIND-RQ · 예약 조회
    MWLServer--&gt;&gt;CT01: C-FIND-RSP · Pending, 예약 1건
    MWLServer--&gt;&gt;CT01: C-FIND-RSP · Success, 조회 완료
    CT01-&gt;&gt;MWLServer: A-RELEASE-RQ
    MWLServer--&gt;&gt;CT01: A-RELEASE-RP
</pre>

TCP의 SYN, SYN+ACK, ACK 단계에는 DICOM의 AE Title을 넣지 않는다. TCP 연결이 성립한 다음 보내는 `A-ASSOCIATE-RQ`에 Calling과 Called AE Title이 들어간다. Association이 성립한 뒤에도 요청하려는 MWL 서비스의 Presentation Context가 수락되어야 해당 서비스를 사용할 수 있다. [DICOM Association](https://dicom.nema.org/medical/dicom/current/output/chtml/part08/chapter_7.html)

## 메시지에 들어가는 내용을 실제 필드로 따라가기

여기부터는 예약 1건을 조회하는 **가상 디코딩 예시**다. 실제 장비에서 캡처한 패킷이나 환자 데이터가 아니다. IP, UID, 환자명과 검사번호는 설명용 값이다.

| 설정 | CT 장비 | MWL 서버 |
|---|---|---|
| AE Title | `CT_01` | `MWL_SERVER` |
| IP | `192.168.0.20` | `192.168.0.10` |
| 이번 통신의 역할 | MWL SCU, 조회 요청 | MWL SCP, 조회 응답 |
| 접속 대상 포트 | 서버의 `104`번 포트로 접속 | `104`번 포트에서 대기 |

예시는 하나의 Presentation Context에서 두 Transfer Syntax를 제안하고, 서버가 Explicit VR Little Endian을 선택하는 구성이다. 검색 날짜는 `20261009`로 고정했다.

각 메시지에서 선택한 필드와 태그를 모두 표시한다. 비동기 동작 협상, 역할 협상, 사용자 신원 협상 등 이 예시에서 사용하지 않은 선택 기능까지 열거하는 것은 아니다. 길이 값은 아래 문자열, 패딩, Sequence 인코딩 방식에 맞춰 계산한 값이며 모든 통신에서 고정되는 값이 아니다.

먼저 표기를 구분해야 한다.

| 표기 | 의미 | 예 |
|---|---|---|
| PDU 필드 | 연결과 전송을 위한 프로토콜 필드 | Calling AE Title, PDU Length |
| Item Type | Association 내부 항목의 종류 | Transfer Syntax Sub-item의 `0x40` |
| `(그룹,요소)` | DICOM 명령·데이터 요소의 태그 | Patient ID `(0010,0020)` |

**모든 DICOM 통신 필드에 `(그룹,요소)` 태그가 붙는 것은 아니다.** 특히 연결 요청의 Calling·Called AE Title과 Transfer Syntax는 PDU 구조에 들어간다.

### 1. A-ASSOCIATE-RQ: 장비가 연결 조건을 제안한다

각 Item과 Sub-item의 공통 헤더에는 `Item Type`, `Reserved = 0`, `Item Length`가 들어간다. 아래 트리의 Item Type은 태그 번호가 아니다. [RQ PDU 구조](https://dicom.nema.org/medical/dicom/current/output/chtml/part08/sect_9.3.2.html)

```text
CT → MWL 서버: A-ASSOCIATE-RQ
│
├─ PDU Type           = 0x01
├─ Reserved           = 0x00
├─ PDU Length         = 207 bytes
├─ Protocol Version   = 0x0001
├─ Reserved           = 0x0000
├─ Called AE Title    = "MWL_SERVER"  [16바이트, 공백 패딩]
├─ Calling AE Title   = "CT_01"       [16바이트, 공백 패딩]
├─ Reserved           = 32바이트 모두 0
│
├─ Application Context Item [Type 0x10, Length 19]
│  └─ UID = 1.2.840.10008.3.1.1
│           DICOM Application Context
│
├─ Presentation Context Item [Type 0x20, Length 74]
│  ├─ Context ID = 1
│  ├─ Reserved   = 3바이트 모두 0
│  ├─ Abstract Syntax Sub-item [Type 0x30, Length 22]
│  │  └─ UID = 1.2.840.10008.5.1.4.31
│  │           Modality Worklist Information Model - FIND
│  ├─ Transfer Syntax Sub-item [Type 0x40, Length 17]
│  │  └─ UID = 1.2.840.10008.1.2
│  │           Implicit VR Little Endian
│  └─ Transfer Syntax Sub-item [Type 0x40, Length 19]
│     └─ UID = 1.2.840.10008.1.2.1
│              Explicit VR Little Endian
│
└─ User Information Item [Type 0x50, Length 34]
   ├─ Maximum Length Received [Type 0x51, Length 4]
   │  └─ Value = 16384
   ├─ Implementation Class UID [Type 0x52, Length 9]
   │  └─ UID = 2.25.1001
   └─ Implementation Version Name [Type 0x55, Length 9]
      └─ Value = "CT_DEMO_1"
```

Presentation Context는 **무엇을 할지와 어떤 형식으로 데이터를 주고받을지를 묶은 제안**이다. 이 예시의 `Context ID = 1`에는 MWL FIND라는 Abstract Syntax 하나와 Transfer Syntax 후보 두 개가 들어간다. RQ의 한 Presentation Context에는 하나의 Abstract Syntax와 하나 이상의 Transfer Syntax가 들어간다. [RQ Presentation Context](https://dicom.nema.org/medical/dicom/current/output/chtml/part08/sect_9.3.2.2.html)

`Maximum Length Received = 16384`는 이 요청을 보낸 CT가 받을 수 있는 P-DATA-TF 본문의 최대 길이를 뜻한다. 전체 검사 크기나 TCP 패킷 크기가 아니다. 서버가 AC에서 알리는 값은 반대로 서버의 수신 한도다. [Maximum Length 협상](https://dicom.nema.org/medical/dicom/current/output/chtml/part08/chapter_D.html)

Implementation Class UID는 구현체를 식별하고, Implementation Version Name은 버전 식별에 사용하는 선택 항목이다. 예시에서는 두 항목 모두 넣었다. 이 UID는 환자의 Study Instance UID와 용도가 다르다. [구현체 식별정보](https://dicom.nema.org/medical/dicom/current/output/chtml/part07/sect_D.3.3.2.html)

### 2. A-ASSOCIATE-AC: 서버가 협상 결과를 돌려준다

서버는 연결을 수락하면서 각 Presentation Context에 대한 결과를 알린다. 수락한 Context에는 RQ에서 제안받은 Transfer Syntax 중 하나를 선택한다.

```text
MWL 서버 → CT: A-ASSOCIATE-AC
│
├─ PDU Type           = 0x02
├─ Reserved           = 0x00
├─ PDU Length         = 161 bytes
├─ Protocol Version   = 0x0001
├─ Reserved           = 0x0000
├─ Reserved 16바이트  = RQ의 Called AE Title 영역 복사
├─ Reserved 16바이트  = RQ의 Calling AE Title 영역 복사
├─ Reserved 32바이트  = RQ의 해당 영역 복사
│
├─ Application Context Item [Type 0x10, Length 19]
│  └─ UID = 1.2.840.10008.3.1.1
│
├─ Presentation Context 결과 Item [Type 0x21, Length 27]
│  ├─ Context ID    = 1
│  ├─ Reserved      = 0x00
│  ├─ Result/Reason = 0x00  [수락]
│  ├─ Reserved      = 0x00
│  └─ Transfer Syntax Sub-item [Type 0x40, Length 19]
│     └─ UID = 1.2.840.10008.1.2.1
│              Explicit VR Little Endian
│
└─ User Information Item [Type 0x50, Length 35]
   ├─ Maximum Length Received [Type 0x51, Length 4]
   │  └─ Value = 16384
   ├─ Implementation Class UID [Type 0x52, Length 9]
   │  └─ UID = 2.25.2001
   └─ Implementation Version Name [Type 0x55, Length 10]
      └─ Value = "MWL_DEMO_1"
```

AC에는 Abstract Syntax가 반복해서 들어가지 않는다. `Context ID = 1`로 원래 요청을 가리키고, 그 제안의 처리 결과와 선택한 Transfer Syntax를 전달한다. [AC Presentation Context](https://dicom.nema.org/medical/dicom/current/output/chtml/part08/sect_9.3.3.2.html)

Calling·Called AE Title이 있던 위치도 주의해서 볼 필요가 있다. AC의 해당 영역은 표준상 Reserved이고, RQ에서 받은 바이트를 그대로 복사해 보내되 수신 측은 그 값을 검사하지 않도록 되어 있다. 서버가 AE Title을 새로 배정하는 필드가 아니다. [AC PDU 구조](https://dicom.nema.org/medical/dicom/current/output/chtml/part08/sect_9.3.3.html)

AC를 받았다는 사실만으로 요청한 모든 서비스를 사용할 수 있는 것은 아니다. Context마다 다음 결과가 올 수 있다.

| Result/Reason | 해당 Presentation Context의 결과 |
|---|---|
| `0` | 수락 |
| `1` | 애플리케이션에 의한 거절 |
| `2` | 구체적인 이유 없는 제공자 거절 |
| `3` | Abstract Syntax를 지원하지 않음 |
| `4` | 제안된 Transfer Syntax들을 지원하지 않음 |

따라서 MWL에 해당하는 Context가 수락됐는지 확인한 다음 C-FIND를 보내야 한다. 연결 자체를 거절할 때는 별도의 `A-ASSOCIATE-RJ`가 사용된다.

### 3. C-FIND-RQ: 조회 명령과 검색 조건을 보낸다

C-FIND 요청은 **Command Set과 Identifier Data Set**으로 구성된다. Command Set에는 명령과 요청 식별정보가 들어가고, Identifier에는 검색 조건과 결과로 받고 싶은 속성이 들어간다.

이 메시지는 전송 시 `P-DATA-TF` PDU에 실린다. 아래 예시는 Command와 Data Set을 각각 하나의 완결된 PDV로 넣었다. 실제 구현에서는 여러 PDU와 PDV로 나눠 보낼 수도 있으므로 한 DICOM 메시지가 한 TCP 패킷과 같다고 생각하면 안 된다. [P-DATA-TF 구조](https://dicom.nema.org/medical/dicom/current/output/chtml/part08/sect_9.3.5.html)

```text
CT → MWL 서버: P-DATA-TF
├─ PDU Type   = 0x04
├─ Reserved   = 0x00
├─ PDU Length = 218 bytes
│
├─ PDV #1: Command Set
│  ├─ Item Length             = 84
│  ├─ Presentation Context ID = 1
│  └─ Message Control Header  = 0x03
│                              Command의 마지막 조각
│
└─ PDV #2: Identifier Data Set
   ├─ Item Length             = 126
   ├─ Presentation Context ID = 1
   └─ Message Control Header  = 0x02
                               Data Set의 마지막 조각
```

Message Control Header의 하위 비트는 Command인지 Data Set인지와 마지막 조각인지를 구분한다. 여기서는 `0x03`이 Command의 마지막 조각, `0x02`가 Data Set의 마지막 조각이다. [PDV 제어 헤더](https://dicom.nema.org/medical/dicom/current/output/chtml/part08/sect_E.2.html)

**Command Set 전체**는 다음과 같다. VR은 값의 자료형을 뜻한다.

```text
(0000,0000) UL CommandGroupLength       = 70
(0000,0002) UI AffectedSOPClassUID       = "1.2.840.10008.5.1.4.31"
(0000,0100) US CommandField             = 0x0020
(0000,0110) US MessageID                = 1
(0000,0700) US Priority                 = 0x0000
(0000,0800) US CommandDataSetType       = 0x0001
```

`CommandField = 0x0020`은 C-FIND-RQ를 뜻한다. `MessageID = 1`은 응답과 연결할 요청 번호이고, `Priority = 0x0000`은 보통 우선순위다. `CommandDataSetType`은 `0x0101`이면 Data Set이 없고, 이 예시의 `0x0001`처럼 다른 값이면 Data Set이 있다는 뜻이다. [C-FIND-RQ 명령 태그](https://dicom.nema.org/medical/dicom/current/output/chtml/part07/sect_9.3.2.html)

이어지는 **Identifier Data Set 전체**는 다음과 같다.

```text
(0008,0050) SH AccessionNumber                  = ""
(0010,0010) PN PatientName                      = ""
(0010,0020) LO PatientID                        = ""
(0020,000D) UI StudyInstanceUID                 = ""

(0040,0100) SQ ScheduledProcedureStepSequence
│             Sequence Length = 72 bytes
│
└─ (FFFE,E000) Item
   │             Item Length = 64 bytes
   │
   ├─ (0008,0060) CS Modality                   = "CT"
   ├─ (0040,0001) AE ScheduledStationAETitle     = "CT_01"
   ├─ (0040,0002) DA ScheduledProcedureStepStartDate
   │                                           = "20261009"
   ├─ (0040,0003) TM ScheduledProcedureStepStartTime
   │                                           = ""
   ├─ (0040,0007) LO ScheduledProcedureStepDescription
   │                                           = ""
   └─ (0040,0009) SH ScheduledProcedureStepID    = ""

(0040,1001) SH RequestedProcedureID             = ""
```

이 요청은 “2026년 10월 9일, CT_01에 배정된 CT 예약을 찾고 환자 정보와 검사번호 등을 반환해 달라”는 뜻이다. `""`로 표시한 속성은 길이가 0인 값이다. 이 예시에서는 해당 속성으로 검색을 제한하지 않으면서 결과 값을 요청하는 데 사용한다.

예약일, Modality, 배정 장비는 `(0040,0100) Scheduled Procedure Step Sequence` 안에 들어간다. 기존 Study 조회에서 사용하는 `QueryRetrieveLevel = STUDY`를 그대로 넣는 구조가 아니다. `(FFFE,E000)`은 Sequence 내부의 Item을 표시하는 구조 요소이며 업무 데이터 필드와는 다르다. [MWL 데이터 모델과 태그](https://dicom.nema.org/medical/dicom/current/output/chtml/part04/sect_K.6.html)

### 4. C-FIND-RSP: 검색된 예약을 반환한다

서버가 예약 한 건을 찾았다면 Pending 상태와 해당 예약의 Data Set을 보낸다.

```text
MWL 서버 → CT: P-DATA-TF
├─ PDU Type   = 0x04
├─ Reserved   = 0x00
├─ PDU Length = 286 bytes
│
├─ PDV #1: Command Set
│  ├─ Item Length             = 84
│  ├─ Presentation Context ID = 1
│  └─ Message Control Header  = 0x03
│
└─ PDV #2: Identifier Data Set
   ├─ Item Length             = 194
   ├─ Presentation Context ID = 1
   └─ Message Control Header  = 0x02
```

**응답 Command Set 전체:**

```text
(0000,0000) UL CommandGroupLength        = 70
(0000,0002) UI AffectedSOPClassUID        = "1.2.840.10008.5.1.4.31"
(0000,0100) US CommandField              = 0x8020
(0000,0120) US MessageIDBeingRespondedTo  = 1
(0000,0800) US CommandDataSetType        = 0x0001
(0000,0900) US Status                    = 0xFF00
```

`CommandField = 0x8020`은 C-FIND-RSP다. 응답에서는 요청의 `MessageID` 대신 `MessageIDBeingRespondedTo`로 어느 요청에 대한 응답인지 표시한다. `Status = 0xFF00`은 Pending이고, 요청한 속성을 담은 Data Set이 이어진다. [C-FIND-RSP 명령 태그](https://dicom.nema.org/medical/dicom/current/output/chtml/part07/sect_9.3.2.2.html)

**응답 Identifier Data Set 전체:**

```text
(0008,0050) SH AccessionNumber                  = "ACC261009001"
(0010,0010) PN PatientName                      = "KIM^CHEOLSU"
(0010,0020) LO PatientID                        = "P0001"
(0020,000D) UI StudyInstanceUID                 = "2.25.3001"

(0040,0100) SQ ScheduledProcedureStepSequence
│             Sequence Length = 94 bytes
│
└─ (FFFE,E000) Item
   │             Item Length = 86 bytes
   │
   ├─ (0008,0060) CS Modality                   = "CT"
   ├─ (0040,0001) AE ScheduledStationAETitle     = "CT_01"
   ├─ (0040,0002) DA ScheduledProcedureStepStartDate
   │                                           = "20261009"
   ├─ (0040,0003) TM ScheduledProcedureStepStartTime
   │                                           = "100000"
   ├─ (0040,0007) LO ScheduledProcedureStepDescription
   │                                           = "CHEST CT"
   └─ (0040,0009) SH ScheduledProcedureStepID    = "SPS0001"

(0040,1001) SH RequestedProcedureID             = "RP0001"
```

여기서 Accession Number는 업무상의 검사 오더·접수번호이고, Study Instance UID는 DICOM Study의 고유 식별자다. 같은 예약에 연결된 값이어도 서로 다른 식별자다. 검사 수행 단계 ID와 Requested Procedure ID도 구분해서 전달된다.

예시의 Sequence와 Item에는 길이를 명시했으므로 별도의 Item/Sequence 종료 구분자를 붙이지 않았다. 문자열은 필요한 경우 짝수 길이가 되도록 패딩하며, 위 길이 계산에도 반영했다. ASCII 문자만 사용한 이 예시에는 `(0008,0005) Specific Character Set`이 없지만, 실제 한글 등의 문자 처리는 지원 문자집합과 해당 태그를 함께 고려해야 한다.

### 5. 마지막 C-FIND-RSP: 조회가 끝났음을 알린다

예약 데이터를 모두 보낸 다음에는 Data Set 없이 Success 응답을 보낸다.

```text
MWL 서버 → CT: P-DATA-TF
├─ PDU Type   = 0x04
├─ Reserved   = 0x00
├─ PDU Length = 88 bytes
│
└─ PDV #1: Command Set만 있음
   ├─ Item Length             = 84
   ├─ Presentation Context ID = 1
   └─ Message Control Header  = 0x03
```

```text
(0000,0000) UL CommandGroupLength        = 70
(0000,0002) UI AffectedSOPClassUID        = "1.2.840.10008.5.1.4.31"
(0000,0100) US CommandField              = 0x8020
(0000,0120) US MessageIDBeingRespondedTo  = 1
(0000,0800) US CommandDataSetType        = 0x0101
(0000,0900) US Status                    = 0x0000

Identifier Data Set: 없음
```

`CommandDataSetType = 0x0101`은 Data Set이 없다는 뜻이고, `Status = 0x0000`은 조회 성공과 완료를 뜻한다. 결과가 0건이면 Pending 응답 없이 바로 이 완료 응답이 온다. 따라서 Success만 받았다고 예약 한 건을 받은 것으로 처리하면 안 된다. [MWL 응답 규칙](https://dicom.nema.org/medical/dicom/current/output/chtml/part04/sect_K.4.html)

### 6. A-RELEASE: Association을 종료한다

이 예시는 한 번 조회한 뒤 Association을 종료한다. 종료 메시지는 다시 PDU 필드로 구성되며, 환자·검사 태그가 들어가지 않는다.

```text
CT → MWL 서버: A-RELEASE-RQ

PDU Type   = 0x05
Reserved   = 0x00
PDU Length = 4
Reserved   = 0x00000000

MWL 서버 → CT: A-RELEASE-RP

PDU Type   = 0x06
Reserved   = 0x00
PDU Length = 4
Reserved   = 0x00000000
```

이후 TCP 연결을 닫는다. 조회할 때마다 반드시 Association을 새로 만들어야 한다는 뜻은 아니다. 유지 중인 Association에서 합의된 서비스를 다시 사용할 수도 있다. [종료 요청](https://dicom.nema.org/medical/dicom/current/output/chtml/part08/sect_9.3.6.html), [종료 응답](https://dicom.nema.org/medical/dicom/current/output/chtml/part08/sect_9.3.7.html)

## 연결 거절과 검색 결과 없음은 다른 상황이다

이 둘은 화면에서 모두 “목록이 안 나온다”로 보일 수 있지만 확인할 위치가 다르다.

| 관찰한 응답 | 의미 |
|---|---|
| `A-ASSOCIATE-RJ` | DICOM 연결 자체가 거절됨 |
| `A-ASSOCIATE-AC`, MWL Context 결과 `3` 또는 `4` | 연결 응답은 왔지만 MWL 서비스 또는 제안한 전송 형식을 사용할 수 없음 |
| `C-FIND-RSP`, Pending 없이 Success | 검색은 정상 완료됐지만 일치하는 예약이 없음 |
| `C-FIND-RSP`, Failure | 검색 요청을 처리하는 중 오류가 발생함 |

예를 들어 서버가 모르는 Calling AE Title을 이유로 연결을 거절하는 RJ는 다음처럼 표현할 수 있다.

```text
MWL 서버 → CT: A-ASSOCIATE-RJ

PDU Type   = 0x03
Reserved   = 0x00
PDU Length = 4
Reserved   = 0x00
Result     = 1   [rejected-permanent]
Source     = 1   [DICOM UL service-user]
Reason     = 3   [calling-AE-title-not-recognized]
```

같은 Source에서 `Reason = 7`은 Called AE Title을 인식하지 못했다는 뜻이다. 이 번호들은 RJ의 PDU 필드 값이며 `(0000,0900) Status` 태그 값과는 다른 체계다. [A-ASSOCIATE-RJ 구조](https://dicom.nema.org/medical/dicom/current/output/chtml/part08/sect_9.3.4.html)

## 인코딩과 파일 태그에서 헷갈리기 쉬운 부분

Transfer Syntax를 협상했다고 메시지의 모든 부분이 그 형식을 따르는 것은 아니다. **Command Set은 항상 Implicit VR Little Endian에 대응하는 인코딩**을 사용한다. 위 덤프에 적은 Command의 `UL`, `UI`, `US`는 설명을 위한 자료형 표시이며, 실제 Command 바이트에 Explicit VR처럼 VR 문자열을 써서 보내는 것이 아니다. 검색 조건과 예약 결과 Data Set은 협상된 Transfer Syntax를 따르므로 이 예시에서는 Explicit VR Little Endian이다. [Command Set 인코딩](https://dicom.nema.org/medical/dicom/current/output/chtml/part07/sect_6.3.html)

또한 `.dcm` 파일의 File Meta Information에 있는 `(0002,0010) Transfer Syntax UID`와 연결 협상의 Transfer Syntax Sub-item은 구분해야 한다. 전자는 파일 Data Set의 형식을 설명하는 메타데이터이고, 후자는 Association에서 사용할 형식을 제안·선택하는 항목이다. 네트워크에서 `.dcm` 파일의 preamble과 File Meta Information을 통째로 C-FIND 앞에 붙여 보내는 구조가 아니다. [DICOM 파일 형식](https://dicom.nema.org/medical/dicom/current/output/chtml/part10/chapter_7.html)

MWL 조회가 끝났다고 촬영이 시작되거나 완료된 상태가 서버에 보고되는 것도 아니다. MWL은 예약 정보 조회를 담당한다. 장비의 수행 상태 보고는 MPPS 같은 별도 서비스로 다룬다. [Modality Performed Procedure Step](https://dicom.nema.org/medical/dicom/current/output/chtml/part04/sect_F.7.html)

## 관련 노트

- [Cornerstone3D 시작하기 — 개념·기본 사용법·뷰포트 종류](/log/cornerstone3d-getting-started/)
