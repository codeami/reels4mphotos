type Child = Node | string | null | false | undefined;
type Props = Record<
  string,
  string | number | boolean | EventListener | Partial<CSSStyleDeclaration> | null | undefined
>;

/** Tiny hyperscript helper. Text goes through textContent, never innerHTML. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    // CSP has no 'unsafe-inline' for styles: set styles through CSSOM, never a style attribute.
    if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function')
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c) el.append(c);
  return el;
}
