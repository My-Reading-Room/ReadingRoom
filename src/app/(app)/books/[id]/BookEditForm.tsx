"use client";

import { useActionForm } from "@/hooks/useActionForm";
import { useLocalToday } from "@/hooks/useLocalToday";
import { STATUS_TEXT } from "@/lib/book-display";
import { seriesMetadata } from "@/lib/series-insights";
import type { UserBook } from "@/lib/types";

import { saveBook, type BookActionState } from "./actions";
import { GenrePicker } from "./GenrePicker";

const RATINGS = Array.from({ length: 20 }, (_, i) => (i + 1) / 4);

type FieldProps = {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  wide?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "defaultValue">;

function Field({ label, name, defaultValue, type = "text", wide, ...rest }: FieldProps) {
  return (
    <div className={wide ? "formfield span2" : "formfield"}>
      <label htmlFor={`edit-${name}`}>{label}</label>
      <input
        className="input"
        id={`edit-${name}`}
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        {...rest}
      />
    </div>
  );
}

export function BookEditForm({ book }: { book: UserBook }) {
  const { state, pending, onSubmit } = useActionForm<BookActionState>(
    saveBook.bind(null, book.id),
    {},
  );
  const today = useLocalToday();
  const series = seriesMetadata(book);

  return (
    <form onSubmit={onSubmit} className="book-edit-form">
      <input type="hidden" name="today" value={today} />
      <section className="book-status-edit" aria-label="Edit reading status">
        <div className="book-status-main">
          <label htmlFor="edit-status">Reading status</label>
          <select className="select" id="edit-status" name="status" defaultValue={book.status}>
            {Object.entries(STATUS_TEXT).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <span className="tiny">
            Select a status, then use <strong>Save book</strong> below to apply it.
          </span>
        </div>
      </section>

      <div className="formgrid">
        <div className="formfield">
          <label htmlFor="edit-rating">Personal rating (¼-star increments)</label>
          <select
            className="select"
            id="edit-rating"
            name="rating"
            defaultValue={book.rating ?? ""}
          >
            <option value="">Unrated</option>
            {RATINGS.map((r) => (
              <option key={r} value={r}>
                {r.toFixed(2)} ★
              </option>
            ))}
          </select>
        </div>
        <Field
          label="Started reading"
          name="started_on"
          type="date"
          defaultValue={book.started_on}
        />
        <Field
          label="Finished reading"
          name="finished_on"
          type="date"
          defaultValue={book.finished_on}
        />
        <Field
          label="Page count (exact edition)"
          name="page_count"
          type="number"
          min={1}
          defaultValue={book.page_count}
        />
        <Field
          label="Current page"
          name="current_page"
          type="number"
          min={0}
          defaultValue={book.current_page ?? 0}
        />
        <Field
          label="ISBN-10 / ISBN-13"
          name="isbn"
          defaultValue={book.isbn}
          placeholder="978..."
        />
        <Field
          label="Amazon ASIN"
          name="asin"
          maxLength={10}
          defaultValue={book.asin}
          placeholder="B0..."
        />
        <Field
          label="Cover image URL (HTTPS)"
          name="cover_url"
          type="url"
          wide
          defaultValue={book.cover_url}
          placeholder="https://example.com/cover.jpg"
        />
        <Field label="Publisher" name="publisher" defaultValue={book.publisher} maxLength={200} />
        <Field
          label="Binding"
          name="binding"
          defaultValue={book.binding}
          placeholder="Paperback / Hardcover / Ebook"
          maxLength={80}
        />
        <Field
          label="Edition publication year"
          name="edition_year"
          type="number"
          min={1500}
          max={2099}
          defaultValue={book.edition_year}
        />
        <Field
          label="Original publication year"
          name="original_published_year"
          type="number"
          min={1500}
          max={2099}
          defaultValue={book.original_published_year}
        />
        <Field
          label="Physical height (mm, optional)"
          name="height_mm"
          type="number"
          min={1}
          step={0.1}
          defaultValue={book.height_mm}
        />
        <Field
          label="Physical thickness (mm, optional)"
          name="thickness_mm"
          type="number"
          min={1}
          step={0.1}
          defaultValue={book.thickness_mm}
        />
        <div className="formfield span2">
          <label>Assigned genres (first = primary)</label>
          <GenrePicker name="genres" initial={book.genres ?? []} />
        </div>
        <Field
          label="TBR added date (optional)"
          name="tbr_added_on"
          type="date"
          defaultValue={book.tbr_added_on}
        />
        <Field
          label="Series name (editable)"
          name="series_name"
          defaultValue={book.series_name || series.series_name}
          placeholder="e.g., Dune"
          maxLength={200}
        />
        <Field
          label="Installment number"
          name="series_number"
          type="number"
          step={0.5}
          min={0}
          defaultValue={book.series_number ?? series.series_number}
        />
        <div className="formfield span2">
          <label htmlFor="edit-series_total">Main installments published / known (editable)</label>
          <input
            className="input"
            id="edit-series_total"
            name="series_total"
            type="number"
            min={1}
            max={500}
            step={1}
            defaultValue={book.series_total ?? ""}
            placeholder="Set if you know the total"
          />
          <p className="tiny">
            Goodreads identifies series and order, but not the final series length. Completion means
            all currently known installments were finished.
          </p>
        </div>
        <div className="formfield span2">
          <label htmlFor="edit-notes">Your notes</label>
          <textarea
            className="textarea"
            id="edit-notes"
            name="notes"
            defaultValue={book.notes ?? ""}
            maxLength={20000}
          />
        </div>
      </div>

      {state.error && (
        <div className="notice error" role="alert">
          {state.error}
        </div>
      )}
      {state.message && (
        <div className="notice" role="status">
          {state.message}
        </div>
      )}
      <div className="toolbar form-footer">
        <button className="btn primary" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save book"}
        </button>
      </div>
    </form>
  );
}
