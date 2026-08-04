---
title: "ECS Fargate 셋업 가이드"
date: 2026-06-22
category: "INFRA"
tags: ["reference","infra","AWS","ECS","Fargate","SOP"]
description: "Spring Boot / Next.js 서비스를 ECS Fargate에 운영 배포하기 위한 재현 가능한 SOP. myapp-be(BE), myapp-fe(FE)를 실제로 셋업한 경험을 바탕으로 정리…"
minutes: 36
---
> <span class="co co-abstract">📋 요약 개요</span>
> Spring Boot / Next.js 서비스를 ECS Fargate에 운영 배포하기 위한 **재현 가능한 SOP**. `myapp-be`(BE), `myapp-fe`(FE)를 실제로 셋업한 경험을 바탕으로 정리했다.
> 상위 인덱스: ECS Fargate 인프라 MOC · 결과물 현황: 운영 인프라 현황 · 함정 모음: [ECS 트러블슈팅](/log/ecs-troubleshooting/)

## 이 문서 읽는 법

- `<PROJECT>`, `<SERVICE>`, `<DOMAIN>` 같은 꺾쇠 표기는 프로젝트에 맞게 치환한다. 예: `<PROJECT>/<SERVICE>` → `myapp/be`.
- 작업 방식은 두 가지를 섞어 쓴다. **반복 실행할 것·정확한 값이 중요한 것은 CLI**로, **마법사가 여러 리소스를 한 번에 만들어주는 것(VPC, ACM, RDS, ECS 콘솔)은 콘솔**로 한다. 각 섹션에 어느 쪽인지 명시했다.
- 각 섹션 제목에 **반복 범위**를 표기했다:
	- **계정 1회** — AWS 계정에 딱 한 번. 이미 돼 있으면 건너뛴다.
	- **프로젝트 1회** — 공유 인프라. 첫 서비스 셋업 때만 만들고 이후 서비스는 재활용한다.
	- **서비스마다** — 서비스(BE, FE, …)를 추가할 때마다 반복한다.
	- 두 번째 서비스부터는 **"서비스마다" 항목만** 따라가면 된다. 요약표는 아래 "멀티 서비스 추가" 섹션 참고.
- `> [!warning]` / `> [!danger]` 콜아웃은 실제로 밟았던 함정이다. 건너뛰지 말 것.

## 전체 흐름

여섯 단계를 순서대로 진행한다. 앞 단계의 결과물(VPC, ALB, IAM Role)을 뒤 단계가 참조하므로 순서를 바꾸면 꼬인다.

<pre class="mermaid">
graph TD
    P1[Phase 1&lt;br/&gt;ECR + GHA 빌드] --&gt; P2[Phase 2&lt;br/&gt;VPC + 네트워킹]
    P2 --&gt; P3[Phase 3&lt;br/&gt;ALB + ACM + Route 53]
    P3 --&gt; P4[Phase 4&lt;br/&gt;RDS DB 필요 시]
    P4 --&gt; P5[Phase 5&lt;br/&gt;ECS Cluster + IAM + Service]
    P5 --&gt; P6[Phase 6&lt;br/&gt;첫 배포 + 검증]
    P6 --&gt; Run[운영 시작]
</pre>

소요 시간은 BE 기준 **약 하루**. 이미 인프라가 깔린 상태에서 FE만 얹는 건 **3~4시간** 정도 걸린다.

## Phase 0 — 사전 준비

### 필요한 것

- **AWS 계정** (IAM 관리자 권한)
- **도메인** (Route 53 또는 외부 등록)
- **GitHub 저장소** (앱 코드 + GitHub Actions)
- 로컬 도구(선택): `aws-cli`, `docker`, `git`

### 시작 전에 결정할 것

아래 항목들은 중간에 바꾸기 어렵거나(리전, 아키텍처) 바꾸면 재작업이 커지는(도메인 패턴) 것들이라 시작 전에 정한다.

| 결정      | 옵션                                         | 추천 (myapp 기준)                     |
| ------- | ------------------------------------------ | ---------------------------------- |
| 리전      | ap-northeast-2 등                           | 한국 서비스 → 서울                        |
| 아키텍처    | x86 / **ARM (Graviton)**                   | ARM (20% 비용 절감)                    |
| 빌드 플랫폼  | amd64 / arm64 / multi-arch                 | **linux/arm64 only**               |
| 도메인 패턴  | 단일 / 서브도메인 분리                              | 분리 (`api.x.com`, `app.x.com`)      |
| TLS 인증서 | 도메인별 / **와일드카드**                           | 와일드카드                              |
| 무중단 방식  | **Rolling + Circuit Breaker** / Blue-Green | Rolling (시작 단계)                    |
| 시크릿 관리  | Task Def 평문 / **Secrets Manager**          | Task Def 평문 시작, 추후 Secrets Manager |

