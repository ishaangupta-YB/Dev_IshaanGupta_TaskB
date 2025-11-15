"use client";

import { useState, type FormEvent } from "react";
import type { PageResponse } from "@/types";

const EXAMPLE_TARGETS = [
  "https://www.spiralyze.com/",
  "https://www.apple.com",
  "https://vercel.com",
];

const CLIENT_TIMEOUT_MS = 20_000;

const isValidHttpUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
};

export default function Home() {
  const [url, setUrl] = useState(EXAMPLE_TARGETS[0]);
  const [result, setResult] = useState<PageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [completedAt, setCompletedAt] = useState<string>("");

  const handlePrefill = (candidate: string) => {
    setUrl(candidate);
    setError(null);
    setResult(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = url.trim();

    if (!isValidHttpUrl(trimmed)) {
      setError("Please enter a valid http(s) URL.");
      setResult(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

    try {
      const response = await fetch(
        `/api/scrape?url=${encodeURIComponent(trimmed)}`,
        {
          method: "GET",
          signal: controller.signal,
        },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error ?? "Unable to complete scrape");
      }

      setResult(data as PageResponse);
      setCompletedAt(new Date().toLocaleTimeString());
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Client timeout reached. Please try again.");
      } else {
        setError(
          err instanceof Error ? err.message : "Unexpected error occurred.",
        );
      }
    } finally {
      clearTimeout(timeout);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-slate-100 px-4 py-16 text-slate-900">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-10">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] ">
            Task B (Micro Scraper)
          </p> 
        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm"
        >
          <label className="text-sm font-medium text-slate-700">
            Page URL
            <input
              type="url"
              name="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            {EXAMPLE_TARGETS.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => handlePrefill(example)}
                className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm text-slate-600 transition hover:border-emerald-300 hover:text-emerald-600"
              >
                {new URL(example).hostname}
              </button>
            ))}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
                Scraping…
              </>
            ) : (
              "Scrape"
            )}
          </button>
        </form>

        <section className="space-y-4" aria-live="polite">
          {error && (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}

          {result && (
            <div className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Status
                </p>
                <p className="text-2xl font-semibold text-emerald-600">
                  {result.status}
                </p>
              </div>
            

              <div className="space-y-1 md:col-span-2">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Title
                </p>
                <p className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-base text-slate-900">
                  {result.title || "—"}
                </p>
              </div>

              <div className="space-y-1 md:col-span-2">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Meta Description
                </p>
                <p className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-base text-slate-900">
                  {result.metaDescription || "No meta description detected"}
                </p>
              </div>

              <div className="space-y-1 md:col-span-2">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Primary H1
                </p>
                <p className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-base text-slate-900">
                  {result.h1 || "No h1 found"}
                </p>
              </div>
            </div>
          )}

          {!result && !error && !isLoading && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-6 text-sm text-slate-500">
              No scrape yet. Enter a URL above to get started.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
