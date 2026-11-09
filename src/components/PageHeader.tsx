import type { ReactNode } from "react";
import { Icon } from "./icons";

/**
 * The header every major screen opens with: one h1, an optional eyebrow above it, a back link for nested screens and room for actions.
 * One component so titles, spacing and back behaviour match everywhere.
 */
export function PageHeader({ title, eyebrow, back, actions, children, id }: {
  title: ReactNode;
  eyebrow?: ReactNode;
  /** For a screen opened from another: where Back goes (it keeps the parent's place; the browser Back button does the same). */
  back?: { label: string; onClick: () => void };
  actions?: ReactNode;
  children?: ReactNode;
  id?: string;
}) {
  return (
    <header className="page-header" id={id}>
      {back && (
        <button type="button" className="ph-back" onClick={back.onClick} aria-label={`Back to ${back.label}`}>
          <span className="ph-chev" aria-hidden="true"><Icon name="chevron" size={18} /></span>
          {back.label}
        </button>
      )}
      <div className="ph-row">
        <div className="ph-titles">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1>{title}</h1>
        </div>
        {actions && <div className="ph-actions">{actions}</div>}
      </div>
      {children}
    </header>
  );
}
