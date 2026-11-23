/**
 * @module features/tests/review/review-tab
 * @description PRD-52: вкладка «Рецензирование» ящика редактора теста. Рейл из двух пунктов - «Согласование» и
 * «Комментарии» (на нём число открытых). Раньше вкладка называлась «Комментарии» и была одной лентой; её роль
 * расширилась согласованием рецензентами (спека 2026-11-23-review-approval-flag-design, решение 10).
 *
 * Пока раздела «Согласование» нет (`approval` не передан), рейл состоит из одного пункта «Комментарии» и вкладка
 * ведёт себя как прежняя лента.
 */
import { useState, type ReactNode } from "react";
import { TabRail, type RailItem } from "@/features/tests/editor/sections/tab-rail";

export type ReviewTabKey = "approval" | "comments";

export interface ReviewTabProps {
  /** Число открытых комментариев - значок на пункте «Комментарии». */
  openComments: number;
  /** Содержимое пункта «Согласование»; без него пункта в рейле нет. */
  approval?: ReactNode;
  /** Содержимое пункта «Комментарии». */
  comments: ReactNode;
  /** Пункт, на котором вкладка открывается; по умолчанию - «Согласование», если оно есть. */
  initialKey?: ReviewTabKey;
}

export function ReviewTab({ openComments, approval, comments, initialKey }: ReviewTabProps) {
  const hasApproval = approval !== undefined && approval !== null;
  const [active, setActive] = useState<ReviewTabKey>(initialKey ?? (hasApproval ? "approval" : "comments"));

  const items: RailItem<ReviewTabKey>[] = [
    ...(hasApproval ? [{ key: "approval" as const, label: "Согласование" }] : []),
    { key: "comments", label: "Комментарии", badge: openComments },
  ];

  return (
    <TabRail
      items={items}
      active={hasApproval ? active : "comments"}
      onChange={setActive}
      ariaLabel="Разделы вкладки «Рецензирование»"
      testIdPrefix="review"
    >
      {hasApproval && active === "approval" ? approval : comments}
    </TabRail>
  );
}
