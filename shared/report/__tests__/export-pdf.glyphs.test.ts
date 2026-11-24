/**
 * @module shared/report/__tests__/export-pdf.glyphs
 *
 * Буквы PDF отчёта стоят там, где их поставила разметка.
 *
 * На Linux с полным хинтингом нехинтованный фирменный шрифт рисуется холстом вразнобой:
 * буквы внутри слова слипаются и расходятся. Холст режим `geometricPrecision` не соблюдает,
 * поэтому конвейер переводит html2canvas в побуквенную ветку (ненулевой `letter-spacing`),
 * где каждая буква встаёт в позицию, измеренную DOM без хинтинга. Проверяется, что режим
 * и интервал выставлены ДО растеризации, а авторская разрядка не тронута.
 */
import { describe, expect, it, vi } from "vitest";
import { exportReportPdf } from "../export-pdf";

/** То, что растеризатор увидел в момент вызова. */
interface Seen {
  paragraph?: string;
  tracked?: string;
  root?: string;
  textRendering?: string;
}

/**
 * Двойники библиотек; растеризатор запоминает стили на момент снимка.
 *
 * @param seen Куда записать увиденное.
 */
function makeDeps(seen: Seen) {
  return {
    document,
    html2canvas: vi.fn(async (el: HTMLElement) => {
      seen.paragraph = el.querySelector<HTMLElement>("p")?.style.letterSpacing;
      seen.tracked = el.querySelector<HTMLElement>(".tracked")?.style.letterSpacing;
      seen.root = el.querySelector<HTMLElement>(".tb-report")?.style.letterSpacing;
      seen.textRendering = el
        .closest<HTMLElement>("div[style*='-9999px']")
        ?.style.getPropertyValue("text-rendering");
      return { width: 595, height: 842, toDataURL: () => "data:image/jpeg;base64,AAAA" };
    }),
    jsPDF: class {
      addImage() {}
      addPage() {}
      link() {}
      save() {}
    },
  } as unknown as Parameters<typeof exportReportPdf>[2];
}

describe("PDF отчёта: позиции букв", () => {
  it("текст с нулевым интервалом получает побуквенный интервал, разрядка автора остаётся", async () => {
    const seen: Seen = {};
    await exportReportPdf(
      {
        layout:
          '<div class="tb-report"><p>Целевой уровень</p><span class="tracked" style="letter-spacing: 2px">ИТОГ</span></div>',
        context: {},
      },
      "T",
      makeDeps(seen),
    );
    expect(seen.root).toBe("0.01px");
    expect(seen.paragraph === "0.01px" || seen.paragraph === "").toBe(true);
    expect(seen.tracked).toBe("2px");
    expect(seen.textRendering?.toLowerCase()).toBe("geometricprecision");
  });
});
