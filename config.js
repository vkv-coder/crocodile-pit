// ============================================================
// CROCODILE PIT — shared config and scoring
// Supabase project: Dhobi-digital
// ============================================================
const SUPABASE_URL  = "https://jqqnnkzozjskziaizajg.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxcW5ua3pvempza3ppYWl6YWpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5Mjk1ODAsImV4cCI6MjA4ODUwNTU4MH0.sEYeWnm0dvuw8bLSVnQhqmgV8LB-pELjpuVIa3Us1Gg";

const ADMIN_PIN = "croc@admin2026";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
  realtime: { params: { eventsPerSecond: 20 } }
});

/* ---------- number layout: 1 and 20 only at row start / row end ---------- */
function makeLayout(){
  const edges = [0,4,5,9,10,14,15,19];
  const a = edges[Math.floor(Math.random()*edges.length)];
  let b = a;
  while(b === a) b = edges[Math.floor(Math.random()*edges.length)];
  const mid = [];
  for(let n=2;n<=19;n++) mid.push(n);
  for(let i=mid.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [mid[i],mid[j]] = [mid[j],mid[i]];
  }
  const cells = new Array(20).fill(null);
  cells[a]=1; cells[b]=20;
  let k=0;
  for(let i=0;i<20;i++) if(cells[i]===null) cells[i]=mid[k++];
  return cells;
}

function fmtMs(ms){
  if(ms==null) return "—";
  const s=Math.floor(ms/1000), cs=Math.floor((ms%1000)/10), m=Math.floor(s/60);
  return (m ? m+":"+String(s%60).padStart(2,"0") : String(s).padStart(2,"0"))+"."+String(cs).padStart(2,"0");
}

const escHtml = s => String(s).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));

/* ---------- suggested scoring ---------- */
function suggestScoring(teamCount){
  const n = Math.max(2, teamCount||4);
  return { top:n*250, last:250, mult:n<=4 ? 100 : 50 };
}
function pointsLadder(n, top, last){
  if(n<=1) return [top];
  const step=(top-last)/(n-1);
  return Array.from({length:n},(_,i)=>Math.round(top-i*step));
}

/* ============================================================
   SCOREBOARD — rounds down the rows, teams across the columns
   ============================================================ */
function computeScores(teams, roundNos, results, taps, room){
  const rows = teams.map(t=>{
    const per={};
    roundNos.forEach(rn=>{
      const r = results.find(x=>x.team_id===t.id && x.round_no===rn && x.duration_ms!=null);
      per[rn] = { dur: r ? r.duration_ms : null,
                  fouls: taps.filter(x=>x.team_id===t.id && x.round_no===rn && x.is_foul).length };
    });
    let bestRound=null, best=null;
    roundNos.forEach(rn=>{
      const d=per[rn].dur;
      if(d!=null && (best===null || d<best)){ best=d; bestRound=rn; }
    });
    return { team:t, per, best, bestRound, bestFouls: bestRound!=null ? per[bestRound].fouls : 0 };
  });

  const ladder = pointsLadder(teams.length, room.top_points, room.last_points);
  const played = rows.filter(r=>r.best!=null).sort((a,b)=>a.best-b.best);
  let rank=0;
  played.forEach((r,i)=>{
    if(i===0 || r.best!==played[i-1].best) rank=i;
    r.rank=rank+1;
    r.pts=ladder[Math.min(rank,ladder.length-1)];
    r.penalty=r.bestFouls*room.foul_multiplier;
    r.score=r.pts-r.penalty;
  });
  rows.filter(r=>r.best==null).forEach(r=>{ r.rank=null; r.pts=0; r.penalty=0; r.score=0; });
  return { rows, ladder };
}

