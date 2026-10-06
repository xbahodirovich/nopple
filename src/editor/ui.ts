import { trackError } from '../alpha/telemetry.ts';
export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}
export function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'The change could not be applied.'; }
export function reportEditorError(error: unknown): void {
  trackError(error);
  window.dispatchEvent(new CustomEvent('mopple-error', { detail: errorMessage(error) }));
}
export function labelControls(container: HTMLElement): void {
  container.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select').forEach(input => {
    if (input.hasAttribute('aria-label')) return;
    const field = input.closest('.prop-field, .prop-group, .panel-search');
    const label = field?.querySelector('.field-lbl, .prop-label')?.textContent?.trim() || input.getAttribute('placeholder');
    if (label) input.setAttribute('aria-label', label);
  });
}
