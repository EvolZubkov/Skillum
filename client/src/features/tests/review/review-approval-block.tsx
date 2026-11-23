/**
 * @module features/tests/review/review-approval-block
 * @description PRD-52: блок «Согласование» над лентой комментариев в окне рецензирования (режим `player`) и
 * легенда «Обозначения на карте вопросов» под ней. Две карточки: «Тест в целом» и текущий объект прогона.
 * Эскиз: `docs/wireframes/approved/prd52-review-approval.html`.
 *
 * Данные - один кэш `useReviewApprovals`, общий с бейджами на карте вопросов; кто чьи отметки видит, решает
 * сервер (рецензент получает только свои), блок лишь рисует то, что пришло.
 */
import { Cluster, Stack } from "@skillum/ui-kit";
import type { ReviewAnchor } from "@shared/review/anchor";
import { approvalsAt } from "./review-approval-model";
import { ReviewApprovalCard } from "./review-approval-card";
import { useReviewApprovals } from "./use-review-approvals";
import type { ApprovalBadge } from "@shared/review/approval-state";

export interface ReviewApprovalBlockProps {
  testId: string;
  /** Место текущего экрана прогона: вопрос или тест целиком. */
  screenAnchor: ReviewAnchor;
  /** Заголовок карточки текущего вопроса; по умолчанию «Текущий вопрос». */
  screenTitle?: string;
}

export function ReviewApprovalBlock({ testId, screenAnchor, screenTitle }: ReviewApprovalBlockProps) {
  const { viewer, approvals, circle, approve, withdraw } = useReviewApprovals(testId);
  if (!viewer) return null;

  const busy = approve.isPending || withdraw.isPending;
  const testAnchor: ReviewAnchor = { kind: "test" };
  // Экран, у которого нет собственного объекта согласования, второй карточки не получает: «тест в целом» уже есть.
  const showScreenCard = screenAnchor.kind !== "test";

  return (
    <Stack gap={2} className="rva" data-testid="review-approval-block">
      <div className="tb-section-label">Согласование</div>
      <ReviewApprovalCard
        title="Тест в целом"
        subject="Тест"
        viewer={viewer}
        approvals={approvalsAt(approvals, testAnchor)}
        circleSize={circle.length}
        busy={busy}
        onApprove={() => approve.mutate(testAnchor)}
        onWithdraw={(id) => withdraw.mutate(id)}
        testId="approval-card-test"
      />
      {showScreenCard ? (
        <ReviewApprovalCard
          title={screenTitle ?? "Текущий вопрос"}
          subject="Вопрос"
          viewer={viewer}
          approvals={approvalsAt(approvals, screenAnchor)}
          circleSize={circle.length}
          busy={busy}
          onApprove={() => approve.mutate(screenAnchor)}
          onWithdraw={(id) => withdraw.mutate(id)}
          testId="approval-card-screen"
        />
      ) : null}
    </Stack>
  );
}

/** Строки легенды по зрителю: подписи дословно из эскиза. */
const LEGEND: Record<"reviewer" | "author", { badge: ApprovalBadge; text: string }[]> = {
  reviewer: [
    { badge: "all", text: "вы согласовали" },
    { badge: "stale", text: "изменено после вашей отметки" },
  ],
  author: [
    { badge: "all", text: "согласовали все" },
    { badge: "part", text: "согласовали не все" },
    { badge: "stale", text: "изменено после отметки" },
  ],
};

/**
 * Легенда бейджей на карте вопросов, внизу вкладки. В строке карты при листании легенды нет, поэтому значения
 * бейджей объясняются здесь и в панели «Все вопросы».
 */
export function ReviewApprovalLegend({ testId }: { testId: string }) {
  const { viewer } = useReviewApprovals(testId);
  if (!viewer) return null;
  return (
    <Stack gap={2} data-testid="review-approval-legend">
      <div className="tb-section-label">Обозначения на карте вопросов</div>
      <div className="ou-quiz ou-quiz--circle ou-quiz--m">
        <Cluster gap={3} className="ou-quiz__legend">
          {LEGEND[viewer].map((item) => (
            <span className="ou-quiz__legend-item" key={item.badge}>
              <span className="ou-quiz__legend-dot" data-review-approved={item.badge} />
              {item.text}
            </span>
          ))}
        </Cluster>
      </div>
    </Stack>
  );
}
