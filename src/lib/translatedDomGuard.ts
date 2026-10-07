/**
 * Let the app survive being machine-translated.
 *
 * A customer in Próspera could not pay: the checkout replaced itself with
 * "Algo se rompió" the moment they reached the payment step, carrying
 *
 *   Error al ejecutar 'removeChild' en 'Node': El nodo que se va a eliminar
 *   no es hijo de este nodo.
 *
 * Nothing was wrong with the payment code. The app's own error screen says
 * "Something broke" and has no Spanish translation, so the Spanish they were
 * reading was Chrome's: the page had been auto-translated on their phone.
 *
 * Google Translate rewrites text nodes in place — it swaps them for its own
 * `<font>` wrappers — while React goes on holding references to the originals.
 * The next time React removes or reorders one of those nodes, the node is no
 * longer a child of the parent React remembers, and the DOM call throws. Any
 * re-render will do it; arriving at the payment step is simply a big one.
 *
 * React cannot defend against this (facebook/react#11538) and the accepted
 * answer is the one below: make the two calls that break tolerant. A removal
 * of a node that something else already moved has nothing left to do, so it
 * returns the node instead of throwing; an insertion before a reference that
 * has been reparented falls back to appending. The page then renders slightly
 * wrong in the translated copy rather than dying — and in the untranslated
 * one, where parents always match, neither branch is ever taken.
 *
 * The real cure is Spanish the customer does not have to ask Chrome for: most
 * of the app, checkout included, is still hard-coded English, which is why
 * their browser offered to translate it in the first place.
 */

let installed = false;

export function installTranslatedDomGuard(): void {
  if (installed || typeof Node !== "function" || !Node.prototype) return;
  installed = true;

  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      // Already gone, or moved by something outside React. Nothing to undo.
      if (import.meta.env.DEV) {
        console.warn("[translated-dom] removeChild on a node that moved", child, this);
      }
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(
    this: Node, newNode: T, referenceNode: Node | null,
  ): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      if (import.meta.env.DEV) {
        console.warn("[translated-dom] insertBefore a reference that moved", referenceNode, this);
      }
      // Appending keeps the node on the page; the order is the translator's
      // problem, and a mis-ordered paragraph beats a blank checkout.
      return originalInsertBefore.call(this, newNode, null) as T;
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  };
}
