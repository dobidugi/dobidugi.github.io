---
title: "ECS Fargate 셋업 가이드"
date: 2026-06-22
category: "INFRA"
tags: ["reference","infra","AWS","ECS","Fargate","SOP"]
description: "Spring Boot / Next.js 서비스를 ECS Fargate에 운영 배포하기 위한 재현 가능한 SOP. myapp-be(BE), myapp-fe(FE) 셋업 경험 기반."
minutes: 27
---
> <span class="co co-abstract">📋 요약 개요</span>
> Spring Boot / Next.js 서비스를 ECS Fargate에 운영 배포하기 위한 **재현 가능한 SOP**. `myapp-be`(BE), `myapp-fe`(FE) 셋업 경험 기반.
> 상위 인덱스: ECS Fargate 인프라 MOC · 결과물 현황: 운영 인프라 현황 · 함정 모음: [ECS 트러블슈팅](/log/ecs-troubleshooting/)

## 전체 흐름

<pre class="mermaid">
graph TD
    P1[Phase 1&lt;br/&gt;ECR + GHA 빌드] --&gt; P2[Phase 2&lt;br/&gt;VPC + 네트워킹]
    P2 --&gt; P3[Phase 3&lt;br/&gt;ALB + ACM + Route 53]
    P3 --&gt; P4[Phase 4&lt;br/&gt;RDS DB 필요 시]
    P4 --&gt; P5[Phase 5&lt;br/&gt;ECS Cluster + IAM + Service]
    P5 --&gt; P6[Phase 6&lt;br/&gt;첫 배포 + 검증]
    P6 --&gt; Run[운영 시작]
</pre>

소요 시간(BE 기준): **약 하루**. FE 추가(기존 인프라 위에): **3~4시간**.

## 1. 사전 준비

### 필요한 것
- **AWS 계정** (IAM 관리자 권한)
- **도메인** (Route 53 또는 외부 등록)
- **GitHub 저장소** (앱 코드 + GHA)
- 로컬 도구(선택): `aws-cli`, `docker`, `git`

### 시작 전 결정

| 결정      | 옵션                                         | 추천 (myapp 기준)                     |
| ------- | ------------------------------------------ | ---------------------------------- |
| 리전      | ap-northeast-2 등                           | 한국 서비스 → 서울                        |
| 아키텍처    | x86 / **ARM (Graviton)**                   | ARM (20% 비용 절감)                    |
| 빌드 플랫폼  | amd64 / arm64 / multi-arch                 | **linux/arm64 only**               |
| 도메인 패턴  | 단일 / 서브도메인 분리                              | 분리 (`api.x.com`, `app.x.com`)      |
| TLS 인증서 | 도메인별 / **와일드카드**                           | 와일드카드                              |
| 무중단 방식  | **Rolling + Circuit Breaker** / Blue-Green | Rolling (시작 단계)                    |
| 시크릿 관리  | Task Def 평문 / **Secrets Manager**          | Task Def 평문 시작, 추후 Secrets Manager |

```bash
# Account ID 확인 (이후 모든 ARN에 들어감)
aws sts get-caller-identity --query Account --output text
```

## Phase 1 — ECR + GHA 빌드 파이프라인

### 1-1. ECR 레포 생성

```bash
aws ecr create-repository \
  --repository-name <PROJECT>/<SERVICE> \
  --region ap-northeast-2 \
  --image-tag-mutability MUTABLE \
  --image-scanning-configuration scanOnPush=true \
  --encryption-configuration encryptionType=AES256
```

> <span class="co co-tip">💡 TIP 네임스페이스</span>
> `<PROJECT>/<SERVICE>` 권장 (예: `myapp/be`, `myapp/fe`). IAM 정책에서 `myapp/*` 와일드카드 가능.

**Lifecycle Policy** (이미지 자동 정리): untagged 7일 후 삭제 + `prod-*` 최근 20개 유지.

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

### 1-2. GitHub OIDC Provider 등록 (계정당 1회)

