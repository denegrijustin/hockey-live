import { useEffect } from "react";

const SKIP = ".standings-table, .po-table";

/** Labels every cell with its column heading (so a phone can show a table row as a card), and gives a sortable table a "Sort by" menu in place of its hidden header. */
function label(table: HTMLTableElement) {
  const head = table.querySelector("thead tr:last-child");
  if (!head) return;
  const cells = [...head.children] as HTMLElement[];
  const names = cells.map((th) => (th.textContent ?? "").replace(/[▲▼⇅↑↓]/g, "").replace(/\s+/g, " ").trim());
  for (const tr of table.querySelectorAll("tbody tr")) {
    let i = 0;
    for (const td of [...tr.children] as HTMLTableCellElement[]) {
      const name = names[i] ?? "";
      if (td.getAttribute("data-label") !== name) td.setAttribute("data-label", name);
      i += td.colSpan || 1;
    }
  }
  const buttons = cells.map((th) => th.querySelector("button"));
  if (!buttons.some(Boolean)) return;
  const wrap = table.closest(".table-scroll");
  if (!wrap || !wrap.parentElement) return;
  let box = wrap.previousElementSibling as HTMLElement | null;
  if (!box?.classList.contains("stk-sort")) {
    box = document.createElement("label");
    box.className = "stk-sort";
    box.innerHTML = '<span>Sort by</span><select aria-label="Sort by"></select>';
    wrap.parentElement.insertBefore(box, wrap);
    box.querySelector("select")!.addEventListener("change", (e) => {
      const target = Number((e.target as HTMLSelectElement).value);
      const live = [...(table.querySelector("thead tr:last-child")?.children ?? [])] as HTMLElement[];
      live[target]?.querySelector("button")?.click();
    });
  }
  const select = box.querySelector("select")!;
  const wanted = names.map((n, i) => (buttons[i] ? `${i}\u0000${n}` : null)).filter(Boolean) as string[];
  if (select.options.length !== wanted.length || wanted.some((w, i) => select.options[i].value !== w.split("\u0000")[0] || select.options[i].text !== w.split("\u0000")[1])) {
    select.innerHTML = "";
    for (const w of wanted) { const [v, t] = w.split("\u0000"); select.add(new Option(t, v)); }
  }
  const sorted = cells.findIndex((th) => th.getAttribute("aria-sort") && th.getAttribute("aria-sort") !== "none");
  if (sorted >= 0) select.value = String(sorted);
}

/** On a phone, wide tables become cards (see styles.css): this keeps their cells labelled as the page changes. */
export function useStackedTables(view: string) {
  useEffect(() => {
    let frame = 0;
    const run = () => { frame = 0; document.querySelectorAll<HTMLTableElement>(`.table-scroll table:not(${SKIP}), table.np-table, table.nhlp-table`).forEach(label); };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(run); };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.getElementById("main") ?? document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, [view]);
}
