---
title: "ECS 배포·롤백"
date: 2026-06-22
category: "INFRA"
tags: ["reference","infra","AWS","ECS","CICD","deployment"]
description: "myapp 운영 배포 파이프라인(GitHub Actions → ECS Rolling)과 자동/수동 롤백 절차. 인프라 현황은 운영 인프라 현황, 셋업은 ECS Fargate 셋업 가이드, 문제는 E…"
minutes: 4
---
> <span class="co co-abstract">📋 요약 개요</span>
> `myapp` 운영 배포 파이프라인(GitHub Actions → ECS Rolling)과 자동/수동 롤백 절차. 인프라 현황은 운영 인프라 현황, 셋업은 [ECS Fargate 셋업 가이드](/log/ecs-fargate-setup-guide/), 문제는 [ECS 트러블슈팅](/log/ecs-troubleshooting/).
> 인덱스: ECS Fargate 인프라 MOC

## 자동 배포 (정상 시)

<pre class="mermaid">
graph TD
    A[main 머지] --&gt; B[운영 태그 생성+푸시&lt;br/&gt;git tag v0.2.0]
    B --&gt; C[GitHub Actions 트리거]
    C --&gt; D[build-and-push job&lt;br/&gt;Docker build arm64 → ECR push]
    D --&gt; E[deploy-to-ecs job&lt;br/&gt;environment: production]
    E --&gt; F[register-task-definition&lt;br/&gt;revision N+1]
    F --&gt; G[update-service&lt;br/&gt;+ wait-for-service-stability]
    G --&gt; H[ECS Rolling 배포&lt;br/&gt;새 Task 2개 → 헬스체크 → 트래픽 스왑 → 구 Task drain]
    H --&gt; I[완료 7~10분]
</pre>

```bash
# 운영 배포 트리거
git checkout main && git pull
git tag v0.2.0
git push origin v0.2.0
```

이미지 태그: `v0.2.0`, `latest`, `<sha>`. deploy job이 Task Definition을 동적 생성(이미지 URI + 환경변수 + IAM Role)하고 `register-task-definition` → `update-service` → `wait-for-service-stability`.

## 자동 롤백 (Circuit Breaker)

> <span class="co co-info">ℹ️ INFO 새 Task 연속 헬스체크 실패 시</span>
> ECS가 자동으로 이전 Task Definition revision으로 복원. 사람 개입 0. 알림은 GHA workflow 실패 + ECS Service 이벤트로 표시.

> <span class="co co-warning">⚠️ 주의 잡지 못하는 케이스</span>
> **헬스체크는 통과하지만 비즈니스 로직이 깨진 버그**는 Circuit Breaker가 못 잡는다 → 아래 수동 롤백 필요.

## 수동 롤백

### A. GitHub Actions (감사 추적 가능, 권장)

```bash
# 1) 롤백할 revision 확인
aws ecs list-task-definitions --family-prefix myapp-be \
  --sort DESC --max-results 10 --region ap-northeast-2 \
  --query 'taskDefinitionArns[*]' --output table

# 각 revision의 이미지 추적
for i in 5 4 3 2 1; do
  IMAGE=$(aws ecs describe-task-definition --task-definition myapp-be:$i \
    --region ap-northeast-2 \
    --query 'taskDefinition.containerDefinitions[0].image' --output text 2>/dev/null)
  echo "revision $i → $IMAGE"
done
```

2. GitHub → `myapp-be`(또는 `myapp-fe`) → Actions → **"Rollback ECS Production"**
3. Run workflow → 입력: `task_definition_revision`(예: 4), `reason`(예: "v0.2.0 회원 탈퇴 API 트랜잭션 오류")
4. (Required reviewers 설정 시) 승인 → 자동 진행

### B. AWS CLI (긴급)

```bash
aws ecs update-service \
  --cluster myapp-prod --service myapp-be \
  --task-definition myapp-be:4 \
  --force-new-deployment --region ap-northeast-2
```

### C. AWS Console (가장 빠름, 긴급)

ECS → 클러스터 `myapp-prod` → 서비스 → 업데이트 → 작업 정의 개정 드롭다운에서 이전 revision → **새 배포 강제 적용** ✅ → 업데이트.

### D. Git Revert (안정화 후 정리)

```bash
git revert <문제 커밋>
git push origin main
git tag v0.2.1 && git push origin v0.2.1
```
→ 정상 파이프라인으로 새 배포.

## DB 마이그레이션 안전 배포

> <span class="co co-warning">⚠️ 주의 Flyway expand-contract 패턴</span>
> 운영급에선 배포 중 두 버전이 공존하는 시점을 대비해야 한다. `DROP COLUMN`·`NOT NULL 추가`·컬럼명 변경은 즉시 적용 X.
> 1. **1차 배포**: 새 컬럼 추가 (옛 코드도 작동)
> 2. **2차 배포**: 새 컬럼만 쓰는 코드 배포
> 3. **3차 배포**: 옛 컬럼 제거

## Aurora Failover

- 자동 failover: 30초~1분
- BE는 클러스터 엔드포인트(`cluster-xxxxxxxxxxxx`) 사용 → 자동 추적
- 인스턴스 엔드포인트(`instance-1.xxxxxxxxxxxx`) **사용 금지**

## 참고

- 배포 실패/롤백 디버깅: [ECS 트러블슈팅](/log/ecs-troubleshooting/)
- 리소스 식별자: 운영 인프라 현황
- 인덱스: ECS Fargate 인프라 MOC
