import manifest from '../../assets/manifest.json';
import pkg from '../../package.json';

/** One manifest pack (`assets/manifest.json`, docs/assets.md): the fields the Credits screen reads. */
interface CreditPack {
  readonly name: string;
  readonly author: string;
  readonly license: string;
  /** The pack's original source page. */
  readonly source: string;
  /** The recorded credit line; empty when the license doesn't need one. */
  readonly attribution: string;
}

/** What the Credits screen shows for one pack. */
export interface CreditEntry {
  readonly name: string;
  readonly author: string;
  readonly license: string;
  readonly link: string;
  /** Shown verbatim. */
  readonly attribution: string;
}

export interface GameCredits {
  readonly engine: string;
  readonly codeLicense: string;
}

/** One entry per pack, in manifest order: the same source as CREDITS.md (`scripts/credits.ts`). */
export function creditEntries(source: { readonly packs: readonly CreditPack[] }): CreditEntry[] {
  return source.packs.map((p) => ({
    name: p.name,
    author: p.author,
    license: p.license,
    link: p.source,
    attribution: p.attribution,
  }));
}

/** The game's own credits: the engine and the license of its code (`package.json`). */
export function gameCredits({ license }: { readonly license: string }): GameCredits {
  return { engine: 'Phaser', codeLicense: license };
}

export interface CreditsOptions {
  /** The page's `#app`: marked `data-screen="menu"` while the screen shows, which hides the game's UI. */
  readonly app: HTMLElement;
  /** Called when the player presses Back. */
  readonly onBack: () => void;
}

export interface Credits {
  /** Removes the screen's elements, hides it and shows the game's UI again; Back does nothing after this. */
  destroy(): void;
}

/** Builds the Credits screen inside `root`: every asset pack from the manifest, then the game's own credits. DOM, so tests can query it (ADR-0003). */
export function mountCredits(root: HTMLElement, { app, onBack }: CreditsOptions): Credits {
  const doc = root.ownerDocument;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string) => {
    const e = doc.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (className) e.className = className;
    return e;
  };

  const title = el('h1', 'Credits');
  const list = el('div', undefined, 'credits-list');
  for (const entry of creditEntries(manifest)) {
    const section = el('section', undefined, 'credit');
    const link = el('a', entry.link);
    link.href = entry.link;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    section.append(el('h2', entry.name), el('p', `${entry.author}, ${entry.license}`), link);
    if (entry.attribution) section.append(el('p', entry.attribution, 'credit-attribution'));
    list.append(section);
  }
  const game = gameCredits(pkg);
  const own = el('section', undefined, 'game-credits');
  own.append(el('h2', 'Military TD'), el('p', `Engine: ${game.engine}`), el('p', `Code license: ${game.codeLicense}`));
  list.append(own);

  const back = el('button', 'Back');
  back.type = 'button';
  const onClick = () => onBack();
  back.addEventListener('click', onClick);
  root.append(title, list, back);
  root.hidden = false;
  app.dataset.screen = 'menu';
  back.focus();
  return {
    destroy() {
      back.removeEventListener('click', onClick);
      root.replaceChildren();
      root.hidden = true;
      delete app.dataset.screen;
    },
  };
}
