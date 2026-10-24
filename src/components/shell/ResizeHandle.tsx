import { useRef, useState } from "react";

const SETTLE = "width 220ms cubic-bezier(0.22, 1, 0.36, 1)";
const calm = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

type Drag = { x: number; w: number; raw: number; panel: HTMLElement; folded: boolean; moved: boolean; frame: number };

/**
 * The grab-edge of a side panel. The Nevorai sidebar standard (see ~/.claude/skills/sidebar-standard), tuned to feel like Claude / ChatGPT / Metrol CRM:
 *  - The panel follows the cursor 1:1, everywhere, folded or open: no dead zone, no jump, no easing lag. Width is written straight to the element once per
 *    animation frame (never React state), so a drag costs almost nothing even next to a long chat.
 *  - ONE threshold (`showAt`) decides what the panel looks like while dragging: narrower = icons only / hidden content, wider = full content. It flips live
 *    (with a few pixels of hysteresis so it cannot flicker), and what you SEE when you let go is what you get.
 *  - On release the panel settles with a short animation: folded panels to their folded width, open ones to at least `min`. Nothing else ever animates mid-drag.
 *  - A folded panel keeps its edge: drag it out, or just click it, and it opens to the width it had.
 *  - Double-click or Enter = normal size; arrow keys nudge (and fold at the minimum).
 * The bar sits straddling the panel's right edge, so the panel's content can be clipped (overflow-hidden) without clipping the bar.
 * `inside` puts it inside a thin strip (a panel folded to nothing) instead.
 */
export function ResizeHandle({ width, folded, foldedWidth, inside = false, min, max, showAt, label, onPreview, onCommit, onReset }: {
  /** The remembered open width: what a folded panel opens to when clicked. */
  width: number;
  folded: boolean;
  foldedWidth: number;
  inside?: boolean;
  min: number;
  max: number;
  /** While dragging, narrower than this the panel shows as folded, wider as open. */
  showAt: number;
  label: string;
  /** The panel just crossed `showAt` mid-drag (true = now looks folded); null = the drag was cancelled. Nothing is saved yet. */
  onPreview: (folded: boolean | null) => void;
  onCommit: (next: { width: number; folded: boolean }) => void;
  onReset: () => void;
}) {
  const drag = useRef<Drag | null>(null);
  const timer = useRef(0);
  const [dragging, setDragging] = useState(false);
  const clamp = (n: number, lo = min) => Math.min(max, Math.max(lo, n));

  function settle(panel: HTMLElement, to: number) {
    panel.style.transition = calm() ? "none" : SETTLE;
    panel.style.width = `${to}px`;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { panel.style.transition = ""; }, 260); // hands the panel back to its normal (button) transition
  }

  function end() {
    const d = drag.current;
    if (d?.frame) cancelAnimationFrame(d.frame);
    drag.current = null;
    setDragging(false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }

  /** Follow the pointer; flip the folded/open look at `showAt`. Returns the look now. */
  function follow(d: Drag) {
    const folds = d.folded ? d.raw < showAt + 6 : d.raw < showAt - 6; // a few pixels of hysteresis
    if (folds !== d.folded) { d.folded = folds; onPreview(folds); }
    d.panel.style.width = `${clamp(d.raw, foldedWidth)}px`;
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={folded ? 0 : Math.round(width)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={(e) => {
        const panel = e.currentTarget.parentElement;
        if (e.button !== 0 || !panel) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        window.clearTimeout(timer.current);
        panel.style.transition = "none"; // 1:1 while dragging
        const w = panel.getBoundingClientRect().width;
        drag.current = { x: e.clientX, w, raw: w, panel, folded, moved: false, frame: 0 };
        setDragging(true);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        d.raw = d.w + (e.clientX - d.x);
        if (Math.abs(e.clientX - d.x) > 3) d.moved = true;
        if (!d.frame) d.frame = requestAnimationFrame(() => { d.frame = 0; if (drag.current === d) follow(d); });
      }}
      onPointerUp={() => {
        const d = drag.current;
        if (!d) return;
        const startedFolded = folded;
        if (!d.moved) { // a plain click: opens a folded panel, does nothing to an open one
          end();
          if (startedFolded) { onPreview(false); settle(d.panel, clamp(width)); onCommit({ width: clamp(width), folded: false }); }
          else settle(d.panel, d.w);
          return;
        }
        follow(d);
        const isFolded = d.folded;
        const to = isFolded ? foldedWidth : clamp(d.raw);
        end();
        settle(d.panel, to);
        onCommit({ width: isFolded ? clamp(width) : to, folded: isFolded });
      }}
      onPointerCancel={() => {
        const d = drag.current;
        if (!d) return;
        end();
        settle(d.panel, d.w);
        onPreview(null);
      }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); onReset(); return; }
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        if (folded) { if (e.key === "ArrowRight") onCommit({ width: clamp(width), folded: false }); return; }
        const next = width + (e.key === "ArrowRight" ? 16 : -16);
        if (next < min) onCommit({ width: clamp(width), folded: true });
        else onCommit({ width: clamp(next), folded: false });
      }}
      className={`group absolute inset-y-0 z-40 hidden cursor-col-resize touch-none outline-none lg:block ${inside ? "inset-x-0" : "-right-1.5 w-3"}`}
    >
      <span className={`mx-auto block h-full w-0.5 transition-colors duration-150 group-hover:bg-accent-500/40 group-focus-visible:bg-accent-500/60 ${dragging ? "bg-accent-500/60" : ""}`} />
    </div>
  );
}