Account ID는 이후 만들 모든 ARN에 들어가니 미리 확인해 둔다.

```bash
aws sts get-caller-identity --query Account --output text
```

## Phase 1 — ECR + GHA 빌드 파이프라인

이 단계의 목표: **git tag를 푸시하면 GitHub Actions가 ARM 이미지를 빌드해 ECR에 올라가는 상태**를 만든다. 이미지 저장소(ECR), GitHub이 AWS에 접근할 인증 경로(OIDC + IAM Role), 빌드 워크플로 순서로 만든다.

### 1-1. ECR 레포 생성 (CLI · 서비스마다)

```bash
aws ecr create-repository \
  --repository-name <PROJECT>/<SERVICE> \
  --region ap-northeast-2 \
  --image-tag-mutability MUTABLE \
  --image-scanning-configuration scanOnPush=true \
  --encryption-configuration encryptionType=AES256
```

> <span class="co co-tip">💡 TIP 네임스페이스</span>
> 레포 이름은 `<PROJECT>/<SERVICE>` 형태를 권장한다(예: `myapp/be`, `myapp/fe`). 이렇게 하면 IAM 정책에서 `myapp/*` 와일드카드로 묶을 수 있다.

### 1-2. ECR Lifecycle Policy (CLI · 서비스마다)

빌드가 쌓이면 이미지 요금이 계속 늘어나므로 자동 정리 규칙을 걸어둔다. 태그 없는 이미지는 7일 후 삭제하고, `prod-*` 태그는 최근 20개만 유지한다.

```bash
cat > /tmp/lifecycle.json <<'EOF'
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "untagged 7일 후 삭제",
      "selection": { "tagStatus": "untagged", "countType": "sinceImagePushed", "countUnit": "days", "countNumber": 7 },
      "action": { "type": "expire" }
    },
    {
      "rulePriority": 2,
      "description": "prod-* 최근 20개 유지",
      "selection": { "tagStatus": "tagged", "tagPatternList": ["prod-*"], "countType": "imageCountMoreThan", "countNumber": 20 },
      "action": { "type": "expire" }
    }
  ]
}
EOF

aws ecr put-lifecycle-policy \
  --repository-name <PROJECT>/<SERVICE> \
  --region ap-northeast-2 \
  --lifecycle-policy-text file:///tmp/lifecycle.json
```

### 1-3. GitHub OIDC Provider 등록 (CLI · 계정 1회)

GitHub Actions가 액세스 키 없이 AWS Role을 assume하려면 계정에 GitHub의 OIDC Provider가 등록돼 있어야 한다. **계정당 한 번만** 하면 되므로, 이미 있는지 먼저 확인한다.

```bash
# 이미 등록됐는지 확인
aws iam list-open-id-connect-providers

# 없으면 등록
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

콘솔로 할 경우: IAM → ID 제공업체 → 공급자 추가 → OpenID Connect 선택 → URL에 `https://token.actions.githubusercontent.com`, Audience에 `sts.amazonaws.com`을 입력한다.

### 1-4. GHA가 assume할 IAM Role 생성 (CLI · 서비스마다)

이제 GitHub Actions가 실제로 쓸 Role을 만든다. 신뢰 정책으로 **특정 저장소(`repo:<OWNER>/<REPO>`)에서만** assume할 수 있게 제한하고, 권한은 두 종류를 붙인다:

1. **ECR push 권한** — AWS 관리형 정책 `AmazonEC2ContainerRegistryPowerUser`
2. **ECS 배포 권한** — Task Definition 등록과 Service 업데이트, 그리고 Task Def에 박힌 Role을 넘겨줄 `iam:PassRole` (인라인 정책)

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

cat > /tmp/trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
      "StringLike": { "token.actions.githubusercontent.com:sub": "repo:<OWNER>/<REPO>:*" }
    }
  }]
}
EOF

aws iam create-role \
  --role-name github-actions-<SERVICE>-deploy \
  --assume-role-policy-document file:///tmp/trust-policy.json

aws iam attach-role-policy \
  --role-name github-actions-<SERVICE>-deploy \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser
```

ECS 배포용 인라인 정책. `iam:PassRole`의 Resource에 들어가는 두 Role은 Phase 5에서 만들 것들이다(이름만 미리 맞춰두면 된다).

```bash
cat > /tmp/ecs-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ECSDeploy",
      "Effect": "Allow",
      "Action": [
        "ecs:RegisterTaskDefinition", "ecs:DescribeTaskDefinition",
        "ecs:UpdateService", "ecs:DescribeServices", "ecs:DescribeClusters",
        "ecs:DescribeTasks", "ecs:ListTasks"
      ],
      "Resource": "*"
    },
    {
      "Sid": "PassRoleForTaskDef",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": [
        "arn:aws:iam::${ACCOUNT_ID}:role/ecsTaskExecutionRole-<PROJECT>",
        "arn:aws:iam::${ACCOUNT_ID}:role/ecsTaskRole-<PROJECT>-<SERVICE>"
      ]
    }
  ]
}
EOF

