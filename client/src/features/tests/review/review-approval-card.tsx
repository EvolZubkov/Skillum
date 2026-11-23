/**
 * @module features/tests/review/review-approval-card
 * @description PRD-52: карточка согласования ОДНОГО объекта - «Тест в целом» или текущий вопрос. Разметка по
 * эскизу `docs/wireframes/approved/prd52-review-approval.html` (состояния `none`, `set`, `stale`, `test`, `author`).
 *
 * Два вида по зрителю, потому что рецензент не видит чужих отметок (решение владельца 2026-11-23):
 *   - рецензент: чекбокс «Согласовано», дата и время его отметки, при устаревшей отметке - тег и кнопка
 *     «Согласовать новую редакцию». Ни имён других, ни счётчика «N из M».
 *   - автор и владелец: чекбокса нет, согласование они принимают, а не дают; виден счётчик и список согласовавших
 *     с датой и временем.
 */
import { Avatar, Button, Card, CardBody, CardHeader, Checkbox, Cluster, Stack, Tag } from "@skillum/ui-kit";
import { initialsOf, when } from "./review-format";
import type { ReviewApproval } from "./review-approval-api";

export interface ReviewApprovalCardProps {
  /** Заголовок карточки: «Тест в целом», «Вопрос 4». */
  title: string;
  /** Что именно согласуется, для строки «… изменён после вашей отметки»: «Вопрос», «Раздел». */
  subject: string;
  viewer: "author" | "reviewer";
  /** Отметки по этому объекту: у рецензента - его единственная, у автора - всех рецензентов. */
  approvals: ReviewApproval[];
  /** Размер круга рецензентов - знаменатель счётчика автора. */
  circleSize?: number;
  busy?: boolean;
  onApprove: () => void;
  onWithdraw: (approvalId: string) => void;
  testId?: string;
}

/** Строка «аватар, имя, дата» из эскиза. */
function PersonRow({ name, mine, iso, stale }: { name: string; mine: boolean; iso: string; stale?: boolean }) {
  return (
    <Cluster gap={2} align="center" className="rva__person">
      <Avatar size="xs" initials={initialsOf(name, mine)} />
      <strong className="rvp__who">{name}</strong>
      <span className="rvp__when">{when(iso)}</span>
      {stale ? <Tag size="s" tone="warning" variant="outline">по прежней редакции</Tag> : null}
    </Cluster>
  );
}

export function ReviewApprovalCard({
  title, subject, viewer, approvals, circleSize = 0, busy = false, onApprove, onWithdraw, testId,
}: ReviewApprovalCardProps) {
  if (viewer === "author") {
    // «Согласовали» - действующие отметки: устаревшая согласованием не считается.
    const active = approvals.filter((a) => !a.stale).length;
    return (
      <Card variant="outlined" size="sm" data-testid={testId}>
        <CardHeader title={title} />
        <CardBody>
          <Stack gap={3}>
            <Cluster gap={2} align="center" className="rva__row">
              <span className="rvp__spacer" />
              <Tag size="s" variant="outline">{`согласовали ${active} из ${circleSize}`}</Tag>
            </Cluster>
            {approvals.length ? (
              <Stack gap={2}>
                {approvals.map((a) => (
                  <PersonRow
                    key={a.id}
                    name={a.reviewerName || a.reviewerId}
                    mine={false}
                    iso={a.approvedAt}
                    stale={a.stale}
                  />
                ))}
              </Stack>
            ) : null}
          </Stack>
        </CardBody>
      </Card>
    );
  }

  const own = approvals[0];
  return (
    <Card variant="outlined" size="sm" data-testid={testId}>
      <CardHeader title={title} />
      <CardBody>
        <Stack gap={3}>
          <Cluster gap={2} align="center" className="rva__row">
            <Checkbox
              label="Согласовано"
              checked={Boolean(own)}
              disabled={busy}
              onChange={() => (own ? onWithdraw(own.id) : onApprove())}
            />
            <span className="rvp__spacer" />
            {own && !own.stale ? <Tag size="s" tone="success">{when(own.approvedAt)}</Tag> : null}
            {own?.stale ? <Tag size="s" tone="warning">по прежней редакции</Tag> : null}
          </Cluster>

          {own?.stale ? (
            <Stack gap={3}>
              <p className="rva__note">
                {own.changedAt
                  ? `${subject} изменён ${when(own.changedAt)}, после вашей отметки от ${when(own.approvedAt)}.`
                  : `${subject} изменён после вашей отметки от ${when(own.approvedAt)}.`}
              </p>
              <Cluster gap={2} align="center">
                <Button variant="primary" size="s" disabled={busy} onClick={onApprove}>
                  Согласовать новую редакцию
                </Button>
              </Cluster>
            </Stack>
          ) : null}

          {own && !own.stale ? <PersonRow name="Вы" mine iso={own.approvedAt} /> : null}
        </Stack>
      </CardBody>
    </Card>
  );
}
