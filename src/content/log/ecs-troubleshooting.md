---
title: "ECS 트러블슈팅"
date: 2026-06-22
category: "INFRA"
tags: ["troubleshooting","infra","AWS","ECS","Fargate"]
description: "ECS Fargate 셋업·운영에서 마주친 함정과 해결책 종합. 셋업은 ECS Fargate 셋업 가이드, 인프라 현황은 운영 인프라 현황, 배포/롤백은 ECS 배포·롤백."
minutes: 10
---
> <span class="co co-abstract">📋 요약 개요</span>
> ECS Fargate 셋업·운영에서 마주친 함정과 해결책 종합. 셋업은 [ECS Fargate 셋업 가이드](/log/ecs-fargate-setup-guide/), 인프라 현황은 운영 인프라 현황, 배포/롤백은 [ECS 배포·롤백](/log/ecs-deploy-rollback/).
> 인덱스: ECS Fargate 인프라 MOC

## IAM / OIDC 인증

| 증상 | 원인 | 해결 |
|---|---|---|
| `Could not load credentials` | Secret 미등록 또는 이름 오타 | Repository Secret `AWS_DEPLOY_ROLE_ARN` 등록 |
| `Source Account ID is needed` | Secret에 Role Name만 (전체 ARN X) | 전체 ARN으로 업데이트 |
| `is not authorized ... sts:AssumeRoleWithWebIdentity` | Trust Policy `sub` 조건과 저장소명 불일치 | `repo:OWNER/REPO:*` 확인 |
| Audience 입력 "잘못된 값" | 한글 입력기/번역 자동 변환 | 영문 모드 + 드롭다운 선택 |
| 인라인 정책 안 박힘 | `RegisterTaskDefinition` 권한 누락 | ECS Deploy 인라인 정책 추가 |

## ECS Task 시작 실패

| 에러 | 원인 | 해결 |
|---|---|---|
| `log group does not exist` | CloudWatch Log Group 미생성 | `aws logs create-log-group` |
| `unable to assume the role 'ecsTaskRole-...'` | Task Role 신뢰 정책 잘못 | "Elastic Container Service Task" 사용 사례로 재생성 |
| `CannotPullContainerError` | ECR 권한 또는 ARM 호환성 | Task Execution Role + 이미지 platform 확인 |
| `Essential container exited` (exit 1) | 앱 시작 실패 | CloudWatch Logs 에러 메시지 확인 |
| `ResourceInitializationError: ... pull secrets` | Task Execution Role 권한 부족 | `AmazonECSTaskExecutionRolePolicy` 연결 확인 |
| **exit code 143 (SIGTERM)** | 헬스체크 3회 실패 후 ECS가 보낸 정상 종료 신호 (원인 자체 X) | CloudWatch 로그 첫 30줄에서 진짜 시작 실패 원인 찾기 |
| **exit code 137 (SIGKILL)** | OOM 또는 강제 종료 | Task Memory 증설 또는 누수 점검 |

> <span class="co co-danger">🚨 위험 Next.js standalone UNHEALTHY인데 로그엔 `Ready in 0ms`</span>
> **원인**: `node:alpine`의 entrypoint sh가 `HOSTNAME` 자동변수를 ENI hostname(`ip-10-x-x-x`)으로 set → standalone server가 ENI IP에만 bind → `localhost:3011` 헬스체크가 다른 인터페이스라 도달 X → 3회 실패 → SIGTERM(exit 143). Dockerfile의 `ENV HOSTNAME=0.0.0.0`도 덮어써짐.
> **해결**: Task Definition `environment`에 `{"name":"HOSTNAME","value":"0.0.0.0"}` 명시(runtime env가 image ENV + entrypoint 자동변수를 덮음). 영구 처치는 Dockerfile에 `ENTRYPOINT []` 추가해 alpine entrypoint 우회.

## Target Group Unhealthy

| 증상 | 원인 | 해결 |
|---|---|---|
| `Target.Timeout` | 보안그룹 차단 또는 앱 응답 X | Task SG 인바운드 (ALB SG → 포트) |
| `initial` 영원히 | Service 등록 못 함 | Subnet/SG/네트워크 설정 확인 |
| Health checks failed | 헬스체크 경로 응답 X 또는 늦음 | 경로/포트/grace period 확인 |
| 정상 200인데 unhealthy | 응답 헤더 Content-Type 등 | 헬스체크 success code 확인 |

## 보안그룹 (가장 자주 빠뜨림)

```text
인터넷 → ALB (alb-sg: 443/80 from 0.0.0.0/0)  ✅
ALB  → Task (task-sg: <PORT> from alb-sg)     ← 자주 빠짐
Task → RDS  (rds-sg: 3306 from task-sg)       ← 자주 빠짐
```

> <span class="co co-warning">⚠️ 주의 포트 0으로 만들면 Timeout</span>
> 정확한 포트(BE 8082, FE 3011, RDS 3306) 필수.

## ALB Listener Rule

| 증상 | 원인 | 해결 |
|---|---|---|
| 기본 도메인 → 다른 서비스로 감 | priority 잘못 / Host 조건 누락 | priority 낮게, Host 정확히 |
| `503 Service Temporarily Unavailable` | Target Group 비어있음/unhealthy | Service 띄우기 / 헬스 확인 |
| HTTPS 인증서 오류 | ACM 와일드카드 부적합 | `*.example.com`은 `app.example.com` 커버, `example.com`은 별도 |

## RDS