```bash
# 이미 등록됐는지 확인
aws iam list-open-id-connect-providers

# 없으면 등록
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

콘솔: IAM → ID 제공업체 → 공급자 추가 → OpenID Connect → URL `https://token.actions.githubusercontent.com`, Audience `sts.amazonaws.com`.

### 1-3. IAM Role (GHA OIDC용)

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

**ECS deploy 권한 (인라인)** — `RegisterTaskDefinition`, `UpdateService` 등 + `iam:PassRole`:

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

# Role ARN 메모 (GitHub Secret으로 등록)
aws iam get-role --role-name github-actions-<SERVICE>-deploy --query 'Role.Arn'
```

> <span class="co co-warning">⚠️ 주의 콘솔로 만들 때</span>
> 신뢰 엔터티 = **웹 자격 증명**, Audience는 드롭다운에서 선택(직접 타이핑 X — 한글 입력기 자동 변환 함정). Role 생성 후 인라인 정책으로 위 ECS 권한 JSON 추가.

### 1-5. GitHub Repository Secret 등록

GitHub → 저장소 → Settings → Secrets and variables → Actions → New repository secret

| Name | Value |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::<ACCOUNT_ID>:role/github-actions-<SERVICE>-deploy` |

> <span class="co co-warning">⚠️ 주의 자주 하는 실수 2가지</span>
> - **Repository Secret**에 등록 (Environment Secret X — build job은 environment가 없어 접근 불가)
> - **전체 ARN** 입력 (Role 이름만 넣으면 `Source Account ID is needed` 에러)

### 1-6. GHA 빌드 워크플로

`.github/workflows/build-and-push-ecr.yml`:

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
    runs-on: ubuntu-24.04-arm   # GitHub-hosted ARM 네이티브 러너 (Fargate ARM 빌드 빠름)
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
      # QEMU 불필요 — 러너 자체가 ARM. multi-arch 필요 시에만 setup-qemu-action 추가
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

검증: `aws ecr list-images --repository-name <PROJECT>/<SERVICE> --region ap-northeast-2` → 태그 보이면 완료.

### 1-8. (Spring Boot 한정) ECS JSON 구조화 로깅

```properties
# application-prod.properties
logging.structured.format.console=ecs
logging.structured.ecs.service.name=<PROJECT>-be
logging.structured.ecs.service.environment=production
```

> <span class="co co-warning">⚠️ 주의 logback 직접 설정 시 함정</span>
> 위 프로퍼티는 **Spring Boot 기본 console appender에만** 적용된다. `logback-spring.xml`에서 `CONSOLE` appender를 직접 정의했다면 무시되고 plain text로 출력됨.
> → prod 프로파일에서 `StructuredLogEncoder`를 명시 사용. 자세한 내용은 운영 인프라 현황 참고.
>
> ```xml
> <appender name="JSON_CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
>     <encoder class="org.springframework.boot.logging.logback.StructuredLogEncoder">
>         <format>ecs</format>
>     </encoder>
> </appender>
> ```

## Phase 2 — VPC + 네트워킹

### 2-1. VPC 마법사

AWS Console → VPC → VPC 생성 → **VPC 등(VPC and more)**:

| 필드 | 값 |
|---|---|
| 이름 태그 | `<PROJECT>-prod` |
| IPv4 CIDR | `10.10.0.0/16` (Default VPC와 분리) |
| AZ 수 | **2** (Multi-AZ) |
| 퍼블릭/프라이빗 서브넷 | 각 2 |
| NAT 게이트웨이 | **1개 AZ만** (Single AZ, 비용 절감) |
| VPC 엔드포인트 | **S3 게이트웨이** (무료) |
| DNS 호스트 이름/확인 | ✅ |

→ 5분 대기. VPC + Subnet × 4 + IGW + NAT GW + Route Table × 3 + S3 Endpoint 자동 생성.

> <span class="co co-warning">⚠️ 주의 EIP 한도</span>
> 회사 공유 계정이면 NAT용 EIP 한도(기본 5)가 빠듯할 수 있다. `aws ec2 describe-addresses`로 사전 확인, 부족 시 미사용 EIP 정리 또는 Service Quotas로 증가 요청. → [ECS 트러블슈팅](/log/ecs-troubleshooting/)

