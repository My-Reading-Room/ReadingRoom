"use client";

import { useCallback, useState } from "react";

import type { ChapterDraft } from "@/lib/chapter-sourcing";

export type DraftRow = { key: number; chapter_label: string; start_page: string; end_page: string };
export type DraftMeta = Omit<ChapterDraft, "rows">;

/**
 * A candidate chapter map under review. Rows stay editable strings until the
 * reader confirms; the server validates them again when the map is saved.
 */
export function useChapterDraft() {
  const [meta, setMeta] = useState<DraftMeta | null>(null);
  const [rows, setRows] = useState<DraftRow[]>([]);

  const install = useCallback((draft: ChapterDraft) => {
    setMeta({ ...draft, rows: undefined } as DraftMeta);
    setRows(
      draft.rows.map((r, i) => ({
        key: i,
        chapter_label: r.chapter_label || `Chapter ${i + 1}`,
        start_page: String(r.start_page ?? ""),
        end_page: String(r.end_page ?? ""),
      })),
    );
  }, []);
  const update = useCallback(
    (key: number, field: keyof Omit<DraftRow, "key">, value: string) =>
      setRows((r) => r.map((row) => (row.key === key ? { ...row, [field]: value } : row))),
    [],
  );
  const addRow = useCallback(
    () =>
      setRows((r) => [
        ...r,
        {
          key: Math.max(-1, ...r.map((x) => x.key)) + 1,
          chapter_label: `Chapter ${r.length + 1}`,
          start_page: "",
          end_page: "",
        },
      ]),
    [],
  );
  const removeRow = useCallback(
    (key: number) => setRows((r) => r.filter((row) => row.key !== key)),
    [],
  );
  const discard = useCallback(() => {
    setMeta(null);
    setRows([]);
  }, []);

  const payload = rows.map((r) => ({
    chapter_label: r.chapter_label,
    start_page: r.start_page,
    end_page: r.end_page,
  }));
  return { meta, rows, payload, install, update, addRow, removeRow, discard };
}
