// Versioned prompts of the research AI steps. Like the analysis prompts, the text lives in
// deployable .md assets (copied by scripts/copy-assets.ts); changing one requires bumping its
// version so stored outputs can be traced to the prompt that produced them.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type ResearchPromptKind = 'extract' | 'match' | 'build';

export interface ResearchPrompt {
  version: string;
  text: string;
}

export const RESEARCH_PROMPT_VERSIONS: Readonly<Record<ResearchPromptKind, string>> = {
  extract: 'research-extract-v1.0.0',
  match: 'research-match-v1.0.0',
  build: 'research-build-v1.0.0',
};

const ASSET_FILES: Readonly<Record<ResearchPromptKind, string>> = {
  extract: 'research-extract.md',
  match: 'research-match.md',
  build: 'research-build.md',
};

const cache = new Map<ResearchPromptKind, ResearchPrompt>();

/** Prompt assets are required deployable resources; a missing one must fail loudly. */
export function researchPrompt(kind: ResearchPromptKind): ResearchPrompt {
  const cached = cache.get(kind);
  if (cached) return cached;
  const fileName = ASSET_FILES[kind];
  const candidates = [
    join(dirname(new URL(import.meta.url).pathname), 'prompts', fileName),
    join(process.cwd(), 'src/modules/research/prompts', fileName),
  ];
  const assetPath = candidates.find((candidate) => existsSync(candidate));
  if (!assetPath) throw new Error(`Required AI prompt asset is missing: ${fileName}`);
  let text: string;
  try {
    text = readFileSync(assetPath, 'utf8').trim();
  } catch (error) {
    throw new Error(`Unable to load required AI prompt asset: ${fileName}`, { cause: error });
  }
  if (!text) throw new Error(`Required AI prompt asset is empty: ${fileName}`);
  const prompt = { version: RESEARCH_PROMPT_VERSIONS[kind], text };
  cache.set(kind, prompt);
  return prompt;
}
