// Expands demo-src/*.txt (real data from the 2025 European Corporate Chess Championship,
// tnr1285835) into HTML pages that mimic chess-results.com markup exactly.
// Output: public/demo/*.html  — used by `/demo` and by the unit tests.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const OUT = 'public/demo';
mkdirSync(OUT, { recursive: true });

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const read = (f) => readFileSync(`demo-src/${f}`, 'utf8').split('\n').filter(Boolean);
const NB = '&nbsp;&nbsp;';
const TOURNAMENT = 'European Corporate Chess Championship 2025';

const page = (h2b, body) => `<!DOCTYPE html><html><head><title>Chess-Results Server - ${TOURNAMENT}</title></head><body>
<form><h2>${TOURNAMENT} </h2><p>Last update 10.11.2025 11:26:26, Creator/Last Upload: demo</p>
${h2b ? `<h2>${h2b}</h2>` : ''}
${body}
</form></body></html>`;

// ── standings (home page) ──
{
  const th = (s) => `<th class="CRc">&nbsp;${s}&nbsp;</th>`;
  const head = `<tr class="CRng1b"><th class="CRc">Rk.</th><th class="CRc">SNo</th><th class="CRc">FED</th><th class="CRc">&nbsp;</th><th class="CR">Team</th><th class="CRc">Group</th><th class="CRc">Games</th>${th('+')}${th('=')}${th('-')}${['TB1', 'TB2', 'TB3', 'TB4'].map(th).join('')}</tr>`;
  const rows = read('standings.txt').map((l, i) => {
    const c = l.split('|');
    const [rk, sno, fed, , team, grp, ...rest] = c;
    return `<tr class="CRng${(i % 2) + 1}"><td class="CRc">${rk}</td><td class="CRc">${sno}</td><td class="CRc">${fed}</td><td class="CR"></td><td class="CR">${esc(team)}</td><td class="CRc">${esc(grp)}</td>${rest.map((v) => `<td class="CRc">${v}</td>`).join('')}</tr>`;
  });
  const ann = `<p><b>Annotation:</b><br>Tie Break1: Matchpoints (variabel)<br>Tie Break2: Number of games won (WON) (Matchpoints)<br>Tie Break3: points (game-points)<br>Tie Break4: Manually input (after Tie-Break matches)</p>`;
  writeFileSync(`${OUT}/home.html`, page('Final Ranking after 9 Rounds', `<table class="CRs1">${head}${rows.join('')}</table>${ann}`));
}

// ── schedule ──
{
  const days = ['2025/11/07 3:00 pm', '2025/11/07 4:00 pm', '2025/11/07 5:00 pm', '2025/11/07 6:00 pm', '2025/11/08 10:00 am', '2025/11/08 11:00 am', '2025/11/08 2:00 pm', '2025/11/08 3:00 pm', '2025/11/08 4:00 pm'];
  const rows = days.map((d, i) => { const [date, ...t] = d.split(' '); return `<tr class="CRng${(i % 2) + 1}"><td class="CRc">${i + 1}</td><td class="CRc">${date}</td><td class="CRc">${t.join(' ')}</td></tr>`; });
  writeFileSync(`${OUT}/schedule.html`, page('Playing schedule', `<table class="CRs1"><tr class="CRng1b"><th class="CRc">Round</th><th class="CRc">Date</th><th class="CRc">Time</th></tr>${rows.join('')}</table>`));
}

// ── round pairings ──
{
  const rounds = [];
  for (const l of read('rounds.txt')) {
    if (l.startsWith('# ')) rounds.push({ title: l.slice(2), rows: [] });
    else rounds[rounds.length - 1].rows.push(l.split('|'));
  }
  rounds.forEach((r, i) => {
    const rows = r.rows.map(([no, h, a, rh, ra], k) =>
      `<tr class="CRng${(k % 2) + 1}"><td class="CRc">${no}</td><td class="CR">${NB}${esc(h)}</td><td class="CR">${NB}${esc(a)}</td><td class="CRc">${rh}</td><td class="CRc">:</td><td class="CRc">${ra}</td></tr>`);
    writeFileSync(`${OUT}/round-${i + 1}.html`, page('Team pairings',
      `<table class="CRs1"><tr class="CRg1b"><td class="none" colspan="6">${r.title}</td></tr><tr class="CRng1b"><th class="CRc">No.</th><th class="CR">Team</th><th class="CR">Team</th><th class="CRc">Res.</th><th class="CRc">:</th><th class="CRc">Res.</th></tr>${rows.join('')}</table>`));
  });
}

