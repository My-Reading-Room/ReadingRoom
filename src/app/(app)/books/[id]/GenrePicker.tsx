"use client";

import { useState } from "react";

import { useGenreSelection } from "@/hooks/useGenreSelection";
import { STANDARD_GENRES } from "@/lib/book-detail-metadata";

/** Submits the chosen genres as a comma-separated hidden field named `name`. */
export function GenrePicker({ name, initial }: { name: string; initial: string[] }) {
  const { genres, error, add, remove, makePrimary } = useGenreSelection(initial);
  const [choice, setChoice] = useState("");
  return (
    <div className="genre-picker">
      <input type="hidden" name={name} value={genres.join(", ")} />
      <div className="genre-selected" role="group" aria-label="Assigned genres">
        {genres.length === 0 && <span className="tiny">No genres selected. Add one below.</span>}
        {genres.map((genre, index) => {
          const legacy = !STANDARD_GENRES.includes(genre);
          return (
            <span
              key={genre}
              className={`genre-chip ${index === 0 ? "is-primary" : ""} ${legacy ? "is-legacy" : ""}`}
            >
              <strong>{genre}</strong>
              {index === 0 ? (
                <span className="genre-primary-label">Primary</span>
              ) : (
                <button
                  type="button"
                  className="genre-primary-btn"
                  onClick={() => makePrimary(genre)}
                >
                  Make primary
                </button>
              )}
              {legacy && (
                <span
                  className="genre-legacy-label"
                  title="Imported or older custom label; cannot be added again"
                >
                  Existing label
                </span>
              )}
              <button
                type="button"
                className="genre-remove"
                aria-label={`Remove genre ${genre}`}
                onClick={() => remove(genre)}
              >
                ×
              </button>
            </span>
          );
        })}
      </div>
      <div className="inline genre-quick-add">
        <select
          className="select genre-choice"
          aria-label="Choose a standardized genre"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
        >
          <option value="">Select a genre…</option>
          {STANDARD_GENRES.map((g) => (
            <option key={g} value={g} disabled={genres.includes(g)}>
              {g}
            </option>
          ))}
        </select>
        <button
          className="btn sm"
          type="button"
          onClick={() => {
            add(choice);
            setChoice("");
          }}
        >
          + Add genre
        </button>
      </div>
      {error && (
        <p className="tiny error-text" role="alert">
          {error}
        </p>
      )}
      <p className="tiny genre-explainer">
        Choose from {STANDARD_GENRES.length} standard genres. The first listed is primary for
        Insights.
      </p>
    </div>
  );
}
