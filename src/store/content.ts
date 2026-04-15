import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { retrieveByScopes } from './retrieval.js';
import { logger } from '../config/logger.js';

const CONTENT_DIR = join(process.cwd(), 'content');
const LONG_CONTENT_WARN_CHARS = 2000;

export interface ContentLoadResult {
  content: string;
  source: 'file' | 'statement';
  agentId: string;
  campaignId: string | null;
}

export async function loadAgentPrompt(
  agentId: string,
  campaignId: string | null,
): Promise<ContentLoadResult> {
  const filePath = join(CONTENT_DIR, 'agents', `${agentId}.md`);

  let fileContent: string | null = null;
  try {
    fileContent = readFileSync(filePath, 'utf-8');
  } catch {
    // File doesn't exist, will look for statement override
  }

  if (fileContent) {
    if (fileContent.length > LONG_CONTENT_WARN_CHARS) {
      logger.warn(
        { agentId, campaignId, charCount: fileContent.length },
        'content: agent prompt exceeds 2000 chars, consider vector search for semantic retrieval',
      );
    }

    if (campaignId) {
      const overrides = await retrieveByScopes(
        [{ type: 'governance', roomId: campaignId }],
        { kind: 'agent-prompt', limit: 1 },
      );
      const override = overrides.find(
        (s) => s.fields?.agentId === agentId,
      );
      if (override) {
        return {
          content: override.content,
          source: 'statement',
          agentId,
          campaignId,
        };
      }
    }

    return {
      content: fileContent,
      source: 'file',
      agentId,
      campaignId,
    };
  }

  const errorMsg = campaignId
    ? `content: no prompt found for agent ${agentId} in campaign ${campaignId}`
    : `content: no prompt found for agent ${agentId}`;

  logger.error({ agentId, campaignId }, errorMsg);
  throw new Error(errorMsg);
}

export function listAgentPrompts(): string[] {
  try {
    const agentsDir = join(CONTENT_DIR, 'agents');
    const files = readdirSync(agentsDir);
    return files
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace('.md', ''));
  } catch {
    return [];
  }
}