### 2-3. 보안그룹 3-tier

```bash
VPC_ID=$(aws ec2 describe-vpcs --region ap-northeast-2 \
  --filters "Name=tag:Name,Values=<PROJECT>-prod-vpc" \
  --query 'Vpcs[0].VpcId' --output text)

# ALB SG: 443/80 from 0.0.0.0/0
ALB_SG=$(aws ec2 create-security-group --region ap-northeast-2 \
  --vpc-id $VPC_ID --group-name <PROJECT>-prod-alb-sg --description "ALB" \
  --query 'GroupId' --output text)
aws ec2 authorize-security-group-ingress --region ap-northeast-2 \
  --group-id $ALB_SG --protocol tcp --port 443 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --region ap-northeast-2 \
  --group-id $ALB_SG --protocol tcp --port 80 --cidr 0.0.0.0/0

# Task SG: 컨테이너 포트만 ALB SG에서 허용
TASK_SG=$(aws ec2 create-security-group --region ap-northeast-2 \
  --vpc-id $VPC_ID --group-name <PROJECT>-prod-<SERVICE>-task-sg --description "Fargate Task" \
  --query 'GroupId' --output text)
aws ec2 authorize-security-group-ingress --region ap-northeast-2 \
  --group-id $TASK_SG --protocol tcp --port <CONTAINER_PORT> --source-group $ALB_SG

# RDS SG: 3306 from Task SG (DB 있을 때)
RDS_SG=$(aws ec2 create-security-group --region ap-northeast-2 \
  --vpc-id $VPC_ID --group-name <PROJECT>-prod-rds-sg --description "RDS" \
  --query 'GroupId' --output text)
aws ec2 authorize-security-group-ingress --region ap-northeast-2 \
  --group-id $RDS_SG --protocol tcp --port 3306 --source-group $TASK_SG
```

> <span class="co co-tip">💡 TIP 서비스별 Task SG 분리</span>
> BE(8082)·FE(3011) 포트가 달라 같은 SG를 못 쓴다. 서비스별 Task SG 분리 권장.

## Phase 3 — ALB + ACM + Route 53

### 3-2. ACM 인증서 (와일드카드)

콘솔 → Certificate Manager(**ALB와 같은 리전**) → 인증서 요청 → 퍼블릭:

| 필드 | 값 |
|---|---|
| 도메인 1 | `*.<DOMAIN>` (와일드카드) |
| 도메인 2 | `<DOMAIN>` (루트) |
| 검증 방법 | **DNS 검증** |
| 키 알고리즘 | RSA 2048 |

> <span class="co co-warning">⚠️ 주의 "Route 53에서 레코드 생성" 버튼 필수</span>
> 요청 후 인증서 상세 페이지의 이 버튼을 누르지 않으면 영원히 "보류 중". 검증 완료까지 5~30분. `aws acm list-certificates`로 `ISSUED` 확인.

### 3-3 ~ 3-4. ALB + Target Group

**ALB** (인터넷 경계, Public Subnet 2개에 매핑):
- Listener 443(HTTPS): 보안 정책 `ELBSecurityPolicy-TLS13-1-2-2021-06`, ACM 와일드카드
- Listener 80(HTTP): → HTTPS:443 리디렉션(HTTP_301)

**Target Group**:

| 필드 | 값 |
|---|---|
| 대상 유형 | **IP 주소** ← Fargate awsvpc 필수 |
| 프로토콜/포트 | HTTP / `<CONTAINER_PORT>` |
| 헬스체크 경로 | `/actuator/health`(Spring) 또는 `/api/health`(Next.js) |
| 정상/비정상 임계값 | 2 / 3, 간격 15초, 제한 5초, 성공 200 |

→ 대상 등록 X (Fargate가 동적 등록).

> <span class="co co-warning">⚠️ 주의 Next.js standalone 헬스체크</span>
> `output: "standalone"`에서 `/`는 보통 redirect라 ALB 헬스 200이 안 온다 → 별도 `/api/health` 라우트 필요.