aws iam put-role-policy \
  --role-name github-actions-<SERVICE>-deploy \
  --policy-name <SERVICE>-ecs-deploy \
  --policy-document file:///tmp/ecs-policy.json

# Role ARN 확인 — 다음 단계에서 GitHub Secret으로 등록한다
aws iam get-role --role-name github-actions-<SERVICE>-deploy --query 'Role.Arn'
```

> <span class="co co-warning">⚠️ 주의 콘솔로 만들 때</span>
> 신뢰 엔터티는 **"웹 자격 증명"** 을 선택하고, Audience는 반드시 드롭다운에서 고른다. 직접 타이핑하면 한글 입력기가 문자를 바꿔치기해서 검증에 실패하는 함정이 있다. Role 생성 후에는 인라인 정책으로 위의 ECS 권한 JSON을 추가한다.

### 1-5. GitHub Repository Secret 등록 (서비스마다)

앞에서 확인한 Role ARN을 GitHub에 등록한다. 경로: 저장소 → Settings → Secrets and variables → Actions → New repository secret.

| Name | Value |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::<ACCOUNT_ID>:role/github-actions-<SERVICE>-deploy` |

> <span class="co co-warning">⚠️ 주의 자주 하는 실수 2가지</span>
> - **Environment Secret이 아니라 Repository Secret**에 등록해야 한다. build job에는 environment 지정이 없어서 Environment Secret은 읽지 못한다.
> - Role **이름만 넣으면 안 되고 전체 ARN**을 넣어야 한다. 이름만 넣으면 `Source Account ID is needed` 에러가 난다.

### 1-6. 빌드 워크플로 작성 (서비스마다)

`.github/workflows/build-and-push-ecr.yml`을 만든다. 동작 방식:

- `v*.*.*` 태그 푸시 → 버전 태그(`v1.2.3`, `latest`, 짧은 SHA)로 push
- 수동 실행(workflow_dispatch) → `prod`, `prod-<SHA>` 태그로 push
- 러너를 **GitHub 호스팅 ARM 네이티브(`ubuntu-24.04-arm`)** 로 지정 — Fargate ARM용 이미지를 에뮬레이션(QEMU) 없이 네이티브 속도로 빌드한다

```yaml
name: Build & Push to ECR

on:
  push:
    tags: ['v*.*.*']
  workflow_dispatch:

env:
  AWS_REGION: ap-northeast-2
  ECR_REPOSITORY: <PROJECT>/<SERVICE>
  IMAGE_PLATFORMS: linux/arm64

permissions:
  id-token: write
  contents: read

jobs:
  build-and-push:
    runs-on: ubuntu-24.04-arm   # ARM 네이티브 러너 — QEMU 불필요
    outputs:
      image_uri: ${{ steps.meta.outputs.image_uri }}
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_DEPLOY_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}
      - id: ecr-login
        uses: aws-actions/amazon-ecr-login@v2
      # multi-arch가 필요해지면 그때 setup-qemu-action 추가
      - uses: docker/setup-buildx-action@v3
      - id: meta
        run: |
          REGISTRY="${{ steps.ecr-login.outputs.registry }}"
          REPO="${{ env.ECR_REPOSITORY }}"
          SHORT_SHA="${GITHUB_SHA::7}"
          if "${GITHUB_REF}" == refs/tags/v*; then
            VERSION="${GITHUB_REF#refs/tags/}"
            TAGS="${REGISTRY}/${REPO}:${VERSION},${REGISTRY}/${REPO}:latest,${REGISTRY}/${REPO}:${SHORT_SHA}"
            PRIMARY="${VERSION}"
          else
            TAGS="${REGISTRY}/${REPO}:prod,${REGISTRY}/${REPO}:prod-${SHORT_SHA}"
            PRIMARY="prod-${SHORT_SHA}"
          fi
          echo "tags=${TAGS}" >> $GITHUB_OUTPUT
          echo "image_uri=${REGISTRY}/${REPO}:${PRIMARY}" >> $GITHUB_OUTPUT
      - uses: docker/build-push-action@v6
        with:
          context: .
          platforms: ${{ env.IMAGE_PLATFORMS }}
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          provenance: false
```

워크플로를 한 번 돌린 뒤 태그가 ECR에 올라왔는지 확인하면 Phase 1 완료:

```bash
aws ecr list-images --repository-name <PROJECT>/<SERVICE> --region ap-northeast-2
```

### 1-7. (Spring Boot 한정) ECS JSON 구조화 로깅 (서비스마다)

CloudWatch에서 로그를 필드 단위로 검색하려면 앱이 JSON(ECS 포맷)으로 로그를 찍어야 한다. Spring Boot 3.4+는 프로퍼티만으로 켤 수 있다.

