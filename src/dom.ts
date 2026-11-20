// Tiny DOM helper and localStorage wrapper shared by the tournament view and the dashboard.

export type Kid = Node | string | number | null | false | undefined;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K, props?: Record<string, unknown> | null, ...kids: Kid[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(typeof kid === 'object' ? kid : String(kid));
  }
  return el;
}

export const store = {
  get: (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string): void => { try { localStorage.setItem(k, v); } catch { /* quota / private mode */ } },
  del: (k: string): void => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

/** Like `store`, but forgotten when the tab is closed: for transient state such as the last search. */
export const session = {
  get: (k: string): string | null => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string): void => { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } },
};
