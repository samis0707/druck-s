"use client";

import { useId, useState } from "react";
import type { QuizFrage } from "@/lib/hilfe/inhalte";

/** Eine Quizfrage mit sofortiger Rückmeldung und Erklärung. */
export function Quiz({ quiz }: { quiz: QuizFrage }) {
  const [gewaehlt, setGewaehlt] = useState<number | null>(null);
  const name = useId();
  const richtig = gewaehlt !== null && quiz.antworten[gewaehlt]?.richtig === true;

  return (
    <section aria-labelledby={`${name}-titel`} className="rounded-3xl border border-border bg-card p-5 md:p-6">
      <p className="font-mono text-xs tracking-[0.12em] text-(--color-ink-mid) uppercase">Kurz geprüft</p>
      <h2 id={`${name}-titel`} className="mt-1 text-lg font-semibold">
        {quiz.frage}
      </h2>
      <fieldset className="mt-4 space-y-2">
        <legend className="sr-only">{quiz.frage}</legend>
        {quiz.antworten.map((a, i) => {
          const ist = gewaehlt === i;
          const ton =
            gewaehlt === null
              ? "border-border hover:border-ring"
              : a.richtig
                ? "border-(--color-brand-500) bg-(--color-brand-50) dark:bg-transparent"
                : ist
                  ? "border-destructive bg-destructive/5"
                  : "border-border opacity-70";
          return (
            <label key={i} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition-colors ${ton}`}>
              <input
                type="radio"
                name={name}
                className="mt-1 size-4 accent-(--color-brand-600)"
                checked={ist}
                onChange={() => setGewaehlt(i)}
              />
              <span>{a.text}</span>
            </label>
          );
        })}
      </fieldset>
      {gewaehlt !== null && (
        <p role="status" className="mt-4 text-[0.95rem]">
          <strong className={richtig ? "text-(--color-brand-700) dark:text-(--color-brand-300)" : "text-destructive"}>
            {richtig ? "Richtig. " : "Nicht ganz. "}
          </strong>
          {quiz.erklaerung}
        </p>
      )}
    </section>
  );
}
