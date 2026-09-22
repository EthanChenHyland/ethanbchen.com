/** A keyboard-accessible close look at the real Clarity interface. */
export function setupProjectLens(signal: AbortSignal): void {
  const figure = document.querySelector('.clarity-image');
  if (!figure || signal.aborted) return;
  const launch = document.createElement('button');
  launch.type = 'button';launch.className = 'project-lens-launch mono';launch.textContent = 'INSPECT THE INTERFACE ↗';
  const dialog = document.createElement('dialog');dialog.className = 'project-lens';dialog.setAttribute('aria-labelledby', 'lens-title');
  dialog.innerHTML = `<header><div><span class="mono">CLARITY / SOURCE INTERFACE</span><h2 id="lens-title">A closer look.</h2></div><button type="button" class="lens-close" aria-label="Close interface viewer">CLOSE ×</button></header><div class="lens-toolbar"><p>The real interface, rendered from Clarity’s application source.</p><button type="button" class="lens-zoom" aria-pressed="false">ZOOM IN +</button></div><div class="lens-image" tabindex="0" role="region" aria-label="Clarity interface image. When zoomed, scroll to explore."><img src="/media/clarity-overlay.png" alt="Clarity interface with assistance actions and a question composer." width="1328" height="870"></div>`;
  figure.querySelector('.overlay-mat')?.append(launch);document.body.append(dialog);
  const close = dialog.querySelector<HTMLButtonElement>('.lens-close')!;
  const zoom = dialog.querySelector<HTMLButtonElement>('.lens-zoom')!;
  const image = dialog.querySelector<HTMLElement>('.lens-image')!;
  let previousOverflow = '';
  launch.addEventListener('click', () => { previousOverflow = document.body.style.overflow;document.body.style.overflow = 'hidden';dialog.showModal();close.focus(); }, { signal });
  close.addEventListener('click', () => dialog.close(), { signal });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); }, { signal });
  dialog.addEventListener('close', () => { document.body.style.overflow = previousOverflow;dialog.classList.remove('is-zoomed');zoom.setAttribute('aria-pressed','false');zoom.textContent='ZOOM IN +';launch.focus(); }, { signal });
  zoom.addEventListener('click', () => { const active = dialog.classList.toggle('is-zoomed');zoom.setAttribute('aria-pressed',String(active));zoom.textContent=active?'FIT TO SCREEN −':'ZOOM IN +';image.scrollTop=0;image.scrollLeft=0; }, { signal });
  signal.addEventListener('abort', () => { if(dialog.open)document.body.style.overflow=previousOverflow;dialog.remove();launch.remove(); }, { once: true });
}
