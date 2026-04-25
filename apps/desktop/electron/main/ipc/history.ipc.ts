import fs from "node:fs/promises";
import path from "node:path";
import type { SavedTaskHistoryItem } from "@multi-ai/shared";

const historyFilePath = path.resolve(process.cwd(), "data", "history.json");

async function readHistoryFile(): Promise<SavedTaskHistoryItem[]> {
  try {
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
