import { NextRequest, NextResponse } from "next/server";
import { chromium, type Page, type Response as PlaywrightResponse } from "playwright";
import type { PageResponse } from "@/types";

export const runtime = "nodejs";

const REQUEST_TIMEOUT_MS = 20_000;
const NAVIGATION_TIMEOUT_MS = 15_000;
const NETWORK_IDLE_TIMEOUT_MS = 5_000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

class RequestTimeoutError extends Error {
  constructor() {
    super("Timeout");
    this.name = "RequestTimeoutError";
  }
}

const invalidUrlResponse = () =>
  NextResponse.json({ error: "Invalid URL" }, { status: 400 });
const timeoutResponse = () =>
  NextResponse.json({ error: "Timeout" }, { status: 504 });

const sanitize = (value?: string | null) =>
  (value ?? "").replace(/\s+/g, " ").trim();

const isValidHttpUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
};

const withTimeout = async <T>(
  promise: Promise<T>,
  timeout: number,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new RequestTimeoutError());
    }, timeout);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });

const navigateWithRetry = async (
  page: Page,
  url: string,
  attempts = 2,
): Promise<PlaywrightResponse | null> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: NAVIGATION_TIMEOUT_MS,
      });
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        console.log(`[Scraper] Navigation attempt ${attempt} failed, retrying...`);
      }
      if (attempt === attempts) {
        throw error;
      }
    }
  }

  throw (lastError instanceof Error
    ? lastError
    : new Error("Navigation failed"));
};

const extractPageMetadata = async (url: string): Promise<PageResponse> => {
  let instance = null;
  
  try {
    instance = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', 
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process', //  for serverless
      ],
    });
    
    const context = await instance.newContext({ 
      userAgent: USER_AGENT,
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();

    const response = await navigateWithRetry(page, url);

    await page
      .waitForLoadState("networkidle", { timeout: NETWORK_IDLE_TIMEOUT_MS })
      .catch(() => {
        console.log("[Scraper] Network idle timeout, proceeding with available content");
      });

    const data = await page.evaluate(() => {
      const primaryTitle = document.title ?? "";
      const meta =
        document
          .querySelector('meta[name="description"]')
          ?.getAttribute("content") ??
        document
          .querySelector('meta[property="og:description"]')
          ?.getAttribute("content") ??
        "";
      const heading = document.querySelector("h1")?.textContent ?? "";

      return {
        title: primaryTitle,
        metaDescription: meta,
        h1: heading,
      };
    });

    return {
      title: sanitize(data.title),
      metaDescription: sanitize(data.metaDescription),
      h1: sanitize(data.h1),
      status: response?.status() ?? 200,
    };
  } finally {
    if (instance) {
      await instance.close().catch((err) => {
        console.error("[Scraper] Failed to close browser:", err);
      });
    }
  }
};

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const targetUrl = request.nextUrl.searchParams.get("url");

  if (!targetUrl || !isValidHttpUrl(targetUrl)) {
    return invalidUrlResponse();
  }

  try {
    const payload = await withTimeout(
      extractPageMetadata(targetUrl),
      REQUEST_TIMEOUT_MS,
    );

    const duration = Date.now() - startTime;
    console.log(`[Scraper] Successfully scraped ${targetUrl} in ${duration}ms`);

    return NextResponse.json(payload, { 
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    
    if (error instanceof RequestTimeoutError) {
      return timeoutResponse();
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Scraper] Failed after ${duration}ms for ${targetUrl}:`, errorMessage);

    return NextResponse.json(
      { error: "Unable to complete scrape" },
      { status: 500 },
    );
  }
}

