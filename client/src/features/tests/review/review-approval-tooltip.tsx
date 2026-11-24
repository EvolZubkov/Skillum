/**
 * @module features/tests/review/review-approval-tooltip
 * @description PRD-52 (issue #62): the author's tooltip over a question dot of the question map - who approved
 * the question and when. Drawn by the host window above the package iframe (decision: the frame has no project
 * styles; see `use-approval-tooltip`). Author and owner only: a reviewer sees nobody else's marks, so for them
 * the hook is disabled and nothing is rendered. Wireframe: `docs/wireframes/approved/prd52-review-approval.html`.
 */
import { useRef, type RefObject } from "react";
import { Avatar, Cluster, Popover, PopoverHeader, Stack, Tag } from "@skillum/ui-kit";
import { buildApprovalTooltip } from "./approval-tooltip-model";
import { deliveredQuestionIds } from "./delivery-order";
import { initialsOf, when } from "./review-format";
import { useApprovalTooltip } from "./use-approval-tooltip";
import { useReviewApprovals } from "./use-review-approvals";
import "./review-panel.css";

export interface ReviewApprovalTooltipProps {
  frameRef: RefObject<HTMLIFrameElement | null>;
  testId: string;
  /** Changes on every inspector snapshot. */
  tick: unknown;
}

export function ReviewApprovalTooltip({ frameRef, testId, tick }: ReviewApprovalTooltipProps) {
  const { viewer, approvals, circle } = useReviewApprovals(testId);
  const active = useApprovalTooltip(frameRef, viewer === "author", tick);
  const anchorRef = useRef<HTMLSpanElement>(null);

  const win = frameRef.current?.contentWindow as unknown as Window | undefined;
  const questionId = active && win ? deliveredQuestionIds(win)[active.index] : undefined;
  const tooltip = active && questionId ? buildApprovalTooltip(active.index + 1, questionId, approvals, circle) : null;

  return (
    <>
      {/* Invisible anchor laid over the dot: the Popover positions against a host element. */}
      <span
        ref={anchorRef}
        aria-hidden="true"
        style={{
          position: "fixed",
          pointerEvents: "none",
          left: active?.rect.left ?? 0,
          top: active?.rect.top ?? 0,
          width: active?.rect.width ?? 0,
          height: active?.rect.height ?? 0,
        }}
      />
      <Popover
        open={Boolean(tooltip)}
        anchorRef={anchorRef}
        placement="bottom"
        align="start"
        arrow={false}
        closeOnOutside={false}
        closeOnEsc={false}
        role="tooltip"
        data-testid="approval-tooltip"
        style={{ pointerEvents: "none" }}
        header={tooltip ? <PopoverHeader title={tooltip.title} subtitle={tooltip.subtitle} /> : undefined}
      >
        {tooltip ? (
          <Stack gap={2}>
            {tooltip.rows.map((row) => (
              <Cluster key={row.userId} gap={2} align="center" wrap={false} className="rvt__row" data-testid="approval-tooltip-row">
                <Avatar size="xs" initials={initialsOf(row.name, false)} />
                <strong className="rvp__who rvt__name" title={row.name || undefined}>{row.name || "Рецензент"}</strong>
                {row.iso ? (
                  <span className="rvp__when">{when(row.iso)}</span>
                ) : (
                  <Tag size="s" variant="outline">не согласовал</Tag>
                )}
                {row.iso && row.stale ? <Tag size="s" tone="warning" variant="outline">по прежней редакции</Tag> : null}
              </Cluster>
            ))}
          </Stack>
        ) : null}
      </Popover>
    </>
  );
}
