/**
 * @module features/templates/update-modal
 * @description Re-upload a new ZIP version for an existing uploaded template
 * (PRD-3 §5.5–5.6). The package id must match. A passing validation refreshes the
 * manifest/version (re-run the health check afterwards to re-activate); a failing
 * one flags the template `invalid` and lists the blocking errors. A package of
 * another template (`ID_MISMATCH`) is rejected without touching the template, so
 * the banner says the template is unchanged instead of claiming it was invalidated.
 */
import { useEffect, useState } from "react";
import { Banner, Button, FileUploader, ModalDialog } from "@skillum/ui-kit";
import { AlertCircle } from "lucide-react";
import { useUpdateTemplate, type AdminTemplate, type UploadOutcome } from "./use-admin-templates";

export interface UpdateModalProps {
  open: boolean;
  onClose: () => void;
  template: AdminTemplate;
}

const MAX_MB = 20;

export function UpdateModal({ open, onClose, template }: UpdateModalProps) {
  const update = useUpdateTemplate(template.id);
  const [outcome, setOutcome] = useState<UploadOutcome | null>(null);

  useEffect(() => {
    if (open) {
      setOutcome(null);
      update.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onFiles = (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setOutcome(null);
    update.mutate(file, { onSuccess: (res) => setOutcome(res) });
  };

  const pending = update.isPending;
  const accepted = outcome?.ok && outcome.template;
  const rejected = outcome && !outcome.ok;
  const blocking = outcome?.report?.blocking ?? [];
  const foreignPackage = blocking.some((it) => it.code === "ID_MISMATCH");

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      size="m"
      className="tpl-update-modal"
      title={`Обновление «${template.name}»`}
      description={`Текущая версия ${template.version}. Загрузите ZIP с тем же идентификатором (${template.id}).`}
      closeOnBackdrop={!pending}
      footer={
        <div className="tpl-check-foot">
          <span className="tpl-upload-hint">ZIP · до {MAX_MB} МБ</span>
          <Button variant="ghost" size="m" onClick={onClose} disabled={pending}>
            {accepted ? "Закрыть" : "Отмена"}
          </Button>
        </div>
      }
    >
      <div className="tpl-upload-body">
        {!accepted && (
          <FileUploader
            accept=".zip,application/zip"
            maxSizeMb={MAX_MB}
            error={!!rejected}
            disabled={pending}
            onFiles={onFiles}
            title="Перетащите новую версию ZIP"
            description="или нажмите, чтобы выбрать файл"
            cta="Выбрать архив"
          />
        )}

        {pending && <Banner tone="info" title="Проверка новой версии…" />}

        {update.isError && !outcome && (
          <Banner tone="error" title="Не удалось обновить шаблон" description={update.error?.message} />
        )}

        {accepted && (
          <Banner
            tone="success"
            title={`Версия обновлена до ${outcome?.template?.version ?? ""}`}
            description="Перепроверьте работоспособность, чтобы снова активировать шаблон."
          />
        )}

        {rejected && (
          <>
            {foreignPackage ? (
              <Banner
                tone="error"
                title="Выбран архив другого шаблона"
                description={outcome?.error ?? `Загрузите ZIP шаблона ${template.id}. Шаблон не изменён.`}
              />
            ) : (
              <Banner
                tone="error"
                title="Обновление не прошло проверку — шаблон помечен невалидным"
                description={outcome?.error ?? "Устраните ошибки и загрузите архив повторно."}
              />
            )}
            {blocking.length > 0 && (
              <ul className="tpl-upload-result-list">
                {blocking.map((it, i) => (
                  <li className="tpl-upload-result-item" key={`${it.code}-${i}`}>
                    <AlertCircle size={16} style={{ color: "var(--ou-error-default)", flex: "0 0 auto" }} aria-hidden="true" />
                    <span>{it.message ?? it.detail ?? it.code}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </ModalDialog>
  );
}
