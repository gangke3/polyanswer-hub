import fs from "node:fs/promises";
import path from "node:path";
import type { Locator, Page } from "playwright";

export async function waitForNetworkSettled(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  try {
    await page.waitForLoadState("networkidle", { timeout: 5000 });
  } catch {
    return;
  }
}

export async function firstVisibleLocator(
  page: Page,
  selectors: string[],
  timeoutMs = 3000
): Promise<Locator | undefined> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: "visible", timeout: timeoutMs });
      return locator;
    } catch {
      continue;
    }
  }

  return undefined;
}

export async function firstAttachedLocator(
  page: Page,
  selectors: string[],
  timeoutMs = 3000
): Promise<Locator | undefined> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: "attached", timeout: timeoutMs });
      return locator;
    } catch {
      continue;
    }
  }

  return undefined;
}

export async function captureSnapshot(
  page: Page,
  outputDir: string,
  prefix: string
): Promise<{ rawHtmlPath?: string; screenshotPath?: string }> {
  await fs.mkdir(outputDir, { recursive: true });
  const rawHtmlPath = path.join(outputDir, `${prefix}.html`);
  const screenshotPath = path.join(outputDir, `${prefix}.png`);

  try {
    await fs.writeFile(rawHtmlPath, await page.content(), "utf8");
  } catch {
    // Keep snapshotting best-effort so answer extraction does not fail on archive errors.
  }

  try {
    await page.screenshot({ path: screenshotPath, fullPage: true, timeout: 5000 });
  } catch {
    return { rawHtmlPath };
  }

  return { rawHtmlPath, screenshotPath };
}
