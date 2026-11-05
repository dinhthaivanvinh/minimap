/** How long a lost 3D context gets to come back before the page stops waiting. */
export const CONTEXT_RESTORE_WAIT_MS = 10_000;

/**
 * Calls onGone if a canvas loses its 3D context and the browser doesn't restore it.
 * three.js picks up a restored context by itself. Returns a function that stops
 * watching: call it before forcing a context loss on purpose.
 */
export function watchContextLoss(canvas: EventTarget, onGone: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onLost = () => {
    clearTimeout(timer);
    timer = setTimeout(onGone, CONTEXT_RESTORE_WAIT_MS);
  };
  const onRestored = () => clearTimeout(timer);
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  return () => {
    clearTimeout(timer);
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
  };
}