### 3-5. Route 53 A 레코드

레코드 생성: 이름 `api`/`app`, 유형 A, **별칭 ✅** → ALB 선택, 대상 상태 평가 ✅.

검증: `dig +short <SUBDOMAIN>.<DOMAIN>` / `curl -I https://...` (504면 서비스 없어 정상).

## Phase 4 — RDS (DB 필요 시)

### 엔진 선택

| 엔진 | 추천 시기 |
|---|---|
| RDS MySQL/PostgreSQL | 시작 단계, $35/월부터 |
| Aurora MySQL/PostgreSQL | 대량 트래픽 / read-heavy / 사내 표준 |
| Aurora Serverless v2 | 트래픽 변동 큼 (최소 $72/월) |

> <span class="co co-warning">⚠️ 주의 Aurora 인스턴스 클래스</span>
> 콘솔 기본 추천이 **r 클래스($300+)**. 시작 단계엔 **t4g.medium($56)** 으로 다운사이즈.

### RDS 생성 핵심 값

| 항목 | 값 |
|---|---|
| 템플릿 | 프로덕션 |
| **VPC** | `<PROJECT>-prod-vpc` ← Default 아님! |
| **퍼블릭 액세스** | 아니요 |
| **VPC 보안 그룹** | `<PROJECT>-prod-rds-sg` |
| **추가 구성 → 초기 DB 이름** | **반드시 입력** (없으면 DB 안 만들어짐) |
| 마스터 암호 | 강력한 16자+, **1Password 백업 필수** |
| 백업 보존 / 암호화 / 삭제 방지 | 7일 / ✅ / ✅ |

### DB 수동 생성 (초기 이름 안 박았을 때)

```bash
# 임시 퍼블릭 ON
aws rds modify-db-instance --db-instance-identifier <DB_INSTANCE> \
  --publicly-accessible --apply-immediately --region ap-northeast-2

# 본인 IP 인바운드 추가
MY_IP=$(curl -s ifconfig.me)
aws ec2 authorize-security-group-ingress --region ap-northeast-2 \
  --group-id $RDS_SG --protocol tcp --port 3306 --cidr "${MY_IP}/32"

# mysql 접속 후 CREATE DATABASE <DB_NAME> CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# 작업 후 원상복구 (필수)
aws rds modify-db-instance --db-instance-identifier <DB_INSTANCE> \
  --no-publicly-accessible --apply-immediately --region ap-northeast-2
```

> <span class="co co-danger">🚨 위험 Aurora 엔드포인트</span>
> **클러스터 엔드포인트**를 써야 failover가 자동 추적된다. **인스턴스 엔드포인트**(`-instance-1`) 사용 금지. → [ECS 트러블슈팅](/log/ecs-troubleshooting/)

## Phase 5 — ECS Cluster + IAM + Service

### 5-1. ECS Cluster

콘솔 → ECS → 클러스터 생성: 이름 `<PROJECT>-prod`, 인프라 **AWS Fargate(서버리스)**, Container Insights ✅.

> <span class="co co-warning">⚠️ 주의 Service-Linked Role</span>
> 첫 클러스터 생성 시 SLR 자동 생성이 실패하는 케이스: `aws iam create-service-linked-role --aws-service-name ecs.amazonaws.com`

### 5-2. CloudWatch Log Group (필수)

```bash
aws logs create-log-group --log-group-name /ecs/<PROJECT>-prod/<SERVICE> --region ap-northeast-2
aws logs put-retention-policy --log-group-name /ecs/<PROJECT>-prod/<SERVICE> \
  --retention-in-days 30 --region ap-northeast-2
```

> <span class="co co-danger">🚨 위험 빠뜨리면 Task 시작 실패</span>
> Log Group 없이 Task 띄우면 `ResourceInitializationError: ... log group does not exist`. → [ECS 트러블슈팅](/log/ecs-troubleshooting/)

### 5-3 ~ 5-4. IAM Role 2종

