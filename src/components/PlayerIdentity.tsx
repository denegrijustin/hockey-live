import { useState } from 'react';
import { usePlayerProfile } from './player/PlayerContext';
import { FollowButton } from './FollowButton';
/** A player as a button (headshot, name, team, number) that opens the one app-wide player profile. */
export function PlayerIdentity({p, season}: {p: {id:number; name:string; team:string; number?:number|null; headshot?:string; position?:string}, season?:number}) {
  const [imageFailed,setImageFailed]=useState(false);
  const openPlayer=usePlayerProfile();
  const headshot=p.headshot ?? (season ? `https://assets.nhle.com/mugs/nhl/${season}/${p.team}/${p.id}.png` : undefined);
  return (
    <span className="pi-wrap">
    <button type="button" className="player-identity" onClick={()=>openPlayer({id:p.id,name:p.name,team:p.team,headshot,number:p.number})} aria-label={`View ${p.name} details`}>
      {headshot && !imageFailed ? <img src={headshot} alt="" loading="lazy" decoding="async" width="44" height="44" onError={()=>setImageFailed(true)}/> : <span className="player-placeholder">{p.name.split(' ').map(n=>n[0]).slice(0,2).join('')}</span>}
      <span><strong>{p.name}</strong><small>{p.team} · {p.number != null ? `#${p.number}` : 'No. unavailable'}</small></span>
    </button>
    <FollowButton compact player={{id:p.id,name:p.name,team:p.team,pos:p.position,number:p.number,headshot:headshot && headshot.startsWith('https://assets.nhle.com/') ? headshot : ''}}/>
    </span>
  );
}
