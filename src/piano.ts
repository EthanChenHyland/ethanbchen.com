import { boundedProgress } from './content';

/** Playback follows captured data; no microphone, synthesis or model calls. */
export function setupPiano(signal: AbortSignal): void {
  const audio = document.querySelector<HTMLAudioElement>('#minuet-audio');
  const instrument = document.querySelector<HTMLElement>('.piano-instrument');
  const status = document.querySelector<HTMLElement>('#audio-status');
  if (!audio || !instrument || !status) return;
  const update = () => {
    instrument.style.setProperty('--audio-progress', String(boundedProgress(audio.currentTime, 0, 12.3)));
    status.textContent = `${audio.currentTime.toFixed(1)} SEC / SYNTHESIZED MINUET`;
  };
  for (const event of ['timeupdate', 'seeked', 'loadedmetadata', 'ended']) audio.addEventListener(event, update, { signal });
  audio.addEventListener('error', () => {
    status.textContent = 'AUDIO UNAVAILABLE — CAPTURED ANALYSIS SHOWN ABOVE';
  }, { signal });
}