```properties
# application-prod.properties
logging.structured.format.console=ecs
logging.structured.ecs.service.name=<PROJECT>-be
logging.structured.ecs.service.environment=production
```

> <span class="co co-warning">⚠️ 주의 logback을 직접 설정하고 있다면</span>
> 위 프로퍼티는 **Spring Boot 기본 console appender에만** 적용된다. `logback-spring.xml`에서 `CONSOLE` appender를 직접 정의해 뒀다면 프로퍼티가 무시되고 plain text로 나간다. 이 경우 prod 프로파일 appender에 `StructuredLogEncoder`를 명시해야 한다. 자세한 내용은 운영 인프라 현황 참고.
>
> ```xml
> <appender name="JSON_CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
>     <encoder class="org.springframework.boot.logging.logback.StructuredLogEncoder">
>         <format>ecs</format>
>     </encoder>
> </appender>
> ```

## Phase 2 — VPC + 네트워킹

이 단계의 목표: 서비스가 들어갈 **격리된 네트워크**를 만든다. 구성은 정석적인 형태다 — 퍼블릭 서브넷에는 ALB만 두고, Fargate Task와 RDS는 프라이빗 서브넷에 숨긴 뒤 아웃바운드만 NAT로 나가게 한다.

### 2-1. VPC 마법사 (콘솔 · 프로젝트 1회)

VPC는 서브넷·라우팅 테이블·게이트웨이를 손으로 하나씩 만들면 실수하기 쉬우니 마법사를 쓴다. AWS Console → VPC → VPC 생성 → **"VPC 등(VPC and more)"** 선택:

| 필드 | 값 |
|---|---|
| 이름 태그 | `<PROJECT>-prod` |
| IPv4 CIDR | `10.10.0.0/16` (Default VPC와 분리) |
| AZ 수 | **2** (Multi-AZ) |
| 퍼블릭/프라이빗 서브넷 | 각 2 |
| NAT 게이트웨이 | **1개 AZ만** (Single AZ, 비용 절감) |
| VPC 엔드포인트 | **S3 게이트웨이** (무료) |
| DNS 호스트 이름/확인 | ✅ |

생성에 5분쯤 걸리고, 끝나면 VPC + 서브넷 4개 + 인터넷 게이트웨이 + NAT 게이트웨이 + 라우팅 테이블 3개 + S3 엔드포인트가 한 번에 만들어져 있다.

> <span class="co co-warning">⚠️ 주의 EIP 한도</span>
> NAT 게이트웨이는 EIP를 하나 소비한다. 회사 공유 계정이면 EIP 한도(기본 5개)가 이미 빠듯할 수 있으니 `aws ec2 describe-addresses`로 미리 확인하고, 부족하면 미사용 EIP를 정리하거나 Service Quotas에서 증가 요청을 한다. → [ECS 트러블슈팅](/log/ecs-troubleshooting/)

### 2-2. 보안그룹 3-tier (CLI · ALB/RDS SG는 프로젝트 1회, Task SG는 서비스마다)

트래픽이 **인터넷 → ALB → Task → RDS** 순서로만 흐르도록 보안그룹 3개를 체인으로 만든다. 각 단계는 바로 앞 단계의 보안그룹에서 오는 트래픽만 허용한다. ALB SG와 RDS SG는 프로젝트 공유이고, **Task SG만 서비스를 추가할 때마다 새로 만든다**.

```bash
VPC_ID=$(aws ec2 describe-vpcs --region ap-northeast-2 \
  --filters "Name=tag:Name,Values=<PROJECT>-prod-vpc" \
  --query 'Vpcs[0].VpcId' --output text)

# ALB SG: 인터넷 전체에서 443/80 허용
ALB_SG=$(aws ec2 create-security-group --region ap-northeast-2 \
  --vpc-id $VPC_ID --group-name <PROJECT>-prod-alb-sg --description "ALB" \
  --query 'GroupId' --output text)
aws ec2 authorize-security-group-ingress --region ap-northeast-2 \
  --group-id $ALB_SG --protocol tcp --port 443 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --region ap-northeast-2 \
  --group-id $ALB_SG --protocol tcp --port 80 --cidr 0.0.0.0/0

# Task SG: 컨테이너 포트를 ALB SG에서만 허용
TASK_SG=$(aws ec2 create-security-group --region ap-northeast-2 \
  --vpc-id $VPC_ID --group-name <PROJECT>-prod-<SERVICE>-task-sg --description "Fargate Task" \
  --query 'GroupId' --output text)
aws ec2 authorize-security-group-ingress --region ap-northeast-2 \
  --group-id $TASK_SG --protocol tcp --port <CONTAINER_PORT> --source-group $ALB_SG

# RDS SG: 3306을 Task SG에서만 허용 (DB 있을 때)
RDS_SG=$(aws ec2 create-security-group --region ap-northeast-2 \
  --vpc-id $VPC_ID --group-name <PROJECT>-prod-rds-sg --description "RDS" \
  --query 'GroupId' --output text)
aws ec2 authorize-security-group-ingress --region ap-northeast-2 \
  --group-id $RDS_SG --protocol tcp --port 3306 --source-group $TASK_SG
```

