import { MONEYPUCK } from "../../../lib/moneypuck.mjs";

/** The credit MoneyPuck asks for wherever its data is shown. */
export function Attribution({ className = "" }: { className?: string }) {
  return (
    <a className={`mp-attrib ${className}`.trim()} href={MONEYPUCK.url} target="_blank" rel="noreferrer noopener">
      Data: MoneyPuck.com
    </a>
  );
}
