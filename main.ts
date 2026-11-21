// Entry program for news-image-20261121.
// Copies the pre-rendered front page (entry.png, built at authoring time
// by render.py) into the output directory the grader provides.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const targetDir = process.env.MAKEFUN_OUTPUT_DIR ?? "out";
mkdirSync(targetDir, { recursive: true });

const repoRoot = dirname(fileURLToPath(import.meta.url));
copyFileSync(join(repoRoot, "entry.png"), join(targetDir, "entry.png"));
