import { t } from '../i18n/index.ts';
import { classifyAiFailure, type AiFailureKind } from './ai.ts';

const STATE_COPY: Record<AiFailureKind, string> = {
  off: 'Hosted AI is off for this site. Local commands still work.',
  unconfigured: 'AI is not configured on the server yet. Local commands still work.',
  unavailable: 'AI is temporarily unavailable — the rate limit or daily cap was reached. Try again later.',
  invalid: 'The AI returned an unusable result. Nothing was changed.',
  selection: 'Select a room, wall, or object first',
  cancelled: 'AI request cancelled.',
  error: 'The AI request failed. Your design is unchanged.',
};

/** Clear, translated status text for a failed hosted request. */
export function aiStateMessage(error: unknown): string {
  const kind = classifyAiFailure(error);
  // Unknown failures keep their specific message; known ones get calm, clear copy.
  return kind === 'error' ? (error instanceof Error ? error.message : String(error)) : t(STATE_COPY[kind]);
}

export const aiThinkingLabel = () => t('Thinking…');
export const aiCancelLabel = () => t('Cancel');
export const aiNoticeText = () => t('When local rules cannot handle a command, your text and the selected room are sent to an AI service.');
