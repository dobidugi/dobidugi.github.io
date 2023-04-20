---
title: React 프로젝트 AWS S3에 CLI 배포하기
layout: story
category: web
tags: ["aws","deploy","react"]
---
진행중인 React 프로젝트를 AWS S3에 배포 배포하기.

# AWS에 배포 하는이유
AWS에 배포하는 첫번째 이유로는 가장 크고 많이 사용되는 클라우드 서비스이기 떄문이다.
두번째 이유로는 AWS 서비스를 사용하고있다면 AWS내의 다른 서비스(도메인 같은)와 연동도 쉽고 간편하게 된다하여 AWS를 선택하게 되었다.

# AWS S3는 무엇인가
AWS S3의 S3는 Simple Storage Service의 약자이며 특정한 파일을 저장하고 인터넷상에서 접근할 수 있게 해주는 서비스이다.
보통 서비스에 필요한 이미지나 파일들을 저장하지만, 정적인 파일들을 안정적으로 제공할 수 있다는 점에서 웹사이트 호스팅에도 사용할 수 있다.
또한 업로드할 수 있는 파일의 갯수가 제한되어 있지않고 스토리지의 요구를 미리 관리할 필요가 없어 확장/축소에 신경 쓸 필요 없이 사용한 만큼만 돈을 지불 하면된다.

# 배포 진행하기

## S3 버킷 생성
1. [이곳](https://s3.console.aws.amazon.com/s3/get-started?region=us-east-1)에 접속하여 버킷 생성 버튼을 클릭한다.
![r1](/assets/web/awss3deploy1/1.png)

2. 버킷의 이름과 버킷이 위치할 리전을 설정해준다. 
![r2](/assets/web/awss3deploy1/2.png)

3. 객체 소유권 설정하기
![r3](/assets/web/awss3deploy1/3.png)
나만 사용할것이기때문에 ACL 비활성화를 선택해주면된다.

4. 버킷의 퍼블릭 액세스 차단 설정
![r4](/assets/web/awss3deploy1/4.png)
언제 어디서든지 URL을 통해 누구나 접속할 수 있어야하기때문에 풀어준다.

5. 그외 나머지는 현재로서는 건들 필요가없으니 바로 버킷 만들기 버튼을 누르면된다.
![r5](/assets/web/awss3deploy1/5.png)

6. 생성된 버킷 확인하기 
![r6](/assets/web/awss3deploy1/6.png)
버킷이 생성된걸 확인했으면 이제 프로젝트를 배포해보자

## 프로젝트 배포 
1. 현재 진행중인 프로젝트를 빌드한다.
![r7](/assets/web/awss3deploy1/7.png)

2. 버킷에 접속후 객체에 빌드파일을 업로드하기
![r8](/assets/web/awss3deploy1/8.png)
![r9](/assets/web/awss3deploy1/9.png)
드래그 앤 드롭으로도 업로드가 가능하다.

3. 버킷 정책 설정하기
![r11](/assets/web/awss3deploy1/11.png)
권한 탭에 들어가서 버킷 정책란에 있는 편집 버튼을 클릭한다.
```js
{
	"Version": "2012-10-17",
	"Statement": [
		{
			"Sid": "PublicGetObject",
			"Effect": "Allow",
			"Principal": "*",
			"Action": "s3:GetObject",
			"Resource": "arn:aws:s3:::withding-fe/*"
		}
	]
}
```
이 정책을 적용해준다.
![r11](/assets/web/awss3deploy1/12.png)
```js
{
	"Version": "2012-10-17", // Policy JSON 문법 버전  2012-10-17 / 2008-10-17
	"Statement": [
		{
			"Sid": "PublicGetObject", // statement id를 구분하기 위한 sid
			"Effect": "Allow", // 엑세스 허용 여부  Allow / Deny
			"Principal": "*", // 엑세서를 허용하거나 거부할 대상
			"Action": "s3:GetObject", // S3 버킷을 Get하는 액션 허용
			"Resource": "arn:aws:s3:::withding-fe/*" // "arn:aws:s3:::<bucket-name>/*"
		}
	]
}
```
정책에 대한 설명은 [이곳](https://docs.aws.amazon.com/ko_kr/IAM/latest/UserGuide/reference_policies_elements.html)에서 접속하여 자세히 볼 수 있다.

4. 정적 웹 사이트 호스팅
![r13](/assets/web/awss3deploy1/13.png)
해당 버킷을 웹사이트 호스팅으로 사용하기위해 속성탭 하단에 있는 정적 웹 사이트 호스팅 박스의 편집 버튼을 클릭해준다.
![r14](/assets/web/awss3deploy1/14.png)
정적 웹사이트를 활성화 해주고 인덱스 문서에 index.html 파일을 입력해주며 오류 발생시 보여줄 페이지가 따로있다면 오류 문서에 해당 파일을 적어주면 된다.
![r15](/assets/web/awss3deploy1/15.png)
작성을 완료 하였으면 변경 사항 저장 버튼을 클릭한다.

5. 확인하기
![r16](/assets/web/awss3deploy1/16.png)
다시 버킷 속성탭에 들어가 정적 웹사이트 호스팅 부분을 확인해주면 배포 URL이 생성된것을 확인할 수 있다.
![r17](/assets/web/awss3deploy1/17.png)


프로젝트를 AWS S3에 배포하는데 성공하였지만 매번 사이트에 접속하여 기존에 있던 파일들을 지우고 다시 프로젝트를 빌드후 파일을 업로드 하는 작업은 매우 번거롭고 시간이 많이걸린다.
한줄의 명령어만 입력하면 알아서 빌드후 배포되게 구성해보자.

# AWS CLI 
AWS Command Line Interface(AWS CLI)는 명령줄 셸의 명령을 사용하여 AWS 서비스와 상호 작용할 수 있는 오픈 소스 도구이다.
[참고](https://docs.aws.amazon.com/ko_kr/cli/latest/userguide/cli-chap-welcome.html)

## AWS CLI 설치하기
aws cli는  windows, mac, linux 환경을 지원하고 여기 [이곳](https://docs.aws.amazon.com/ko_kr/cli/latest/userguide/getting-started-install.html)에 들어가면 os별로 설치하는 방법이 나와있다.

## 계정 연동하기
AWS 홈페이지에 접속해 로그인후 프로필을 누르면 보안 자격증명 메뉴가있다.
![r18](/assets/web/awss3deploy1/18.png)

접속하여 액세스키를 발급받는다.
![r19](/assets/web/awss3deploy1/19.png)

터미널에 아래 명령어를 입력후 발급받은 액세스키를 입력해준다.
```
aws configure
```
![r20](/assets/web/awss3deploy1/20.png)

## 배포하기
빌드 파일들을 명령어를 통해 배포해준다.
```
aws s3 sync <build-folder>/ s3://<bucket-name> --delete
```
![r21](/assets/web/awss3deploy1/21.png)

## 스크립트 추가하기
이 과정들을 명령어 한줄만 입력하면 자동으로 처리되게 package.json에 스크립트를 추가해주자
![r22](/assets/web/awss3deploy1/22.png)

명령어 한 줄만 입력하면 빌드 후 자동으로 배포까지 되게 설정했다.
이로인해 배포하는데 시간을 낭비하지않고 개발에 집중할 수 있게 되었다.
