// ── team page ──
{
  const lines = read('team45.txt');
  const [, snr, rank, tname, avg, captain, tb1, tb2] = (() => {
    const [a, b, c, d, e, f, g] = lines[0].slice(5).split('|');
    return ['', a, b, c, d, e, f, g];
  })();
  const rn = lines.filter((l) => l.startsWith('R ')).length;
  const rcols = Array.from({ length: rn }, (_, i) => `<th class="CRc">${i + 1}</th>`).join('');
  const comp = [
    `<tr class="CRg1b"><td class="none" colspan="19"><div class="tn_FRA"></div>${NB}${rank}. ${esc(tname)} (RtgAvg:${avg}, Captain: ${esc(captain)} / TB1: ${tb1} / TB2: ${tb2})</td></tr>`,
    `<tr class="CRng1b"><th class="CRc">Bo.</th><th class="CR"></th><th class="CR">Name</th><th class="CRr">RtgI</th><th class="CRr">RtgN</th><th class="CR">FED</th><th class="CRr">FideID</th>${rcols}<th class="CRc">Pts.</th><th class="CRc">Games</th><th class="CRr">RtgAvg</th></tr>`,
    ...lines.filter((l) => l.startsWith('P ')).map((l, i) => {
      const [bo, title, name, ri, rn2, fed, fide, res, pts, games] = l.slice(2).split('|');
      return `<tr class="CRng${(i % 2) + 1} FRA"><td class="CRc">${bo}</td><td class="CR">${title}</td><td class="CR">${esc(name)}</td><td class="CRr">${ri}</td><td class="CRr">${rn2}</td><td class="CR">${fed}</td><td><a href="http://ratings.fide.com/profile/${fide}">${fide}</a></td>${res.split(' ').map((x) => `<td class="CRc">${x}</td>`).join('')}<td class="CRc">${pts}</td><td class="CRc">${games}</td><td class="CRr">0</td></tr>`;
    }),
  ].join('');

  // per player: the opponent met in each round, with RtgI/RtgN (the only place the pairings' ratings appear)
  const opp = [];
  for (const l of lines.filter((x) => x.startsWith('Q '))) {
    const [kind, ...c] = l.slice(2).trim().split('|');
    if (kind === 'T') {
      opp.push(`<tr class="CRg1b"><td class="none" colspan="10">${esc(c.join('|'))}</td></tr><tr class="CRng1b"><th class="CRc">Rd.</th><th class="CRc">SNo</th><th class="CR"></th><th class="CR">Name</th><th class="CRr">RtgI</th><th class="CRr">RtgN</th><th class="CR">FED</th><th class="CRc">Pts.</th><th class="CRc">Res.</th><th class="CRc">Bo.</th></tr>`);
    } else {
      opp.push(`<tr class="CRng1">${c.map((v, i) => `<td class="${i === 3 ? 'CR' : 'CRc'}">${esc(v)}</td>`).join('')}</tr>`);
    }
  }

  const player = (color, name) => `<table><tbody><tr><td><div class="${color === 'w' ? 'FarbewT' : 'FarbesT'}"></div></td><td class="CR">${esc(name)}</td></tr></tbody></table>`;
  const pair = [];
  for (const l of lines) {
    if (l.startsWith('R ')) pair.push(`<tr class="CRg1b"><td class="none" colspan="11">${l.slice(2)}</td></tr>`);
    else if (l.startsWith('M ')) {
      const [ls, ln, rs, rname, score] = l.slice(2).split('|');
      pair.push(`<tr class="CRng1b"><th class="CRc">Bo.</th><th class="CRc">${ls}</th><th class="CR"><div class="tn_FRA"></div>${NB}${esc(ln)}</th><th class="CR">FED</th><th class="CR"></th><th class="CRc">-</th><th class="CRc">${rs}</th><th class="CR"><div class="tn_FRA"></div>${NB}${esc(rname)}</th><th class="CR">FED</th><th class="CR"></th><th class="CRc">${score}</th></tr>`);
    } else if (l.startsWith('B ')) {
      const [tb, color, ln, lf, lt, rt, rname, rf, res] = l.slice(2).split('|');
      const other = color === 'w' ? 'b' : 'w';
      pair.push(`<tr class="CRng2"><td class="CRc">${tb}</td><td></td><td class="CR">${player(color, ln)}</td><td class="CR">${lf}</td><td class="CR">${lt}</td><td class="CRc">-</td><td class="CRc">${rt}</td><td class="CR">${player(other, rname)}</td><td class="CR">${rf}</td><td class="CR"></td><td class="CRc">${res}</td></tr>`);
    }
  }
  writeFileSync(`${OUT}/team-${snr}.html`, page('Team-Composition with round-results',
    `<table class="CRs1">${comp}</table>${opp.length ? `<table class="CRs1">${opp.join('')}</table>` : ''}<h3>Board Pairings</h3><table class="CRs1">${pair.join('')}</table>`));
}

console.log('demo pages written to', OUT);
