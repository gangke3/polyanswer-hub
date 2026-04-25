import { PROVIDERS, type ProviderId } from "@multi-ai/shared";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import {
  createBrowserSessionContext,
  type ActiveBrowserSession,
  type BrowserSessionContext
} from "./contextFactory.js";

export class BrowserManager {
  private static sharedBrowser?: Browser;
  private static sharedBrowserContext?: BrowserContext;
  private static sharedBrowserPromise?: Promise<BrowserContext>;
  private static sharedBrowserProcess?: ChildProcess;
  private static readonly sessions = new Map<ProviderId, ActiveBrowserSession>();
  private static readonly remoteDebuggingPort = 9222;
  private static readonly loginNavigationTimeoutMs = 15000;

  private clearSharedState(): void {
    BrowserManager.sharedBrowser = undefined;
    BrowserManager.sharedBrowserContext = undefined;
    BrowserManager.sharedBrowserPromise = undefined;
    BrowserManager.sharedBrowserProcess = undefined;
    BrowserManager.sessions.clear();
  }

  private getBrowserExecutablePath(): string {
    const candidates = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      path.join(process.env.LOCALAPPDATA ?? "", "Google\\Chrome\\Application\\chrome.exe"),
      path.join(process.env.LOCALAPPDATA ?? "", "Microsoft\\Edge\\Application\\msedge.exe")
    ].filter(Boolean);

    const browserPath = candidates.find((candidate) => fs.existsSync(candidate));
    if (!browserPath) {
      throw new Error("Unable to locate a local Chrome or Edge installation for CDP attach");
    }

