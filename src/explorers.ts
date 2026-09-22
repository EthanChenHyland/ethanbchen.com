import { channels, isKey, schemaLabels } from './content';

export function setupExplorers(signal: AbortSignal): void {
  const labels = document.querySelectorAll<HTMLButtonElement>('[data-label]');
  const description = document.querySelector<HTMLElement>('#schema-description');
  labels.forEach(button => button.addEventListener('click', () => {
    const label = button.dataset.label;
    if (!description || !isKey(label, schemaLabels)) return;
    labels.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    description.textContent = schemaLabels[label];
  }, { signal }));

  const controls = document.querySelectorAll<HTMLButtonElement>('[data-channel]');
  const channelDescription = document.querySelector<HTMLElement>('#channel-description');
  const traces = document.querySelectorAll<SVGPathElement>('.channel-traces path');
  traces[0]?.classList.add('is-current');
  controls.forEach((button, index) => button.addEventListener('click', () => {
    const channel = button.dataset.channel;
    if (!channelDescription || !isKey(channel, channels)) return;
    controls.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    traces.forEach((trace, traceIndex) => trace.classList.toggle('is-current', index === traceIndex));
    channelDescription.textContent = channels[channel];
  }, { signal }));
}