> <span class="co co-tip">💡 TIP Task SG는 서비스별로 분리</span>
> BE(8082)와 FE(3011)는 컨테이너 포트가 달라 같은 SG를 공유할 수 없다. 처음부터 서비스별 Task SG로 분리해 두는 게 깔끔하다.

## Phase 3 — ALB + ACM + Route 53

이 단계의 목표: **`https://api.<DOMAIN>`으로 들어온 요청이 ALB를 거쳐 Task까지 도달하는 경로**를 만든다. 인증서(ACM) → 로드밸런서(ALB) → DNS(Route 53) 순서다. 인증서 발급에 대기 시간이 있으니 ACM부터 신청해 둔다.

### 3-1. ACM 와일드카드 인증서 (콘솔 · 프로젝트 1회)

콘솔 → Certificate Manager → 인증서 요청 → 퍼블릭 인증서. **반드시 ALB와 같은 리전**에서 요청해야 한다.

| 필드 | 값 |
|---|---|
| 도메인 1 | `*.<DOMAIN>` (와일드카드) |
| 도메인 2 | `<DOMAIN>` (루트) |
| 검증 방법 | **DNS 검증** |
| 키 알고리즘 | RSA 2048 |

> <span class="co co-warning">⚠️ 주의 "Route 53에서 레코드 생성" 버튼을 눌러야 한다</span>
> 요청만 하고 이 버튼을 안 누르면 검증 레코드가 생성되지 않아 **영원히 "보류 중"** 상태로 남는다. 인증서 상세 페이지에서 버튼을 누르면 5~30분 내에 검증이 끝난다. `aws acm list-certificates`로 상태가 `ISSUED`가 됐는지 확인한다.

### 3-2. ALB + Target Group (콘솔 · ALB는 프로젝트 1회, Target Group은 서비스마다)

**ALB**는 인터넷 경계에 서므로 퍼블릭 서브넷 2개에 매핑하고, 리스너를 두 개 만든다:

- **443 (HTTPS)**: 보안 정책 `ELBSecurityPolicy-TLS13-1-2-2021-06`, 인증서는 방금 만든 ACM 와일드카드
- **80 (HTTP)**: HTTPS 443으로 리디렉션 (HTTP_301)

**Target Group**은 ALB가 트래픽을 넘길 대상 묶음이다:

| 필드 | 값 |
|---|---|
| 대상 유형 | **IP 주소** — Fargate(awsvpc 모드)는 인스턴스가 없어서 IP 타입이 필수 |
| 프로토콜/포트 | HTTP / `<CONTAINER_PORT>` |
| 헬스체크 경로 | `/actuator/health`(Spring) 또는 `/api/health`(Next.js) |
| 정상/비정상 임계값 | 2 / 3, 간격 15초, 제한 5초, 성공 코드 200 |

대상 등록은 하지 않는다 — Phase 5에서 ECS Service를 연결하면 Fargate가 Task IP를 동적으로 등록한다.

> <span class="co co-warning">⚠️ 주의 Next.js standalone 헬스체크</span>
> `output: "standalone"` 빌드에서 `/`는 보통 redirect(3xx)를 반환해서 ALB 헬스체크가 200을 받지 못한다. 200을 반환하는 별도의 `/api/health` 라우트를 만들어야 한다.

### 3-3. Route 53 A 레코드 (콘솔 · 서비스마다)

서브도메인을 ALB에 연결한다. 레코드 생성: 이름 `api`(또는 `app`), 유형 A, **별칭(Alias) 체크** 후 대상으로 ALB 선택, "대상 상태 평가"도 체크한다.

검증:

```bash
dig +short <SUBDOMAIN>.<DOMAIN>      # ALB의 IP가 나오면 DNS 연결 OK
curl -I https://<SUBDOMAIN>.<DOMAIN> # 아직 서비스가 없으므로 504가 정상
```

## Phase 4 — RDS (DB 필요 시 · 프로젝트 1회)

DB가 필요 없는 서비스(FE 등)는 이 단계를 건너뛴다. DB 인스턴스는 프로젝트 공유이고, 서비스를 추가할 때는 기존 인스턴스에 스키마(DATABASE)만 새로 만든다.

### 엔진 선택

| 엔진 | 추천 시기 |
|---|---|
| RDS MySQL/PostgreSQL | 시작 단계. $35/월부터 |
| Aurora MySQL/PostgreSQL | 대량 트래픽 / read-heavy / 사내 표준일 때 |
| Aurora Serverless v2 | 트래픽 변동이 클 때 (최소 $72/월) |

