type NetworkBrand = {
  key: string;
  label: string;
  match: RegExp;
};

const brands: NetworkBrand[] = [
  { key: "espn", label: "ESPN", match: /^ESPN/i },
  { key: "abc", label: "ABC", match: /\bABC\b/i },
  { key: "tnt", label: "TNT", match: /\bTNT\b/i },
  { key: "trutv", label: "truTV", match: /truTV/i },
  { key: "tbs", label: "TBS", match: /\bTBS\b/i },
  { key: "hulu", label: "Hulu", match: /HULU/i },
  { key: "disney", label: "Disney+", match: /Disney\+/i },
  { key: "max", label: "Max", match: /(?:HBO )?MAX/i },
  { key: "prime", label: "Prime Video", match: /Prime/i },
  { key: "snpit", label: "SportsNet Pittsburgh", match: /^SN-PIT/i },
  { key: "sportsnet", label: "Sportsnet", match: /^(?:SN|Sportsnet)/i },
  { key: "tsn", label: "TSN", match: /^TSN/i },
  { key: "cbc", label: "CBC", match: /^CBC/i },
  { key: "citytv", label: "Citytv", match: /^CITY/i },
  { key: "tvas", label: "TVA Sports", match: /^TVAS/i },
  { key: "rds", label: "RDS", match: /^RDS/i },
  { key: "nhln", label: "NHL Network", match: /^NHLN/i },
  { key: "nbc", label: "NBC Sports", match: /^NBCS/i },
  { key: "fox", label: "FOX", match: /^(?:FOX|KDFW|KTTV)/i },
  { key: "nesn", label: "NESN", match: /^NESN/i },
  { key: "msg", label: "MSG", match: /^MSG/i },
  { key: "fdsn", label: "FanDuel Sports Network", match: /^(?:FDSN|BN\+)/i },
  { key: "altitude", label: "Altitude", match: /^ALT/i },
  { key: "monumental", label: "Monumental", match: /^MNMT/i },
  { key: "chsn", label: "Chicago Sports Network", match: /^CHSN/i },
  { key: "victory", label: "Victory+", match: /^Victory\+/i },
  { key: "scripps", label: "Scripps Sports", match: /SCRIPPS/i },
  { key: "wild", label: "Wild+", match: /^(?:Wild\+|MINNHL)/i },
  { key: "oilers", label: "Oilers+", match: /^Oilers\+/i },
  { key: "blues", label: "Blues", match: /^(?:Blues App|STLNHL)/i },
  { key: "utah16", label: "Utah 16", match: /^Utah16/i },
];

function brandFor(network: string) {
  return brands.find((brand) => brand.match.test(network));
}

export function NetworkLogos({ broadcasts }: { broadcasts: string[] }) {
  const unique = [...new Set(broadcasts)];
  const branded = unique.map((network) => ({ network, brand: brandFor(network) }));
  const deduplicated = branded.filter(
    (item, index) =>
      branded.findIndex(
        (candidate) =>
          (candidate.brand?.key ?? candidate.network) ===
          (item.brand?.key ?? item.network),
      ) === index,
  );
  const visible = deduplicated.slice(0, 3);

  if (!visible.length) {
    return <span className="tv-tbd">TV TBD</span>;
  }

  return (
    <span
      className="network-logos"
      aria-label={`TV: ${unique.join(", ")}`}
      title={unique.join(" · ")}
    >
      {visible.map(({ network, brand }) => {
        return brand ? (
          <span className="network-logo" key={network} title={network}>
            <img
              src={`/network-logos/${brand.key}.png`}
              alt={brand.label}
              width="28"
              height="28"
              loading="lazy"
            />
          </span>
        ) : (
          <span className="network-logo network-logo-fallback" key={network} title={network}>
            {network.replace(/\s*\([^)]*\)\s*$/, "").slice(0, 5)}
          </span>
        );
      })}
      {deduplicated.length > visible.length && (
        <span className="network-more" aria-label={`${deduplicated.length - visible.length} more network brands`}>
          +{deduplicated.length - visible.length}
        </span>
      )}
    </span>
  );
}