| 증상 | 원인 | 해결 |
|---|---|---|
| `Communications link failure` (앱) | RDS 보안그룹 차단 | Task SG → 3306 인바운드 |
| `Unknown database 'myapp'` | 초기 DB 이름 안 박음 | mysql 접속해서 `CREATE DATABASE` |
| 본인 PC에서 timeout | 퍼블릭 액세스 OFF | 임시 ON → 작업 → OFF |
| failover 깨짐 | 인스턴스 endpoint 사용 | **반드시 클러스터 endpoint** |
| 자동 선택이 r 클래스 ($300+) | 콘솔 기본값 | **t4g.medium**로 다운사이즈 |

```bash
# RDS 점검 시 임시 퍼블릭 ON → 작업 후 OFF (필수)
aws rds modify-db-instance --db-instance-identifier myapp-prod-aurora-instance-1 \
  --publicly-accessible --apply-immediately --region ap-northeast-2
aws rds modify-db-instance --db-instance-identifier myapp-prod-aurora-instance-1 \
  --no-publicly-accessible --apply-immediately --region ap-northeast-2

# 마스터 암호 리셋 (1Password + GitHub Secret PROD_DB_PASSWORD 업데이트 필수)
NEW_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-20)
aws rds modify-db-cluster --db-cluster-identifier myapp-prod-aurora \
  --master-user-password "$NEW_PASSWORD" --apply-immediately --region ap-northeast-2
```

## NAT Gateway / EIP

| 증상 | 원인 | 해결 |
|---|---|---|
| VPC 마법사 NAT 생성 실패 | 회사 공유 계정 EIP 한도 초과 | 미사용 EIP 해제 또는 quota 증가 |
| 외부 API 호출 timeout | NAT 없음 또는 라우팅 오류 | NAT GW 라우팅 테이블 확인 |
| BizTalk IP 화이트리스트 | NAT EIP 확인 | `describe-nat-gateways`의 PublicIp |

## GHA Workflow

| 증상 | 원인 | 해결 |
|---|---|---|
| `service ... is MISSING` (첫 dispatch) | 정상 (Service 아직 없음) | ECS Service 콘솔 생성 |
| `Waiter has timed out` | Service stability 못 됨 | Task 진단 (위 항목) |
| 빌드 느림 (15~20분) | x86 러너에서 QEMU로 ARM 에뮬레이션 | **`runs-on: ubuntu-24.04-arm`** + `setup-qemu-action` 제거 → 네이티브 ARM 3~5분, private repo 분당 비용도 저렴 |
| 빌드 220분+ / QEMU hang | QEMU 에뮬레이션 stall | 캔슬 + ARM 네이티브 러너로 전환 |
| Multi-arch (amd64+arm64) 필요 | ARM 러너에선 amd64가 에뮬레이션 | 단일 러너에 `setup-qemu-action` 유지 또는 matrix로 러너 분리 |

## 진단 종합 스크립트

`/tmp/diagnose.sh` — `bash /tmp/diagnose.sh myapp-prod myapp-be`:

```bash
#!/bin/bash
CLUSTER=$1; SERVICE=$2; REGION=ap-northeast-2

echo "=== Service Status ==="
aws ecs describe-services --cluster $CLUSTER --services $SERVICE --region $REGION \
  --query 'services[0].[desiredCount,runningCount,pendingCount,deployments[0].rolloutState]'

echo "=== Recent Events ==="
aws ecs describe-services --cluster $CLUSTER --services $SERVICE --region $REGION \
  --query 'services[0].events[:5].message'

echo "=== STOPPED Tasks ==="
STOPPED=$(aws ecs list-tasks --cluster $CLUSTER --service-name $SERVICE \
  --desired-status STOPPED --region $REGION --max-results 3 --query 'taskArns' --output text)
if [ -n "$STOPPED" ]; then
  aws ecs describe-tasks --cluster $CLUSTER --tasks $STOPPED --region $REGION \
    --query 'tasks[*].[stoppedReason,containers[0].reason,containers[0].exitCode]' --output table
fi

echo "=== Network Config ==="
aws ecs describe-services --cluster $CLUSTER --services $SERVICE --region $REGION \
  --query 'services[0].networkConfiguration.awsvpcConfiguration'

echo "=== Recent Logs ==="
aws logs tail /ecs/${CLUSTER}/${SERVICE} --region $REGION --since 5m 2>/dev/null | tail -30
```

## 배포 후 Service unhealthy 빠른 점검

```bash
# Service 상태 + 이벤트
aws ecs describe-services --cluster myapp-prod --services <SERVICE> --region ap-northeast-2 \
  --query 'services[0].[desiredCount,runningCount,events[:5]]'

# STOPPED Task 이유
STOPPED=$(aws ecs list-tasks --cluster myapp-prod --service-name <SERVICE> \
  --desired-status STOPPED --region ap-northeast-2 --max-results 3 --query 'taskArns' --output text)
aws ecs describe-tasks --cluster myapp-prod --tasks $STOPPED --region ap-northeast-2 \
  --query 'tasks[*].[stoppedReason,containers[0].reason,containers[0].exitCode]'

# Target Group health
TG_ARN=$(aws elbv2 describe-target-groups --names <TG_NAME> --region ap-northeast-2 \
  --query 'TargetGroups[0].TargetGroupArn' --output text)
aws elbv2 describe-target-health --target-group-arn $TG_ARN --region ap-northeast-2 \
  --query 'TargetHealthDescriptions[*].[Target.Id,TargetHealth.State,TargetHealth.Description]'
```

## 참고

- 셋업 SOP: [ECS Fargate 셋업 가이드](/log/ecs-fargate-setup-guide/)
- 리소스 식별자: 운영 인프라 현황
- 배포/롤백: [ECS 배포·롤백](/log/ecs-deploy-rollback/)
- 인덱스: ECS Fargate 인프라 MOC
