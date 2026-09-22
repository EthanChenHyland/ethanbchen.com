import { setupProjectLens } from './project-lens';
import { setupChapterNavigation } from './navigation';
import { setupBackdrop } from './backdrop';
import { setupProjectWorlds } from './project-worlds';
import { setupPointer } from './pointer';
import { setupSchemaDesk } from './schema-desk';
import { setupMediaStage } from './media-stage';
import { setupWorkbench } from './workbench';
import { setupHeroField } from './hero-field';
import { setupExplorers } from './explorers';
import { setupPiano } from './piano';
import { setupSignal } from './signal';

const lifecycle = new AbortController();
setupPointer(lifecycle.signal);
setupBackdrop(lifecycle.signal);
setupMediaStage(lifecycle.signal);
setupHeroField(lifecycle.signal);
setupWorkbench(lifecycle.signal);
setupExplorers(lifecycle.signal);
setupSchemaDesk(lifecycle.signal);
setupProjectWorlds(lifecycle.signal);
setupPiano(lifecycle.signal);
setupSignal(lifecycle.signal);
setupChapterNavigation(lifecycle.signal);
setupProjectLens(lifecycle.signal);
window.addEventListener('pagehide', event => {
  // Back/forward cache restores the same document and its existing listeners.
  if (!event.persisted) lifecycle.abort();
}, { signal: lifecycle.signal });
