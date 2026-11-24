/**
 * @module features/templates/__tests__/update-modal.test
 * @description Tests for {@link UpdateModal}: a package of another template
 * (`ID_MISMATCH`) is reported as a wrong file that left the template unchanged,
 * while any other failed re-validation keeps the «помечен невалидным» banner.
 * The update mutation hook is mocked so outcomes are driven directly.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { AdminTemplate } from "../use-admin-templates";

const hook = vi.hoisted(() => ({
  state: {
    isPending: false,
    isError: false,
    error: null as { message: string } | null,
    reset: vi.fn(),
    nextResult: null as unknown,
    mutate: vi.fn(),
  },
}));
hook.state.mutate = vi.fn((_file: File, opts?: { onSuccess?: (r: unknown) => void }) => {
  if (hook.state.nextResult && opts?.onSuccess) opts.onSuccess(hook.state.nextResult);
});

vi.mock("../use-admin-templates", () => ({ useUpdateTemplate: () => hook.state }));

// eslint-disable-next-line import/first -- after vi.mock
import { UpdateModal } from "../update-modal";

const template = {
  id: "certification",
  name: "Сертификация (РТК)",
  version: "1.30.3",
} as AdminTemplate;

beforeEach(() => {
  vi.clearAllMocks();
  hook.state.isPending = false;
  hook.state.isError = false;
  hook.state.error = null;
  hook.state.nextResult = null;
});

/** Drop a fake .zip through the DS FileUploader's hidden input (rendered in a portal). */
function dropZip() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["x"], "tpl.zip", { type: "application/zip" });
  fireEvent.change(input, { target: { files: [file] } });
}

describe("<UpdateModal />", () => {
  it("reports a package of another template as a wrong file, not an invalidation", () => {
    hook.state.nextResult = {
      ok: false,
      status: 422,
      error: "Выбран архив другого шаблона («standard-rt» вместо «certification»). Шаблон не изменён.",
      report: {
        blocking: [{ code: "ID_MISMATCH", message: 'id обновления "standard-rt" не совпадает с "certification"' }],
      },
    };
    render(<UpdateModal open onClose={vi.fn()} template={template} />);
    dropZip();
    expect(screen.getByText("Выбран архив другого шаблона")).toBeInTheDocument();
    expect(screen.getByText(/Шаблон не изменён/)).toBeInTheDocument();
    expect(screen.queryByText(/помечен невалидным/)).not.toBeInTheDocument();
  });

  it("keeps the invalidation banner for any other failed re-validation", () => {
    hook.state.nextResult = {
      ok: false,
      status: 422,
      error: "Обновление не прошло валидацию",
      report: { blocking: [{ code: "MANIFEST_MISSING", message: "нет manifest.json" }] },
    };
    render(<UpdateModal open onClose={vi.fn()} template={template} />);
    dropZip();
    expect(screen.getByText(/помечен невалидным/)).toBeInTheDocument();
    expect(screen.getByText("нет manifest.json")).toBeInTheDocument();
  });
});