> <span class="co co-warning">⚠️ 주의 Aurora 인스턴스 클래스</span>
> 콘솔 기본 추천이 **r 클래스($300+/월)** 로 잡혀 있다. 시작 단계에서는 **t4g.medium($56/월)** 으로 내려서 만든다.

### RDS 생성 (콘솔)

생성 화면에서 실수하기 쉬운 값들만 추린 표. 특히 **VPC를 Default가 아니라 Phase 2에서 만든 것으로** 바꾸는 걸 잊기 쉽다.

| 항목 | 값 |
|---|---|
| 템플릿 | 프로덕션 |
| **VPC** | `<PROJECT>-prod-vpc` — Default 아님! |
| **퍼블릭 액세스** | 아니요 |
| **VPC 보안 그룹** | `<PROJECT>-prod-rds-sg` |
| **추가 구성 → 초기 DB 이름** | **반드시 입력** — 비워두면 인스턴스만 생기고 DB는 안 만들어진다 |
| 마스터 암호 | 강력한 16자 이상, **1Password 백업 필수** |
| 백업 보존 / 암호화 / 삭제 방지 | 7일 / ✅ / ✅ |

### DB 수동 생성 (초기 DB 이름을 안 넣었을 때)

RDS가 프라이빗 서브넷에 있어서 로컬에서 바로 접속이 안 된다. 임시로 퍼블릭 액세스를 열고 내 IP만 허용해서 접속한 뒤, **반드시 원상복구**한다.

```bash
# 1) 임시로 퍼블릭 액세스 ON
aws rds modify-db-instance --db-instance-identifier <DB_INSTANCE> \
  --publicly-accessible --apply-immediately --region ap-northeast-2

# 2) 내 IP만 인바운드 허용
MY_IP=$(curl -s ifconfig.me)
aws ec2 authorize-security-group-ingress --region ap-northeast-2 \
  --group-id $RDS_SG --protocol tcp --port 3306 --cidr "${MY_IP}/32"

# 3) mysql 접속 후 DB 생성
#    CREATE DATABASE <DB_NAME> CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# 4) 원상복구 (필수)
aws rds modify-db-instance --db-instance-identifier <DB_INSTANCE> \
  --no-publicly-accessible --apply-immediately --region ap-northeast-2
```

> <span class="co co-danger">🚨 위험 Aurora는 클러스터 엔드포인트를 쓴다</span>
> 앱 접속 정보에는 **클러스터 엔드포인트**를 써야 failover 시 새 writer를 자동으로 따라간다. `-instance-1`이 붙은 **인스턴스 엔드포인트를 쓰면 failover 때 접속이 끊긴다.** → [ECS 트러블슈팅](/log/ecs-troubleshooting/)

## Phase 5 — ECS Cluster + IAM + Service

이 단계의 목표: 지금까지 만든 조각들(이미지, 네트워크, ALB)을 조립해 **실제로 컨테이너가 도는 상태**를 만든다. 순서는 클러스터 → 로그 그룹 → Task용 IAM Role 2종 → Task Definition + deploy job → ECS Service.

### 5-1. ECS Cluster (콘솔 · 프로젝트 1회)

콘솔 → ECS → 클러스터 생성. 이름 `<PROJECT>-prod`, 인프라는 **AWS Fargate(서버리스)**, Container Insights 활성화.

> <span class="co co-warning">⚠️ 주의 Service-Linked Role (계정 1회)</span>
> 계정에서 첫 클러스터를 만들 때 Service-Linked Role 자동 생성이 실패하는 경우가 있다. 그때는 수동으로 만든다:
> `aws iam create-service-linked-role --aws-service-name ecs.amazonaws.com`

### 5-2. CloudWatch Log Group (CLI · 서비스마다, 필수)

```bash
aws logs create-log-group --log-group-name /ecs/<PROJECT>-prod/<SERVICE> --region ap-northeast-2
aws logs put-retention-policy --log-group-name /ecs/<PROJECT>-prod/<SERVICE> \
  --retention-in-days 30 --region ap-northeast-2
```

> <span class="co co-danger">🚨 위험 빠뜨리면 Task가 시작조차 못 한다</span>
> awslogs 드라이버는 Log Group을 자동 생성하지 않는다. 없이 Task를 띄우면 `ResourceInitializationError: ... log group does not exist`로 실패한다. → [ECS 트러블슈팅](/log/ecs-troubleshooting/)

### 5-3. Task용 IAM Role 2종 (CLI · Execution Role은 프로젝트 1회, Task Role은 서비스마다)

역할이 다른 Role 두 개가 필요하다. 헷갈리기 쉬운데, **Execution Role은 "Fargate 인프라가" 쓰는 권한이고 Task Role은 "내 앱 코드가" 쓰는 권한**이다.