    return browserPath;
  }

  private getProviderMeta(providerId: ProviderId) {
    const provider = PROVIDERS.find((item) => item.id === providerId);
    if (!provider) {
      throw new Error(`Unknown provider: ${providerId}`);
    }

    return provider;
  }

  private getProviderHost(providerId: ProviderId): string {
    return new URL(this.getProviderMeta(providerId).homepage).host;
  }

  private getSharedProfilePath(): string {
    return path.resolve(process.cwd(), "data", "sessions", "shared-browser-native");
  }

  private async waitForCdpReady(timeoutMs = 10000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    const endpoint = `http://127.0.0.1:${BrowserManager.remoteDebuggingPort}/json/version`;

    while (Date.now() < deadline) {
      try {
        const response = await fetch(endpoint);
        if (response.ok) {
          return;
        }
      } catch {
        // Ignore until timeout.
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error("Native browser remote debugging endpoint did not become ready");
  }

  private async isCdpReady(): Promise<boolean> {
    try {
      const response = await fetch(
        `http://127.0.0.1:${BrowserManager.remoteDebuggingPort}/json/version`
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  private isContextUsable(browserContext?: BrowserContext): boolean {
    if (!browserContext) {
      return false;
    }

    try {
      browserContext.pages();
      return true;
    } catch {
      return false;
    }
  }

  private async launchNativeBrowser(visible: boolean): Promise<void> {
    if (await this.isCdpReady()) {
      return;
    }

    if (BrowserManager.sharedBrowserProcess && !BrowserManager.sharedBrowserProcess.killed) {
      return;
    }

    const executablePath = this.getBrowserExecutablePath();
    const args = [
      `--remote-debugging-port=${BrowserManager.remoteDebuggingPort}`,
      `--user-data-dir=${this.getSharedProfilePath()}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-sync",
      "about:blank"
    ];

    if (!visible) {
      args.push("--headless=new");
    }

    const child = spawn(executablePath, args, {
      detached: false,
      stdio: "ignore",
      windowsHide: false
    });

    child.unref();
    BrowserManager.sharedBrowserProcess = child;
    child.once("exit", () => {
      this.clearSharedState();
    });
    await this.waitForCdpReady();
  }

  private async ensureSharedContext(visible: boolean): Promise<BrowserContext> {
    if (this.isContextUsable(BrowserManager.sharedBrowserContext)) {
      return BrowserManager.sharedBrowserContext!;
    }

    if (BrowserManager.sharedBrowserPromise) {
      return BrowserManager.sharedBrowserPromise;
    }

    this.clearSharedState();

    BrowserManager.sharedBrowserPromise = (async () => {
      await this.launchNativeBrowser(visible);
      const browser = await chromium.connectOverCDP(
        `http://127.0.0.1:${BrowserManager.remoteDebuggingPort}`
      );
      BrowserManager.sharedBrowser = browser;
      browser.on("disconnected", () => {
        this.clearSharedState();
      });

      const context = browser.contexts()[0] ?? (await browser.newContext());
      BrowserManager.sharedBrowserContext = context;
      return context;
    })().catch((error) => {
      this.clearSharedState();
      throw error;
    });

    return BrowserManager.sharedBrowserPromise;
  }

  private findReusablePage(browserContext: BrowserContext, providerId: ProviderId): Page | undefined {
    const host = this.getProviderHost(providerId);
    const claimedPages = new Set(
      [...BrowserManager.sessions.values()]
        .filter((session) => !session.page.isClosed())
        .map((session) => session.page)
    );

    return browserContext.pages().find((page) => {
      if (page.isClosed() || claimedPages.has(page)) {
        return false;
      }

      const pageUrl = page.url();
      return pageUrl.includes(host) || pageUrl === "about:blank";
    });
  }

  getProfilePath(_providerId: ProviderId): string {
    return this.getSharedProfilePath();
  }

  async createContext(providerId: ProviderId, visible = true): Promise<BrowserSessionContext> {
    return createBrowserSessionContext(providerId, this.getProfilePath(providerId), visible);
  }

  async getSession(providerId: ProviderId, visible = true): Promise<ActiveBrowserSession> {
    const existing = BrowserManager.sessions.get(providerId);
    if (existing && !existing.page.isClosed()) {
      return existing;
    }

    const browserContext = await this.ensureSharedContext(visible);
    const page = this.findReusablePage(browserContext, providerId) ?? (await browserContext.newPage());
    return this.createSession(providerId, browserContext, page, visible);
  }

  async getNewSession(providerId: ProviderId, visible = true): Promise<ActiveBrowserSession> {
    const browserContext = await this.ensureSharedContext(visible);
    const page = await this.createNewWindowPage(browserContext);
    return this.createSession(providerId, browserContext, page, visible);
  }

  private async createNewWindowPage(browserContext: BrowserContext): Promise<Page> {
    const existingPages = new Set(browserContext.pages());

    try {
      const browserSession = await BrowserManager.sharedBrowser?.newBrowserCDPSession();
      if (!browserSession) {
        return browserContext.newPage();
      }

      await browserSession.send("Target.createTarget", {
        url: "about:blank",
        newWindow: true
      });
      await browserSession.detach().catch(() => undefined);

      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const page = browserContext
          .pages()
          .find((item) => !existingPages.has(item) && !item.isClosed());
        if (page) {
          return page;
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch {
      // Some Chromium builds ignore Target.createTarget(newWindow).
    }

    return browserContext.newPage();
  }

  private createSession(
    providerId: ProviderId,
    browserContext: BrowserContext,
    page: Page,
    visible: boolean
  ): ActiveBrowserSession {
    const session: ActiveBrowserSession = {
      providerId,
      profilePath: this.getProfilePath(providerId),
      visible,
      browserContext,
      page
    };

    BrowserManager.sessions.set(providerId, session);
    return session;
  }

  private async navigateToLoginPage(page: Page, url: string): Promise<void> {
    try {
      await page.goto(url, {
        waitUntil: "commit",
        timeout: BrowserManager.loginNavigationTimeoutMs
      });
    } catch {
      // Some providers keep loading or redirect through verification pages for a long time.
      // As long as the tab is created, we let the user continue manually in the browser.
    }
  }

  async resetAndOpenLoginTabs(providerIds: ProviderId[]): Promise<ActiveBrowserSession[]> {
    let browserContext = await this.ensureSharedContext(true);

    try {
      for (const session of BrowserManager.sessions.values()) {
        if (!session.page.isClosed()) {
          await session.page.close().catch(() => undefined);
        }
      }
      BrowserManager.sessions.clear();

      const existingPages = browserContext.pages().filter((page) => !page.isClosed());
      for (const page of existingPages.slice(1)) {
        await page.close().catch(() => undefined);
      }

      const primaryPage = existingPages[0] ?? (await browserContext.newPage());
      const sessions: ActiveBrowserSession[] = [];
      const navigations: Promise<void>[] = [];

      for (let index = 0; index < providerIds.length; index += 1) {
        const providerId = providerIds[index];
        const provider = this.getProviderMeta(providerId);
        const page = index === 0 ? primaryPage : await browserContext.newPage();
        const session = this.createSession(providerId, browserContext, page, true);
        sessions.push(session);
        navigations.push(this.navigateToLoginPage(page, provider.loginUrl));
      }

      await Promise.all(navigations);

      await primaryPage.bringToFront();
      return sessions;
    } catch (error) {
      await this.closeAll();
      browserContext = await this.ensureSharedContext(true);

      const primaryPage = await browserContext.newPage();
      const sessions: ActiveBrowserSession[] = [];
      const navigations: Promise<void>[] = [];

      for (let index = 0; index < providerIds.length; index += 1) {
        const providerId = providerIds[index];
        const provider = this.getProviderMeta(providerId);
        const page = index === 0 ? primaryPage : await browserContext.newPage();
        const session = this.createSession(providerId, browserContext, page, true);
        sessions.push(session);
        navigations.push(this.navigateToLoginPage(page, provider.loginUrl));
      }

      await Promise.all(navigations);

      await primaryPage.bringToFront();
      return sessions;
    }
  }

  async openLoginTabs(providerIds: ProviderId[]): Promise<ActiveBrowserSession[]> {
    const sessions: ActiveBrowserSession[] = [];
    const navigations: Promise<void>[] = [];

    for (const providerId of providerIds) {
      const provider = this.getProviderMeta(providerId);
      const session = await this.getSession(providerId, true);
      sessions.push(session);
      navigations.push(this.navigateToLoginPage(session.page, provider.loginUrl));
    }

    await Promise.all(navigations);

    const firstPage = sessions[0]?.page;
    if (firstPage) {
      await firstPage.bringToFront();
    }

    return sessions;
  }

  async closeSession(providerId: ProviderId): Promise<void> {
    const session = BrowserManager.sessions.get(providerId);
    if (!session) {
      return;
    }

    BrowserManager.sessions.delete(providerId);

    if (!session.page.isClosed()) {
      await session.page.close().catch(() => undefined);
    }
  }

  async closeAll(): Promise<void> {
    await Promise.all(
      [...BrowserManager.sessions.keys()].map((providerId) => this.closeSession(providerId))
    );

    if (BrowserManager.sharedBrowser) {
      await BrowserManager.sharedBrowser.close().catch(() => undefined);
      BrowserManager.sharedBrowser = undefined;
    }

    if (BrowserManager.sharedBrowserProcess && !BrowserManager.sharedBrowserProcess.killed) {
      BrowserManager.sharedBrowserProcess.kill();
      BrowserManager.sharedBrowserProcess = undefined;
    }

    BrowserManager.sharedBrowserContext = undefined;
    BrowserManager.sharedBrowserPromise = undefined;
  }
}
