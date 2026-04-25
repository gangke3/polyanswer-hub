import fs from "node:fs/promises";
import path from "node:path";

const targets = [
  path.resolve(process.cwd(), "dist/renderer/index.html"),
  path.resolve(process.cwd(), "../dist/renderer/index.html")
];

for (const target of targets) {
  try {
    const content = await fs.readFile(target, "utf8");
    const next = content
      .replaceAll('src="/assets/', 'src="./assets/')
      .replaceAll('href="/assets/', 'href="./assets/');

    if (next !== content) {
      await fs.writeFile(target, next, "utf8");
      console.log(`Rewrote asset paths in ${target}`);
    }
  } catch {
    // Ignore missing files.
  }
}