| Role | 용도 | 권한 |
|---|---|---|
| `ecsTaskExecutionRole-<PROJECT>` | Fargate가 ECR pull + Logs 쓰기 | `AmazonECSTaskExecutionRolePolicy` |
| `ecsTaskRole-<PROJECT>-<SERVICE>` | 앱이 쓰는 AWS API 권한 | 필요 없으면 빈 채로 |

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

> <span class="co co-warning">⚠️ 주의 콘솔로 Task Role 만들 때</span>
> **반드시 "Elastic Container Service Task"** 사용 사례 선택. 다른 걸 고르면 신뢰 정책이 잘못 박혀 `unable to assume the role` 에러.

### 5-5. Task Definition + ECS Service 첫 생성

GHA 워크플로에 deploy job 추가(Task Def 동적 렌더 + `amazon-ecs-deploy-task-definition`). 핵심 Task Def:

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
> `node:alpine`의 기본 entrypoint가 `HOSTNAME` 자동변수를 ENI hostname으로 set → standalone server가 ENI IP에만 bind → `localhost` 헬스체크 실패 → SIGTERM(exit 143).
> Task Def `environment`에 `{"name":"HOSTNAME","value":"0.0.0.0"}` 명시. 영구 처치는 Dockerfile에 `ENTRYPOINT []`. → [ECS 트러블슈팅](/log/ecs-troubleshooting/)

**첫 dispatch** 후 deploy job이 `service ... is MISSING`(정상, revision 1 등록됨)이면 **ECS Service 콘솔 생성**:

| 항목 | 값 |
|---|---|
| 시작 유형 | FARGATE, LATEST |
| 작업 정의 | `<SERVICE>` 최신 revision |
| 원하는 작업 수 | **2** |
| 배포 회로 차단기 / 실패 시 롤백 | ✅ / ✅ |
| 서브넷 | **Private 2개만** |
| 보안 그룹 | `<PROJECT>-prod-<SERVICE>-task-sg` |
| 퍼블릭 IP | **❌ 비활성화** |
| 로드 밸런싱 | ALB + 기존 443 리스너 + Target Group |

## Phase 6 — 첫 배포 + 검증

```bash
# Task 상태 ([2,2,0]이면 RUNNING)
aws ecs describe-services --cluster <PROJECT>-prod --services <SERVICE> \
  --region ap-northeast-2 --query "services[0].[desiredCount,runningCount,pendingCount]"

# 로그 (Spring: "Started ... in X.X seconds" / Next.js: "Ready in X.Xs")
aws logs tail /ecs/<PROJECT>-prod/<SERVICE> --follow --region ap-northeast-2 --since 5m

# 외부 검증
curl -i https://<SUBDOMAIN>.<DOMAIN>/<HEALTH_PATH>   # → 200 OK
```

운영 시작: `git tag v1.0.0 && git push origin v1.0.0` → GHA 자동 빌드 → ECS 무중단 배포. 상세는 [ECS 배포·롤백](/log/ecs-deploy-rollback/).

## 멀티 서비스 추가 (BE 위에 FE)

| 재활용 | 새로 만들 것 |
|---|---|
| VPC, Subnet | ECR `myapp/fe` |
| ALB, ACM, Route 53 호스팅 영역 | IAM Role `github-actions-myapp-fe-deploy` |
| ALB 보안그룹 | Task SG `myapp-prod-fe-task-sg` |
| Task Execution Role | Task Role `ecsTaskRole-myapp-fe` |
| ECS Cluster, OIDC Provider | Target Group `myapp-fe-tg`, Log Group `/ecs/myapp-prod/fe` |
| | ALB Listener Rule (Host header), Route 53 A 레코드, ECS Service |

**핵심 추가 — ALB Listener Rule** (Host header 기반 분기):

```
Listener 443
├─ priority 100: Host == app.example.com → myapp-fe-tg  (FE)
└─ default:                              → myapp-be-tg  (BE)
```

## SOP 체크리스트

```text
[ ] 사전 결정 (계정/리전/도메인/ARM/DB)
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
