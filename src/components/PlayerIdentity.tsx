import { useEffect, useRef, useState } from 'react';
import { useFeed } from '../lib/polling';
export function PlayerIdentity({p, season}: {p: {id:number; name:string; team:string; number?:number|null; headshot?:string}, season?:number}) {
  const [open,setOpen]=useState(false), [imageFailed,setImageFailed]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null);
  const {data,error}=useFeed<any>(open ? `/api/player/${p.id}` : null,300000);
  useEffect(()=>{ if(open) dialog.current?.showModal(); else dialog.current?.close(); },[open]);
  const headshot=p.headshot ?? (season ? `https://assets.nhle.com/mugs/nhl/${season}/${p.team}/${p.id}.png` : undefined);
  const rows=(data?.seasons ?? []).filter((s:any)=>s.gameTypeId===2 && (season == null || s.season===season));
  return <>
    <button className="player-identity" onClick={()=>setOpen(true)} aria-label={`View ${p.name} details`}>
      {headshot && !imageFailed ? <img src={headshot} alt="" loading="lazy" width="44" height="44" onError={()=>setImageFailed(true)}/> : <span className="player-placeholder">{p.name.split(' ').map(n=>n[0]).slice(0,2).join('')}</span>}
      <span><strong>{p.name}</strong><small>{p.team} · {p.number != null ? `#${p.number}` : 'No. unavailable'}</small></span>
    </button>
    <dialog ref={dialog} className="player-dialog" onClose={()=>setOpen(false)} onCancel={()=>setOpen(false)}>
      <button className="dialog-close" onClick={()=>setOpen(false)} aria-label="Close player details">Close ×</button>
      <h2>{data?.name ?? p.name}</h2>
      {data ? <>
        <div className="profile-bio"><img src={data.headshot} alt={data.name} width="100" height="100"/><p>Current profile: {data.team} · #{data.number ?? '—'} · {data.position}<br/>Born {data.birthDate} · {data.height} in · {data.weight} lb<br/>Shoots / catches: {data.shoots}</p></div>
        <h3>{season ? `${String(season).slice(0,4)}–${String(season).slice(6)}` : 'NHL career by season'} · regular season</h3>
        {!rows.length ? <p>Statistics for this season have not been published yet.</p> : <div className="table-scroll"><table><thead><tr><th>Season</th><th>Team</th><th>GP</th><th>{data.position==='G'?'SV%':'G'}</th><th>{data.position==='G'?'GAA':'A'}</th><th>{data.position==='G'?'Wins':'PTS'}</th></tr></thead><tbody>{rows.slice(-12).map((s:any,i:number)=><tr key={i}><td>{String(s.season).slice(0,4)}</td><td>{s.teamName?.default ?? '—'}</td><td>{s.gamesPlayed}</td><td>{data.position==='G' ? s.savePctg?.toFixed(3) ?? '—' : s.goals}</td><td>{data.position==='G' ? s.goalsAgainstAvg?.toFixed(2) ?? '—' : s.assists}</td><td>{data.position==='G' ? s.wins : s.points}</td></tr>)}</tbody></table></div>}
        <a href={`https://www.nhl.com/player/${p.id}`} target="_blank" rel="noreferrer">Full NHL profile and career history ↗</a>
      </> : <p>{error ? 'Player details unavailable. Close and reopen to retry.' : 'Loading player details…'}</p>}
    </dialog>
  </>;
}