| Role                              | 누가 쓰나                          | 반복 범위 | 권한                                 |
| --------------------------------- | --------------------------- | ------ | ---------------------------------- |
| `ecsTaskExecutionRole-<PROJECT>`  | Fargate — ECR pull, CloudWatch Logs 쓰기 | 프로젝트 1회 | `AmazonECSTaskExecutionRolePolicy` |
| `ecsTaskRole-<PROJECT>-<SERVICE>` | 앱 — S3, SES 등 AWS API 호출     | 서비스마다 | 필요 없으면 빈 채로 둔다                     |

둘 다 신뢰 주체는 `ecs-tasks.amazonaws.com`이다:

```bash
cat > /tmp/ecs-tasks-trust.json <<'EOF'
{ "Version": "2012-10-17", "Statement": [{ "Effect": "Allow",
  "Principal": { "Service": "ecs-tasks.amazonaws.com" }, "Action": "sts:AssumeRole" }] }
EOF

aws iam create-role --role-name ecsTaskExecutionRole-<PROJECT> \
  --assume-role-policy-document file:///tmp/ecs-tasks-trust.json
aws iam attach-role-policy --role-name ecsTaskExecutionRole-<PROJECT> \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

aws iam create-role --role-name ecsTaskRole-<PROJECT>-<SERVICE> \
  --assume-role-policy-document file:///tmp/ecs-tasks-trust.json
```

> <span class="co co-warning">⚠️ 주의 콘솔로 Task Role을 만들 때</span>
> 사용 사례에서 **반드시 "Elastic Container Service Task"** 를 선택해야 한다. "Elastic Container Service"(Task 없는 쪽)를 고르면 신뢰 정책이 잘못 박혀서 `unable to assume the role` 에러가 난다.

### 5-4. Task Definition 템플릿 (서비스마다)

Task Definition은 "컨테이너를 어떻게 띄울지"의 명세다. 레포에 템플릿(`.aws/task-definition.template.json` 등)으로 넣어두고, deploy job이 이미지 URI만 치환해서 등록하게 한다.

```json
{
  "family": "<SERVICE>",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024", "memory": "2048",
  "runtimePlatform": { "operatingSystemFamily": "LINUX", "cpuArchitecture": "ARM64" },
  "executionRoleArn": "arn:aws:iam::<ACCOUNT_ID>:role/ecsTaskExecutionRole-<PROJECT>",
  "taskRoleArn": "arn:aws:iam::<ACCOUNT_ID>:role/ecsTaskRole-<PROJECT>-<SERVICE>",
  "containerDefinitions": [{
    "name": "<SERVICE>",
    "image": "${IMAGE_URI}",
    "essential": true,
    "portMappings": [{ "containerPort": "<PORT>", "protocol": "tcp" }],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/<PROJECT>-prod/<SERVICE>",
        "awslogs-region": "ap-northeast-2",
        "awslogs-stream-prefix": "<SERVICE>"
      }
    },
    "healthCheck": {
      "command": ["CMD-SHELL", "wget -q --spider http://localhost:<PORT>/<HEALTH_PATH> || exit 1"],
      "interval": 30, "timeout": 10, "retries": 5, "startPeriod": 90
    }
  }]
}
```

> <span class="co co-danger">🚨 위험 Next.js standalone — HOSTNAME=0.0.0.0 필수</span>
> `node:alpine`의 기본 entrypoint가 `HOSTNAME` 환경변수를 ENI hostname으로 덮어쓴다. 그러면 standalone 서버가 ENI IP에만 bind되고, `localhost`로 도는 컨테이너 헬스체크가 실패해서 Task가 SIGTERM(exit 143)으로 계속 죽는다.
> Task Def의 `environment`에 `{"name":"HOSTNAME","value":"0.0.0.0"}`을 명시하면 해결된다. 영구 처치는 Dockerfile에 `ENTRYPOINT []`. → [ECS 트러블슈팅](/log/ecs-troubleshooting/)

### 5-5. GHA에 deploy job 추가 (서비스마다)

빌드 워크플로에 deploy job을 붙인다. 하는 일은 두 가지: 템플릿의 `${IMAGE_URI}`를 방금 빌드한 이미지로 치환하고, `amazon-ecs-deploy-task-definition` 액션으로 새 revision을 등록 + Service를 업데이트한다.

```yaml
  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_DEPLOY_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}
      - name: Render task definition
        run: |
          export IMAGE_URI="${{ needs.build-and-push.outputs.image_uri }}"
          envsubst < .aws/task-definition.template.json > task-definition.json
      - uses: aws-actions/amazon-ecs-deploy-task-definition@v2
        with:
          task-definition: task-definition.json
          service: <SERVICE>
          cluster: <PROJECT>-prod
          wait-for-service-stability: true
```

