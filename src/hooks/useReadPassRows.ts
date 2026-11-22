"use client";

import { useCallback, useState } from "react";

import type { ReadPass } from "@/lib/types";

export type PassRow = {
  key: number;
  status: string;
  started_on: string;
  finished_on: string;
  finished_year: string;
};

const fromPass = (p: ReadPass, key: number): PassRow => ({
  key,
  status: p.status,
  started_on: p.started_on ?? "",
  finished_on: p.finished_on ?? "",
  // A year is only shown when the exact finish date is unknown.
  finished_year: p.finished_on ? "" : p.finished_year ? String(p.finished_year) : "",
});

/** Editable read-through rows: change a field, add a reread, or remove the last one. */
export function useReadPassRows(passes: ReadPass[], today: string) {
  const [rows, setRows] = useState<PassRow[]>(() =>
    passes.length
      ? passes.map(fromPass)
      : [{ key: 0, status: "reading", started_on: "", finished_on: "", finished_year: "" }],
  );
  const update = useCallback(
    (key: number, field: keyof Omit<PassRow, "key">, value: string) =>
      setRows((r) => r.map((row) => (row.key === key ? { ...row, [field]: value } : row))),
    [],
  );
  const addReread = useCallback(
    () =>
      setRows((r) => [
        ...r,
        {
          key: Math.max(...r.map((x) => x.key)) + 1,
          status: "reading",
          started_on: today,
          finished_on: "",
          finished_year: "",
        },
      ]),
    [today],
  );
  const removeLast = useCallback(() => setRows((r) => (r.length > 1 ? r.slice(0, -1) : r)), []);
  const entries = rows.map(({ status, started_on, finished_on, finished_year }) => ({
    status,
    started_on,
    finished_on,
    finished_year,
  }));
  return { rows, entries, update, addReread, removeLast };
}
