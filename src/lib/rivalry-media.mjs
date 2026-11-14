/** Legal publication gate: having a CC photo copyright license is not an
 * authorization to redistribute trademarks, player likenesses or venue rights.
 * Full research manifest is in the downloadable rivalry asset package. */
export const RIVALRY_MEDIA_CANDIDATES = [
  {rivalry_id:"COL-DAL",source_url:"https://commons.wikimedia.org/wiki/File:Dr_Pepper.png",photographer:"LHC88",license:"CC BY 4.0",license_url:"https://creativecommons.org/licenses/by/4.0/",caption:"Dallas Stars vs Colorado Avalanche, December 28, 2019",commercial_app_use_approved:false,asset_url:null},
  {rivalry_id:"EDM-VAN",source_url:"https://commons.wikimedia.org/wiki/File:Face_off.jpg",photographer:"Anders Elkjaer Johansen",license:"Public domain (PD-self)",license_url:null,caption:"Edmonton Oilers vs Vancouver Canucks, December 21, 2005",commercial_app_use_approved:false,asset_url:null},
  {rivalry_id:"COL-MIN",source_url:"https://commons.wikimedia.org/wiki/File:The_crowd.jpg",photographer:"Sreejith K",license:"CC BY 2.0",license_url:"https://creativecommons.org/licenses/by/2.0/",caption:"Spectators at Minnesota Wild vs Colorado Avalanche, March 30, 2008",commercial_app_use_approved:false,asset_url:null,privacy_review_required:true}
];
export const UNCOVERED_RIVALRY_IMAGES = ["LAK-VGK","MIN-WPG","OTT-TOR"];
export function approvedRivalryMedia(items, rivalryId) {
 if (!Array.isArray(items) || typeof rivalryId !== "string") return [];
 return items.filter(a => a && a.rivalry_id===rivalryId && a.commercial_app_use_approved===true &&
    typeof a.asset_url==="string" && a.asset_url.startsWith("/rivalry-media/") &&
    typeof a.photographer==="string" && a.photographer.length > 0 &&
    typeof a.source_url==="string" && /^https:\/\//.test(a.source_url) &&
    typeof a.license==="string" && a.license.length > 0 && !a.privacy_review_required);
}
