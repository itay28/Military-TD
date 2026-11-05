// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountHelpOverlay } from './helpOverlay';
import { KEY_MAP } from './keymap';

let root: HTMLElement;
beforeEach(() => {
  document.body.replaceChildren();
  root = document.createElement('div');
  root.hidden = true;
  document.body.append(root);
});

const rows = () =>
  [...root.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('th, td')].map((c) => c.textContent));

describe('mountHelpOverlay', () => {
  it('shows a modal dialog named Keys', () => {
    mountHelpOverlay(root, { onBack: () => {} });
    const dialog = root.querySelector('[role="dialog"]')!;
    expect(root.hidden).toBe(false);
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe('Keys');
  });

  it('lists every key in the key map, with what it does, in key map order', () => {
    mountHelpOverlay(root, { onBack: () => {} });
    expect(rows()).toEqual(KEY_MAP.map(({ label, description }) => [label, description]));
  });

  it('focuses Back, and Back closes it and calls onBack', () => {
    const onBack = vi.fn();
    mountHelpOverlay(root, { onBack });
    const back = root.querySelector('button')!;
    expect(back.textContent).toBe('Back');
    expect(document.activeElement).toBe(back);
    back.click();
    expect(onBack).toHaveBeenCalledOnce();
    expect(root.hidden).toBe(true);
    expect(root.children).toHaveLength(0);
  });

  it('close() takes it away without calling onBack', () => {
    const onBack = vi.fn();
    const overlay = mountHelpOverlay(root, { onBack });
    overlay.close();
    overlay.back();
    expect(onBack).not.toHaveBeenCalled();
    expect(root.hidden).toBe(true);
  });
});
