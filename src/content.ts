/** Public schema meanings, not model output or clinical advice. */
export const schemaLabels = {
  present: 'The finding is explicitly supported by the report. A mention alone is not enough; the evidence must support its presence.',
  absent: 'The report explicitly supports a negative finding. This is different from a finding that is simply never mentioned.',
  uncertain: 'The report leaves the finding indeterminate. Preserve the uncertainty instead of forcing a yes or no.',
  not_reported: 'Silence is not a negative finding. The report does not supply the evidence needed to call it present or absent.',
} as const;
export const channels = {
  screen: 'Screen context enters when you request assistance. Capture depends on macOS permissions and a model that accepts images.',
  you: 'Your microphone has its own transcript channel. Choose local whisper.cpp or a cloud speech provider; Local mode does not silently send audio to the cloud.',
  them: 'System audio stays in a separate conversation channel. The native capture path handles macOS permissions and audio recovery.',
} as const;
export function isKey<T extends object>(key: string | undefined, value: T): key is Extract<keyof T, string> {
  return typeof key === 'string' && Object.hasOwn(value, key);
}
export function boundedProgress(value: number, start: number, end: number): number {
  if (!Number.isFinite(value) || end <= start) return 0;
  return Math.max(0, Math.min(1, (value - start) / (end - start)));
}