> <span class="co co-note">📝 NOTE 첫 실행은 "실패"가 정상이다</span>
> 첫 dispatch에서는 deploy job이 `service ... is MISSING`으로 실패한다. **이건 정상이다** — Task Definition revision 1은 이미 등록됐고, 그걸 참조할 ECS Service가 아직 없을 뿐이다. 다음 단계에서 Service를 만들면 이후부터는 끝까지 통과한다.

### 5-6. ECS Service 첫 생성 (콘솔 · 서비스마다 1회)

방금 등록된 revision을 가리키는 Service를 콘솔에서 한 번만 만든다. 이후 배포는 전부 GHA가 처리한다.

| 항목                  | 값                                  |
| ------------------- | ---------------------------------- |
| 시작 유형               | FARGATE, LATEST                    |
| 작업 정의               | `<SERVICE>` 최신 revision            |
| 원하는 작업 수            | **2**                              |
| 배포 회로 차단기 / 실패 시 롤백 | ✅ / ✅                              |
| 서브넷                 | **Private 2개만**                    |
| 보안 그룹               | `<PROJECT>-prod-<SERVICE>-task-sg` |
| 퍼블릭 IP              | **❌ 비활성화**                         |
| 로드 밸런싱              | ALB + 기존 443 리스너 + Target Group    |

## Phase 6 — 첫 배포 + 검증

Service를 만들면 Task가 뜨기 시작한다. 세 가지를 순서대로 확인한다.

**1) Task가 떴는가** — `[2, 2, 0]`(desired 2, running 2, pending 0)이면 정상:

```bash
aws ecs describe-services --cluster <PROJECT>-prod --services <SERVICE> \
  --region ap-northeast-2 --query "services[0].[desiredCount,runningCount,pendingCount]"
```

**2) 앱이 정상 기동했는가** — Spring은 `Started ... in X.X seconds`, Next.js는 `Ready in X.Xs` 로그가 보이면 된다:

```bash
aws logs tail /ecs/<PROJECT>-prod/<SERVICE> --follow --region ap-northeast-2 --since 5m
```

**3) 외부에서 도달하는가**:

```bash
curl -i https://<SUBDOMAIN>.<DOMAIN>/<HEALTH_PATH>   # → 200 OK
```

여기까지 확인되면 운영 시작이다. 이후 배포는 `git tag v1.0.0 && git push origin v1.0.0` 한 줄로 GHA 빌드 → ECS 무중단 배포까지 자동으로 돈다. 배포·롤백 절차 상세는 [ECS 배포·롤백](/log/ecs-deploy-rollback/) 참고.

## 멀티 서비스 추가 (BE 위에 FE 얹기)

두 번째 서비스부터는 네트워크·ALB·클러스터를 전부 재활용하므로 훨씬 빠르다(3~4시간). 서비스 고유 리소스만 새로 만든다:

| 재활용 (공유 인프라) | 새로 만들 것 (서비스 고유) |
|---|---|
| VPC, Subnet | ECR `myapp/fe` |
| ALB, ACM, Route 53 호스팅 영역 | IAM Role `github-actions-myapp-fe-deploy` |
| ALB 보안그룹 | Task SG `myapp-prod-fe-task-sg` |
| Task Execution Role | Task Role `ecsTaskRole-myapp-fe` |
| ECS Cluster, OIDC Provider | Target Group `myapp-fe-tg`, Log Group `/ecs/myapp-prod/fe` |
| | ALB Listener Rule, Route 53 A 레코드, ECS Service |

핵심 추가 작업은 **ALB Listener Rule**이다. 리스너 하나(443)에서 Host 헤더로 서비스를 분기한다:

```text
Listener 443
├─ priority 100: Host == app.example.com → myapp-fe-tg  (FE)
└─ default:                              → myapp-be-tg  (BE)
```

## SOP 체크리스트

```text
[ ] Phase 0: 사전 결정 (계정/리전/도메인/ARM/DB)
[ ] Phase 1: OIDC, ECR+Lifecycle, IAM Role, GH Secret, GHA build, 첫 빌드 검증
[ ] Phase 2: EIP 한도 확인, VPC 마법사, 보안그룹 3-tier
[ ] Phase 3: ACM 와일드카드, ALB(443/80), Target Group, Route 53 A
[ ] Phase 4: RDS 생성, 초기 DB 이름, 클러스터 endpoint, DB 생성
[ ] Phase 5: Cluster, Log Group(필수), Task Exec Role, Task Role, deploy job, Service
[ ] Phase 6: Task RUNNING 2/2, TG healthy, 로그 정상, ALB 200, DNS 전파
[ ] 운영 후: PRODUCTION 문서화, Rollback, 알람, 비용 모니터링, DR
```

## 참고

- 결과물 현황: 운영 인프라 현황
- 배포/롤백: [ECS 배포·롤백](/log/ecs-deploy-rollback/)
- 함정 종합: [ECS 트러블슈팅](/log/ecs-troubleshooting/)
- 인덱스: ECS Fargate 인프라 MOC
