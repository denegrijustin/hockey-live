// Where on the body an injury is, from the words the report uses ("Knee (lower body)", "Concussion", "Undisclosed (upper body)"). Pure.
const ZONES = [
  ["head", /concussion|head|face|facial|jaw|eye|nose|skull|teeth|tooth|ear\b|cut/],
  ["neck", /neck|throat/],
  ["shoulder", /shoulder|collarbone|clavicle|ac joint|separated/],
  ["arm", /\barm\b|elbow|bicep|tricep|forearm/],
  ["hand", /hand|wrist|finger|thumb|knuckle/],
  ["chest", /chest|rib|pectoral|sternum|lung/],
  ["core", /abdomen|abdominal|core|stomach|oblique|appendix|hernia|torso/],
  ["back", /\bback\b|spine|spinal|lumbar/],
  ["groin", /groin|adductor|sports hernia/],
  ["hip", /\bhip\b|pelvis|glute/],
  ["thigh", /hamstring|quad|thigh/],
  ["knee", /knee|mcl|acl|pcl|meniscus|patella|kneecap/],
  ["calf", /calf|shin|\bleg\b|achilles/],
  ["ankle", /ankle/],
  ["foot", /foot|toe|heel/],
];
const GROUPS = [["upper", /upper[ -]?body/], ["lower", /lower[ -]?body/]];

/**
 * @param {{ kind?: string, comment?: string, side?: string | null }} item
 * @returns {{ zone: string, side: "left" | "right" | null, label: string, general: boolean }}
 */
export function injuryZone(item) {
  const kind = String(item.kind ?? "").toLowerCase();
  const comment = String(item.comment ?? "").toLowerCase();
  const text = `${kind} ${/\(([^)]+)\)/.exec(comment)?.[1] ?? ""}`;
  const side = /left/i.test(item.side ?? "") || /\bleft\b/.test(comment) ? "left" : /right/i.test(item.side ?? "") || /\bright\b/.test(comment) ? "right" : null;
  if (/illness|flu|sick|virus|covid|ill\b/.test(kind)) return { zone: "illness", side: null, label: "Illness", general: true };
  if (/personal|family|bereavement|non-?injury/.test(kind)) return { zone: "personal", side: null, label: "Personal reasons", general: true };
  for (const [zone, re] of ZONES) if (re.test(text)) {
    const name = zone[0].toUpperCase() + zone.slice(1);
    return { zone, side: side && !["head", "neck", "chest", "core", "back", "groin"].includes(zone) ? side : null, label: side && !["head", "neck", "chest", "core", "back", "groin"].includes(zone) ? `${side[0].toUpperCase()}${side.slice(1)} ${zone}` : name, general: false };
  }
  for (const [zone, re] of GROUPS) if (re.test(`${kind} ${comment}`)) return { zone, side: null, label: zone === "upper" ? "Upper body (not specified)" : "Lower body (not specified)", general: true };
  return { zone: "unknown", side: null, label: "Not specified", general: true };
}
