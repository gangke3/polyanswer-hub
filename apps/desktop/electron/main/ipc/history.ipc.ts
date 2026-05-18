import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SavedTaskHistoryItem } from "@multi-ai/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveProjectRoot(): string {
  const candidates = [
    path.resolve(process.cwd(), "..", ".."),
    path.resolve(__dirname, "../../../../../../"),
    path.resolve(process.cwd())
  ];

  for (const candidate of candidates) {
    if (candidate && path.basename(candidate).toLowerCase() === "ai") {
      return candidate;
    }
  }

  return candidates[0];
}

const projectRoot = resolveProjectRoot();
const historyFilePath = path.join(projectRoot, "data", "history.json");
const historyDebugLogPath = path.join(projectRoot, "data", "history-debug.log");
const legacyHistoryFilePaths = [
  path.resolve(process.cwd(), "data", "history.json"),
  path.resolve(process.cwd(), "..", "..", "data", "history.json"),
  path.resolve(projectRoot, "apps", "desktop", "data", "history.json")
].filter((candidate, index, items) => candidate !== historyFilePath && items.indexOf(candidate) === index);

export function getHistoryFilePath(): string {
  return historyFilePath;
}

export async function appendHistoryDebugLog(message: string): Promise<void> {
  const timestamp = new Date().toISOString();
  await fs.mkdir(path.dirname(historyDebugLogPath), { recursive: true });
  await fs.appendFile(historyDebugLogPath, `[${timestamp}] ${message}\n`, "utf8");
}

async function migrateLegacyHistoryFile(): Promise<void> {
  try {
    await fs.access(historyFilePath);
    return;
  } catch {
    // Continue and look for a legacy file.
  }

  for (const legacyPath of legacyHistoryFilePaths) {
    try {
      const legacyContent = await fs.readFile(legacyPath, "utf8");
      await fs.mkdir(path.dirname(historyFilePath), { recursive: true });
      await fs.writeFile(historyFilePath, legacyContent, "utf8");
      await appendHistoryDebugLog(`migrated legacy history from ${legacyPath}`);
      return;
    } catch {
      // Try the next legacy location.
    }
  }
}

async function readHistoryFile(): Promise<SavedTaskHistoryItem[]> {
  try {
    await migrateLegacyHistoryFile();
    const content = await fs.readFile(historyFilePath, "utf8");
    const parsed = JSON.parse(content) as unknown;
    return Array.isArray(parsed) ? (parsed as SavedTaskHistoryItem[]) : [];
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function writeHistoryFile(items: SavedTaskHistoryItem[]): Promise<void> {
  await fs.mkdir(path.dirname(historyFilePath), { recursive: true });
  await fs.writeFile(historyFilePath, JSON.stringify(items, null, 2), "utf8");
}

export async function listHistory(): Promise<SavedTaskHistoryItem[]> {
  const items = await readHistoryFile();
  return items.sort((left, right) => right.savedAt.localeCompare(left.savedAt));
}

export async function getHistoryItemById(id: string): Promise<SavedTaskHistoryItem | null> {
  const items = await readHistoryFile();
  return items.find((item) => item.id === id) ?? null;
}

export async function saveHistoryItem(
  item: Omit<SavedTaskHistoryItem, "id" | "savedAt">
): Promise<SavedTaskHistoryItem> {
  const items = await readHistoryFile();
  const savedItem: SavedTaskHistoryItem = {
    ...item,
    id: item.task.id,
    savedAt: new Date().toISOString()
  };
  const nextItems = [savedItem, ...items.filter((current) => current.id !== savedItem.id)];
  await writeHistoryFile(nextItems);
  await appendHistoryDebugLog(
    `saved task=${savedItem.task.id} answers=${savedItem.answers.length} path=${historyFilePath}`
  );
  return savedItem;
}

export async function deleteHistoryItem(id: string): Promise<SavedTaskHistoryItem[]> {
  const items = await readHistoryFile();
  const nextItems = items.filter((item) => item.id !== id);
  await writeHistoryFile(nextItems);
  return nextItems;
}

export async function clearHistory(): Promise<SavedTaskHistoryItem[]> {
  await writeHistoryFile([]);
  return [];
}