function buildScoreboard(teams, roundNos, results, taps, room, highlightTeamId){
  const { rows, ladder } = computeScores(teams, roundNos, results, taps, room);
  const hl = id => id && id===highlightTeamId ? ' mine' : '';

  let h = '<div class="sbScroll"><table class="sb">';
  h += '<thead><tr><th class="rl"></th>';
  rows.forEach(r=> h += `<th class="tcol${hl(r.team.id)}" colspan="2">${escHtml(r.team.name)}</th>`);
  h += '</tr><tr><th class="rl">Round</th>';
  rows.forEach(r=> h += `<th class="sub${hl(r.team.id)}">Time</th><th class="sub${hl(r.team.id)}">Fouls</th>`);
  h += '</tr></thead><tbody>';

  roundNos.forEach(rn=>{
    h += `<tr><td class="rl">${rn}</td>`;
    rows.forEach(r=>{
      const c=r.per[rn], isBest=r.bestRound===rn;
      h += `<td class="num${hl(r.team.id)}${isBest?' bestcell':''}">${fmtMs(c.dur)}</td>`;
      h += `<td class="num f${hl(r.team.id)}${isBest?' bestcell':''}">${c.dur==null?'—':c.fouls}</td>`;
    });
    h += '</tr>';
  });

  h += '<tr class="sep"><td class="rl">Best</td>';
  rows.forEach(r=> h += `<td class="num bestrow${hl(r.team.id)}">${fmtMs(r.best)}</td><td class="num f bestrow${hl(r.team.id)}">${r.best==null?'—':r.bestFouls}</td>`);
  h += '</tr>';
  h += '<tr><td class="rl">Points</td>';
  rows.forEach(r=> h += `<td class="num" colspan="2">${r.best==null?'—':r.pts}</td>`);
  h += '</tr>';
  h += '<tr><td class="rl">Fouls</td>';
  rows.forEach(r=> h += `<td class="num pen" colspan="2">${r.penalty ? '−'+r.penalty : '0'}</td>`);
  h += '</tr>';
  h += '<tr class="scoreRow"><td class="rl">Score</td>';
  rows.forEach(r=> h += `<td class="num sc ${r.score<0?'neg':''}" colspan="2">${r.best==null?'—':r.score}</td>`);
  h += '</tr>';
  h += '<tr class="rankRow"><td class="rl">Rank</td>';
  rows.forEach(r=> h += `<td class="num rk" colspan="2">${r.rank ? '#'+r.rank : '—'}</td>`);
  h += '</tr></tbody></table></div>';

  h += `<p class="sbNote">Highlighted cells are each team's fastest round — that round alone decides the score. Rank points ${ladder.join(' · ')}, minus ${room.foul_multiplier} for every foul made in that same round. Equal times share the rank and the points.</p>`;
  return h;
}

function injectScoreboardCss(){
  if(document.getElementById('sbCss')) return;
  const s=document.createElement('style');
  s.id='sbCss';
  s.textContent = `
  .sbScroll{overflow-x:auto;-webkit-overflow-scrolling:touch;}
  table.sb{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums;}
  table.sb th,table.sb td{padding:9px 10px;white-space:nowrap;}
  table.sb th.rl,table.sb td.rl{
    text-align:left;position:sticky;left:0;z-index:2;background:#10231a;
    font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#6f9c7d;font-weight:700;}
  table.sb th.tcol{font-family:'Bungee',cursive;font-size:14px;text-align:center;color:#ffb020;
    border-bottom:1px solid rgba(255,255,255,.14);letter-spacing:.02em;}
  table.sb th.sub{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#6f9c7d;
    text-align:right;font-weight:700;padding-top:4px;padding-bottom:8px;}
  table.sb td.num{text-align:right;font-size:16px;font-weight:600;border-bottom:1px solid rgba(255,255,255,.06);}
  table.sb td.f{color:#8fb79c;font-size:14px;}
  table.sb td.bestcell{background:rgba(255,176,32,.14);color:#ffd88a;}
  table.sb tr.sep td{border-top:2px solid rgba(255,255,255,.18);padding-top:12px;}
  table.sb td.bestrow{background:rgba(255,176,32,.22);color:#ffb020;font-family:'Bungee',cursive;font-size:15px;}
  table.sb td.pen{color:#e0472c;}
  table.sb tr.scoreRow td.sc{font-family:'Bungee',cursive;font-size:20px;color:#ffb020;}
  table.sb tr.scoreRow td.sc.neg{color:#e0472c;}
  table.sb tr.rankRow td.rk{font-family:'Bungee',cursive;font-size:17px;color:#9fd0b2;}
  table.sb th.mine,table.sb td.mine{background:rgba(63,164,106,.13);}
  table.sb td.bestcell.mine{background:rgba(255,176,32,.2);}
  table.sb td.bestrow.mine{background:rgba(255,176,32,.28);}
  .sbNote{color:#8fb79c;font-size:13px;line-height:1.5;margin:14px 0 0;white-space:normal;}
  `;
  document.head.appendChild(s);
}
