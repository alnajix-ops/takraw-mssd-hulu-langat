import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement,
  LineElement, ArcElement, Tooltip, Legend, Filler,
} from 'chart.js';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBars, faBolt, faChartColumn, faChevronRight, faClipboard,
  faCopy, faDownload, faEdit, faFilter, faFlagCheckered, faFutbol,
  faGaugeHigh, faLayerGroup, faLocationDot, faMedal, faPlus, faPrint,
  faSchool, faSearch, faTrophy, faTrash, faUpload, faUsers,
  faXmark, faCheck, faClock, faFire,
} from '@fortawesome/free-solid-svg-icons';
import { calculateStandings, initials, seedData } from './data';
import { isFirebaseConfigured, saveTournament, subscribeToTournament } from './firebase';
import takrawPlayer from './assets/takraw-player.png';
import mssdLogo from './assets/mssd-hulu-langat-clean.png';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler);
ChartJS.defaults.devicePixelRatio = 2;

const STORAGE_KEY = 'mssd-takraw-hulu-langat-v1';
const LOGO_CLEANUP_KEY = 'mssd-takraw-logo-cleanup-v2';
const ROSTER_VERSION_KEY = 'mssd-takraw-roster-2026-v3';
const KNOCKOUT_GATE_VERSION_KEY = 'mssd-takraw-knockout-gate-v1';
const MAX_STORED_LOGO_LENGTH = 450000;
const navItems = [
  { id: 'dashboard', label: 'Dashboard Utama', icon: faGaugeHigh },
  { id: 'schools', label: 'Sekolah', icon: faSchool },
  { id: 'groups', label: 'Kumpulan', icon: faLayerGroup },
  { id: 'matches', label: 'Perlawanan & Keputusan', icon: faFutbol },
  { id: 'knockout', label: 'Pusingan Kalah Singkir', icon: faFlagCheckered },
  { id: 'stats', label: 'Carta Statistik', icon: faChartColumn },
];

const KNOCKOUT_OPENING = [
  ['J1', null], ['N3', 'N4'], ['J16', 'N20'], ['J17', 'N19'],
  ['J8', 'N28'], ['J25', 'N11'], ['J9', 'N27'], ['J24', 'N12'],
  ['J4', null], ['J29', 'N7'], ['J13', 'N23'], ['J20', 'N16'],
  ['J5', null], ['J28', 'N8'], ['J12', 'N24'], ['J21', 'N15'],
  ['J2', null], ['N2', 'N5'], ['J15', 'N21'], ['J18', 'N18'],
  ['J7', 'N29'], ['J26', 'N10'], ['J10', 'N26'], ['J23', 'N13'],
  ['J3', null], ['N1', 'N6'], ['J14', 'N22'], ['J19', 'N17'],
  ['J6', null], ['J27', 'N9'], ['J11', 'N25'], ['J22', 'N14'],
];
const P16_PATHS = [
  ['Laluan JOHAN 1 / P1', 'Pemenang P2 / P3'], ['Pemenang P4 / P5', 'Pemenang P6 / P7'],
  ['Laluan JOHAN 4 / P8', 'Pemenang P9 / P10'], ['Laluan JOHAN 5 / P11', 'Pemenang P12 / P13'],
  ['Laluan JOHAN 2 / P14', 'Pemenang P15 / P16'], ['Pemenang P17 / P18', 'Pemenang P19 / P20'],
  ['Laluan JOHAN 3 / P21', 'Pemenang P22 / P23'], ['Laluan JOHAN 6 / P24', 'Pemenang P25 / P26'],
];

function knockoutQualifiers(data, standings) {
  const ranked = (position) => data.groups.map((group) => {
    const ids = new Set(group.teamIds);
    return standings.filter((team) => ids.has(team.id))[position];
  }).filter(Boolean).sort((a, b) => b.p - a.p || b.gd - a.gd || b.f - a.f || a.name.localeCompare(b.name));
  const champions = ranked(0);
  const runners = ranked(1);
  return Object.fromEntries([
    ...champions.map((team, index) => [`J${index + 1}`, team]),
    ...runners.map((team, index) => [`N${index + 1}`, team]),
  ]);
}

function qualifierSlotLabel(code) {
  if (!code) return '';
  const rank = Number(code.slice(1));
  return `${code.startsWith('J') ? 'JOHAN' : 'NAIB JOHAN'} ${rank}`;
}

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { labels: { color: '#c5d0e0', boxWidth: 10, font: { family: 'Inter', size: 11, weight: 600 } } } },
  scales: {
    x: { ticks: { color: '#aebbd0', font: { family: 'Inter', size: 10, weight: 600 } }, grid: { color: 'rgba(255,255,255,.04)' } },
    y: { ticks: { color: '#aebbd0', font: { family: 'Inter', size: 10, weight: 600 } }, grid: { color: 'rgba(255,255,255,.04)' } },
  },
};

function removeEdgeWhiteBackground(source) {
  return new Promise((resolve) => {
    if (!source) return resolve(source);
    const image = new Image();
    image.onload = () => {
      const maxDimension = 512;
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const frame = context.getImageData(0, 0, canvas.width, canvas.height);
      const { data, width, height } = frame;
      const visited = new Uint8Array(width * height);
      const queue = [];
      const isWhite = (index) => data[index] > 235 && data[index + 1] > 235 && data[index + 2] > 235 && data[index + 3] > 0;
      const add = (x, y) => {
        const pixel = y * width + x;
        if (visited[pixel]) return;
        const index = pixel * 4;
        if (!isWhite(index)) return;
        visited[pixel] = 1;
        queue.push(pixel);
      };
      for (let x = 0; x < width; x += 1) { add(x, 0); add(x, height - 1); }
      for (let y = 0; y < height; y += 1) { add(0, y); add(width - 1, y); }
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const pixel = queue[cursor];
        const x = pixel % width;
        const y = Math.floor(pixel / width);
        data[pixel * 4 + 3] = 0;
        if (x > 0) add(x - 1, y);
        if (x < width - 1) add(x + 1, y);
        if (y > 0) add(x, y - 1);
        if (y < height - 1) add(x, y + 1);
      }
      context.putImageData(frame, 0, 0);
      resolve(canvas.toDataURL('image/webp', 0.88));
    };
    image.onerror = () => resolve(source);
    image.src = source;
  });
}

function removeOversizedLogos(data, removeAll = false) {
  const schoolIds = new Set(data.schools
    .filter((school) => school.logo && (removeAll || school.logo.length > MAX_STORED_LOGO_LENGTH))
    .map((school) => school.id));
  if (!schoolIds.size) return data;
  return {
    ...data,
    schools: data.schools.map((school) => schoolIds.has(school.id) ? { ...school, logo: '' } : school),
    teams: data.teams.map((team) => schoolIds.has(team.schoolId) ? { ...team, logo: '' } : team),
  };
}

function migrateRoster(stored) {
  const fresh = seedData();
  if (!stored?.schools) return fresh;
  const existing = Object.fromEntries(stored.schools.map((school) => [school.name.toLowerCase(), school]));
  const schools = fresh.schools.map((school) => {
    const previous = existing[school.name.toLowerCase()];
    return previous ? { ...school, logo: previous.logo || '', color: previous.color || school.color } : school;
  });
  const schoolById = Object.fromEntries(schools.map((school) => [school.id, school]));
  return {
    ...fresh,
    schools,
    teams: fresh.teams.map((team) => ({ ...team, logo: schoolById[team.schoolId].logo, color: schoolById[team.schoolId].color })),
  };
}

function repairStoredData(stored) {
  const fresh = seedData();
  if (!stored || !Array.isArray(stored.teams) || !Array.isArray(stored.schools)) return fresh;
  const validTeamIds = new Set(stored.teams.map((team) => team.id));
  const groups = (Array.isArray(stored.groups) ? stored.groups : fresh.groups)
    .map((group) => ({ ...group, teamIds: (Array.isArray(group.teamIds) ? group.teamIds : []).filter((id) => validTeamIds.has(id)) }))
    .filter((group) => group.teamIds.length);
  const validGroupIds = new Set(groups.map((group) => group.id));
  const matches = (Array.isArray(stored.matches) ? stored.matches : [])
    .filter((match) => validGroupIds.has(match.groupId) && validTeamIds.has(match.homeId) && validTeamIds.has(match.awayId));

  return removeOversizedLogos({
    ...fresh,
    ...stored,
    schools: stored.schools,
    teams: stored.teams,
    groups,
    matches: matches.length ? matches : fresh.matches,
    activities: Array.isArray(stored.activities) ? stored.activities : fresh.activities,
    knockoutMatches: Array.isArray(stored.knockoutMatches) ? stored.knockoutMatches : [],
    settings: { ...fresh.settings, ...(stored.settings || {}) },
  });
}

function TeamLogo({ team, size = 'md' }) {
  return team?.logo
    ? <img className={`team-logo ${size}`} src={team.logo} alt="" />
    : <span className={`team-logo initials ${size}`} style={{ '--team': team?.color || '#18d5ff' }}>{initials(team?.name || 'SK')}</span>;
}

function Status({ value }) {
  const cls = value === 'Tamat' ? 'done' : value === 'Sedang Bermain' ? 'live' : 'waiting';
  return <span className={`status ${cls}`}><i />{value}</span>;
}

function SectionHead({ eyebrow, title, action }) {
  return <div className="section-head"><div><span>{eyebrow}</span><h2>{title}</h2></div>{action}</div>;
}

function PrintButton({ onClick }) {
  return <button className="btn ghost" onClick={onClick}><FontAwesomeIcon icon={faPrint} /> Cetak PDF</button>;
}

function Modal({ title, children, onClose }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={(e) => e.stopPropagation()}>
    <div className="modal-title"><h3>{title}</h3><button className="icon-btn" onClick={onClose}><FontAwesomeIcon icon={faXmark} /></button></div>
    {children}
  </div></div>;
}

function AdminResetModal({ data, setData, onClose }) {
  const [pending, setPending] = useState(null);
  const [notice, setNotice] = useState('');
  const requestReset = (title, message, action, danger = false) => setPending({ title, message, action, danger });
  const runReset = () => {
    pending.action();
    setNotice(`${pending.title} berjaya dilaksanakan.`);
    setPending(null);
  };
  const resetGroups = () => setData((previous) => {
    const groups = Array.from({ length: Math.ceil(previous.teams.length / 3) }, (_, index) => ({
      id: `group-${index + 1}`,
      name: `Kumpulan ${index + 1}`,
      teamIds: previous.teams.slice(index * 3, index * 3 + 3).map((team) => team.id),
    }));
    return { ...previous, groups, matches: generateGroupMatches(groups), knockoutMatches: [], settings: { ...previous.settings, knockoutGenerated: false } };
  });
  const resetResults = () => setData((previous) => ({
    ...previous,
    matches: previous.matches.map((match) => ({ ...match, status: 'Menunggu', homeScore: '', awayScore: '' })),
    knockoutMatches: [],
    activities: [],
    settings: { ...previous.settings, knockoutGenerated: false },
  }));
  const resetLogos = () => setData((previous) => ({
    ...previous,
    schools: previous.schools.map((school) => ({ ...school, logo: '' })),
    teams: previous.teams.map((team) => ({ ...team, logo: '' })),
  }));
  return <Modal title="Pusat Reset Admin" onClose={onClose}>
    {notice && <div className="reset-notice"><FontAwesomeIcon icon={faCheck} /> {notice}</div>}
    {!pending ? <div className="admin-reset-grid">
      <button onClick={() => requestReset('Reset Kumpulan & Jadual', 'Susun semula semua pasukan mengikut urutan dan jana jadual kumpulan baharu?', resetGroups)}><FontAwesomeIcon icon={faLayerGroup} /><div><strong>Reset Kumpulan & Jadual</strong><span>Susun semula kumpulan asal dan kosongkan jadual kalah singkir.</span></div></button>
      <button onClick={() => requestReset('Reset Keputusan', 'Kosongkan semua skor, status perlawanan dan aktiviti terkini?', resetResults)}><FontAwesomeIcon icon={faFutbol} /><div><strong>Reset Keputusan</strong><span>Kosongkan skor dan status tanpa membuang pasukan.</span></div></button>
      <button onClick={() => requestReset('Reset Logo Sekolah', 'Buang semua logo sekolah yang telah dimuat naik?', resetLogos)}><FontAwesomeIcon icon={faSchool} /><div><strong>Reset Logo Sekolah</strong><span>Buang semua logo tanpa mengubah pasukan.</span></div></button>
      <button onClick={() => requestReset('Reset Pasukan & Semua Data', 'Kembalikan sekolah, pasukan, kumpulan dan keputusan kepada data asal?', () => setData(seedData()))}><FontAwesomeIcon icon={faUsers} /><div><strong>Reset Pasukan & Semua Data</strong><span>Kembalikan keseluruhan sistem kepada data asal.</span></div></button>
      <button className="danger" onClick={() => requestReset('Reset Penuh Sistem', 'Padam semua data simpanan browser dan mulakan semula sistem?', () => { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(LOGO_CLEANUP_KEY); localStorage.removeItem(ROSTER_VERSION_KEY); localStorage.setItem(KNOCKOUT_GATE_VERSION_KEY, 'done'); setData(seedData()); }, true)}><FontAwesomeIcon icon={faTrash} /><div><strong>Reset Penuh Sistem</strong><span>Padam data tersimpan dan mulakan semula.</span></div></button>
    </div> : <div className={`reset-confirm ${pending.danger ? 'danger' : ''}`}><div className="reset-confirm-icon"><FontAwesomeIcon icon={pending.danger ? faTrash : faBolt} /></div><h4>{pending.title}</h4><p>{pending.message}</p><div className="modal-actions"><button className="btn ghost" onClick={() => setPending(null)}>Batal</button><button className={`btn ${pending.danger ? 'danger-btn' : 'primary'}`} onClick={runReset}>Ya, Teruskan Reset</button></div></div>}
  </Modal>;
}

function Dashboard({ data, standings, teamById, groupById }) {
  const finished = data.matches.filter((m) => m.status === 'Tamat').length;
  const progress = Math.round((finished / data.matches.length) * 100);
  const activeCourts = ['A', 'B', 'C'].map((court) => {
    const live = data.matches.find((m) => m.court === court && m.status === 'Sedang Bermain');
    const next = data.matches.find((m) => m.court === court && m.status === 'Menunggu');
    return { court, live: live || next, next };
  }).filter(({ live }) => live && teamById[live.homeId] && teamById[live.awayId]);
  const leaders = data.groups.slice(0, 6).map((group) => {
    const teamIds = new Set(group.teamIds);
    return { group, team: standings.find((row) => teamIds.has(row.id)) };
  });

  return <div className="page-stack dashboard-page">
    <section className="hero">
      <div className="arena-lights" aria-hidden="true"><i /><i /><i /><i /></div>
      <div className="hero-logo-art" aria-hidden="true"><img src={mssdLogo} alt="" /></div>
      <div className="hero-copy">
        <div className="hero-kicker"><span>EDISI 2026</span><b>MSSD HULU LANGAT · LIVE TOURNAMENT SYSTEM</b></div>
        <div className="eyebrow"><FontAwesomeIcon icon={faTrophy} /> KEJOHANAN PERINGKAT DAERAH</div>
        <h1>KEJOHANAN SEPAK TAKRAW<br /><em>MSSD HULU LANGAT</em></h1>
        <p>BAWAH 12 TAHUN · MUSIM 2026</p>
        <div className="hero-meta">
          <span><FontAwesomeIcon icon={faClock} /> {data.settings.date}</span>
          <span><FontAwesomeIcon icon={faLocationDot} /> {data.settings.location}</span>
        </div>
        <div className="hero-mini-stats">
          <div><strong>{data.teams.length}</strong><span>REGU</span></div>
          <div><strong>{data.matches.filter((m) => m.status === 'Sedang Bermain').length}</strong><span>LIVE</span></div>
          <div><strong>{data.settings.courts}</strong><span>COURTS</span></div>
        </div>
      </div>
      <div className="player-graphic" aria-hidden="true">
        <span className="player-energy energy-one" />
        <span className="player-energy energy-two" />
        <img src={takrawPlayer} alt="" />
      </div>
      <div className="hero-visual" aria-hidden="true">
        <div className="stadium-ring ring-one" />
        <div className="stadium-ring ring-two" />
        <div className="takraw-ball"><i /><i /><i /><i /><i /><i /></div>
        <div className="hero-badge"><FontAwesomeIcon icon={faTrophy} /><span>CHAMPIONSHIP<br /><b>HULU LANGAT</b></span></div>
      </div>
    </section>

    <div className="live-ticker">
      <span className="ticker-label"><i /> LIVE UPDATE</span>
      <div className="ticker-track"><div>
        <b>GELANGGANG A</b> SK Jalan Semenyih 1 A <strong>16 : 15</strong> SK Jalan Semenyih 2 A
        <em>•</em><b>GELANGGANG B</b> SK Semenyih A <strong>14 : 13</strong> SK Bangi A
        <em>•</em><b>GELANGGANG C</b> SK Bandar Teknologi Kajang A <strong>15 : 14</strong> SK Bangi A
      </div></div>
    </div>

    <div className="summary-grid">
      {[
        [faSchool, data.schools.length, 'Jumlah Sekolah', 'cyan'],
        [faUsers, data.groups.length, 'Jumlah Kumpulan', 'purple'],
        [faTrophy, data.matches.length, 'Jumlah Perlawanan', 'gold'],
        [faCheck, finished, 'Selesai', 'green'],
        [faClock, data.matches.length - finished, 'Belum Selesai', 'pink'],
      ].map(([icon, value, label, tone]) => <div className={`summary-card ${tone}`} key={label}>
        <span className="summary-icon"><FontAwesomeIcon icon={icon} /></span>
        <div><strong>{value}</strong><span>{label}</span></div>
      </div>)}
      <div className="summary-card progress-card">
        <div className="progress-ring" style={{ '--progress': `${progress * 3.6}deg` }}><strong>{progress}%</strong></div>
        <div><strong>Kemajuan</strong><span>{finished} daripada {data.matches.length} tamat</span></div>
      </div>
    </div>

    <section>
      <SectionHead eyebrow="PUSAT KAWALAN PERLAWANAN" title="Gelanggang Aktif" action={<div className="live-now"><i /> LIVE SEKARANG</div>} />
      <div className="court-grid">
        {activeCourts.map(({ court, live, next }) => {
          const home = teamById[live.homeId]; const away = teamById[live.awayId];
          return <article className={`court-card court-${court.toLowerCase()} ${live.status === 'Sedang Bermain' ? 'is-live' : ''}`} key={court}>
            <span className="court-watermark">{court}</span>
            <div className="court-top"><span><FontAwesomeIcon icon={faFutbol} /> GELANGGANG {court}</span><Status value={live.status} /></div>
            <div className="scoreboard">
              <div className="score-team"><TeamLogo team={home} size="lg" /><strong>{home.name}</strong><small>HOME</small></div>
              <div className="big-score"><span>{live.homeScore || 0}</span><b>:</b><span>{live.awayScore || 0}</span><small>{groupById[live.groupId]?.name || 'Kumpulan'} · Pusingan {live.round}</small></div>
              <div className="score-team"><TeamLogo team={away} size="lg" /><strong>{away.name}</strong><small>AWAY</small></div>
            </div>
            <div className="next-match"><span><FontAwesomeIcon icon={faChevronRight} /> PERLAWANAN SETERUSNYA</span>{next
              && teamById[next.homeId] && teamById[next.awayId] ? <div className="next-match-teams"><TeamLogo team={teamById[next.homeId]} size="xs" /><strong>{teamById[next.homeId].name}</strong><b>VS</b><strong>{teamById[next.awayId].name}</strong><TeamLogo team={teamById[next.awayId]} size="xs" /></div>
              : <strong>Jadual selesai</strong>}</div>
          </article>;
        })}
      </div>
    </section>

    <div className="dashboard-columns schedule-only">
      <section className="panel schedule-panel">
        <SectionHead eyebrow="JADUAL LANGSUNG" title="Jadual Hari Ini" action={<button className="text-btn">Lihat Semua <FontAwesomeIcon icon={faChevronRight} /></button>} />
        <div className="table-scroll"><table className="compact-schedule"><thead><tr><th>Gelanggang</th><th>Perlawanan</th><th>Status</th></tr></thead>
          <tbody>{data.matches.filter((m) => teamById[m.homeId] && teamById[m.awayId]).slice(0, 7).map((m) => <tr key={m.id}><td><span className="court-tag">{m.court}</span></td><td><div className="match-cell"><TeamLogo team={teamById[m.homeId]} size="xs" /> {teamById[m.homeId].name}<b>VS</b>{teamById[m.awayId].name} <TeamLogo team={teamById[m.awayId]} size="xs" /></div></td><td><Status value={m.status} /></td></tr>)}</tbody>
        </table></div>
      </section>
    </div>
    <div className="dashboard-columns lower">
      <section className="panel"><SectionHead eyebrow="KEDUDUKAN SEMASA" title="Pendahulu Kumpulan" /><div className="leader-grid">{leaders.filter(({ team }) => team).map(({ group, team }) => <div className="leader-card" key={group.id}><TeamLogo team={team} /><div><span>{group.name}</span><strong>{team.name}</strong></div><b>{team.p} PTS</b></div>)}</div></section>
      <section className="panel"><SectionHead eyebrow="LOG SISTEM" title="Aktiviti Terkini" /><div className="timeline">{data.activities.map((a) => <div key={a.id}><i /><span>{a.time}</span><strong>{a.text}</strong></div>)}</div></section>
    </div>
  </div>;
}

function Schools({ data, setData }) {
  const [editing, setEditing] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [copied, setCopied] = useState(null);
  const [query, setQuery] = useState('');
  const filtered = data.schools.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()));
  const saveSchool = (form) => {
    const exists = data.schools.some((s) => s.id !== form.id && s.name.toLowerCase() === form.name.toLowerCase());
    if (exists) return alert('Nama sekolah ini telah wujud.');
    setData((prev) => ({
      ...prev,
      schools: form.id ? prev.schools.map((s) => s.id === form.id ? form : s) : [...prev.schools, { ...form, id: `school-${Date.now()}`, color: '#18d5ff' }],
      teams: form.id ? prev.teams.map((team) => team.schoolId === form.id ? { ...team, logo: form.logo, color: form.color || team.color } : team) : prev.teams,
    }));
    setEditing(null);
  };
  const addRegu = (school) => {
    const siblings = data.teams.filter((t) => t.schoolId === school.id);
    const suffix = String.fromCharCode(65 + siblings.length);
    const team = { id: `team-${Date.now()}`, schoolId: school.id, name: `${school.name} ${suffix}`, suffix, logo: school.logo, color: school.color };
    setData((prev) => ({ ...prev, teams: [...prev.teams, team] }));
  };
  const pasteRegu = (school) => {
    if (!copied) return;
    const siblings = data.teams.filter((t) => t.schoolId === school.id);
    const suffix = String.fromCharCode(65 + siblings.length);
    setData((prev) => ({ ...prev, teams: [...prev.teams, { ...copied, id: `team-${Date.now()}`, schoolId: school.id, name: `${school.name} ${suffix}`, suffix, logo: school.logo, color: school.color }] }));
  };
  return <div className="page-stack">
    <SectionHead eyebrow="PANGKALAN DATA" title="Sekolah & Regu" action={<div className="school-head-actions"><button className="btn ghost" onClick={() => setBulkOpen(true)}><FontAwesomeIcon icon={faClipboard} /> Daftar Sekolah Pukal</button><button className="btn primary" onClick={() => setEditing({ name: '', logo: '' })}><FontAwesomeIcon icon={faPlus} /> Tambah Sekolah</button></div>} />
    <div className="toolbar"><label className="search"><FontAwesomeIcon icon={faSearch} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari sekolah..." /></label><span>{filtered.length} sekolah · {data.teams.length} regu</span></div>
    <div className="school-grid">{filtered.map((school) => {
      const teams = data.teams.filter((t) => t.schoolId === school.id);
      return <article className="school-card" key={school.id}><div className="school-card-head"><TeamLogo team={school} size="lg" /><div><h3>{school.name}</h3><span>{teams.length} regu berdaftar</span></div><div className="row-actions"><button onClick={() => setEditing(school)}><FontAwesomeIcon icon={faEdit} /></button><button onClick={() => setData((p) => ({ ...p, schools: p.schools.filter((s) => s.id !== school.id), teams: p.teams.filter((t) => t.schoolId !== school.id) }))}><FontAwesomeIcon icon={faTrash} /></button></div></div>
        <div className="regu-list">{teams.map((team) => <div key={team.id}><span className="suffix">{team.suffix}</span><strong>{team.name}</strong><button title="Copy Team" onClick={() => setCopied(team)}><FontAwesomeIcon icon={faCopy} /></button></div>)}</div>
        <div className="school-actions"><button className="btn small" onClick={() => addRegu(school)}><FontAwesomeIcon icon={faPlus} /> Tambah Regu</button><button className="btn small ghost" disabled={!copied} onClick={() => pasteRegu(school)}><FontAwesomeIcon icon={faClipboard} /> Paste Team</button></div>
      </article>;
    })}</div>
    {editing && <SchoolModal school={editing} onSave={saveSchool} onClose={() => setEditing(null)} />}
    {bulkOpen && <BulkSchoolModal data={data} setData={setData} onClose={() => setBulkOpen(false)} />}
  </div>;
}

function BulkSchoolModal({ data, setData, onClose }) {
  const [text, setText] = useState('');
  const parsed = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [rawName, rawCount] = line.split('|');
    return { name: rawName.trim(), count: Math.min(10, Math.max(1, Number.parseInt(rawCount, 10) || 1)) };
  }).filter(({ name }) => name);
  const existingNames = new Set(data.schools.map((school) => school.name.toLowerCase()));
  const unique = parsed.filter(({ name }, index) => !existingNames.has(name.toLowerCase())
    && parsed.findIndex((item) => item.name.toLowerCase() === name.toLowerCase()) === index);
  const totalTeams = unique.reduce((sum, school) => sum + school.count, 0);
  const save = () => {
    if (!unique.length) return alert('Tiada sekolah baharu untuk didaftarkan.');
    const stamp = Date.now();
    setData((previous) => {
      const schools = unique.map((item, index) => ({ id: `school-bulk-${stamp}-${index}`, name: item.name, color: ['#18d5ff', '#8b5cf6', '#f8c94c', '#19e68c', '#ff5f86', '#6f8dff'][index % 6], logo: '' }));
      const teams = schools.flatMap((school, schoolIndex) => Array.from({ length: unique[schoolIndex].count }, (_, teamIndex) => ({
        id: `team-bulk-${stamp}-${schoolIndex}-${teamIndex}`, schoolId: school.id, name: `${school.name} ${String.fromCharCode(65 + teamIndex)}`,
        suffix: String.fromCharCode(65 + teamIndex), logo: '', color: school.color,
      })));
      return { ...previous, schools: [...previous.schools, ...schools], teams: [...previous.teams, ...teams] };
    });
    onClose();
  };
  return <Modal title="Daftar Sekolah Secara Pukal" onClose={onClose}><div className="bulk-school-form">
    <div className="bulk-guide"><FontAwesomeIcon icon={faClipboard} /><div><strong>Satu sekolah setiap baris</strong><span>Tambah `| bilangan regu` jika mahu lebih daripada satu regu.</span></div></div>
    <textarea autoFocus value={text} onChange={(event) => setText(event.target.value)} placeholder={'SK Contoh Maju | 3\nSK Contoh Jaya | 2\nSK Contoh Indah'} />
    <div className="bulk-preview"><span>{unique.length} sekolah baharu</span><span>{totalTeams} regu akan dicipta</span><span>{parsed.length - unique.length} pendua diabaikan</span></div>
    <div className="modal-actions"><button className="btn ghost" onClick={onClose}>Batal</button><button className="btn primary" disabled={!unique.length} onClick={save}><FontAwesomeIcon icon={faPlus} /> Daftar Semua</button></div>
  </div></Modal>;
}

function SchoolModal({ school, onSave, onClose }) {
  const [form, setForm] = useState(school);
  const [processing, setProcessing] = useState(false);
  const upload = (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return alert('Saiz logo maksimum ialah 5MB.');
    setProcessing(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const cleanedLogo = await removeEdgeWhiteBackground(reader.result);
      setForm((f) => ({ ...f, logo: cleanedLogo }));
      setProcessing(false);
    };
    reader.onerror = () => setProcessing(false);
    reader.readAsDataURL(file);
  };
  return <Modal title={school.id ? 'Edit Sekolah' : 'Tambah Sekolah'} onClose={onClose}><form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="form-stack">
    <label>Nama Sekolah<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Contoh: SK Bandar Seri Putra" /></label>
    <label className="upload-box"><FontAwesomeIcon icon={faUpload} /><strong>Upload Logo Sekolah</strong><span>PNG, JPG, JPEG atau WEBP · Maksimum 5MB</span><input type="file" accept=".png,.jpg,.jpeg,.webp" onChange={(e) => upload(e.target.files[0])} /></label>
    <div className="modal-actions"><button type="button" className="btn ghost" onClick={onClose}>Batal</button><button className="btn primary" disabled={processing}>{processing ? 'Memproses...' : 'Simpan Sekolah'}</button></div>
  </form></Modal>;
}

function generateGroupMatches(groups) {
  return groups.flatMap((group, groupIndex) => {
    if (group.teamIds.length < 2) return [];
    const pairs = group.teamIds.length === 3
      ? [[group.teamIds[0], group.teamIds[1]], [group.teamIds[1], group.teamIds[2]], [group.teamIds[0], group.teamIds[2]]]
      : [[group.teamIds[0], group.teamIds[1]]];
    return pairs.map(([homeId, awayId], roundIndex) => {
      const seq = groupIndex * 3 + roundIndex;
      return {
        id: `match-${groupIndex + 1}-${roundIndex + 1}-${Date.now()}`,
        groupId: group.id, round: roundIndex + 1, homeId, awayId,
        court: ['A', 'B', 'C'][seq % 3],
        time: `${String(8 + Math.floor(seq / 9)).padStart(2, '0')}:${String((seq % 3) * 20).padStart(2, '0')}`,
        status: 'Menunggu', homeScore: '', awayScore: '',
      };
    });
  });
}

function Groups({ data, setData, teamById }) {
  const [editing, setEditing] = useState(null);
  const addGroup = () => setData((p) => ({ ...p, groups: [...p.groups, { id: `group-${Date.now()}`, name: `Kumpulan ${p.groups.length + 1}`, teamIds: [] }] }));
  const autoArrange = () => setData((previous) => {
    const shuffled = [...previous.teams];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    const groups = Array.from({ length: Math.ceil(shuffled.length / 3) }, (_, index) => ({
      id: previous.groups[index]?.id || `group-${index + 1}`,
      name: previous.groups[index]?.name || `Kumpulan ${index + 1}`,
      teamIds: shuffled.slice(index * 3, index * 3 + 3).map((team) => team.id),
    }));
    return { ...previous, groups, matches: generateGroupMatches(groups) };
  });
  const saveGroup = () => {
    setData((previous) => {
      const current = previous.groups.find((group) => group.id === editing.id);
      const groups = previous.groups.map((group) => ({ ...group, teamIds: [...group.teamIds] }));
      const incoming = editing.teamIds.filter((id) => !current.teamIds.includes(id));
      const displaced = current.teamIds.filter((id) => !editing.teamIds.includes(id));
      incoming.forEach((newTeamId, index) => {
        const source = groups.find((group) => group.id !== editing.id && group.teamIds.includes(newTeamId));
        if (source && displaced[index]) source.teamIds[source.teamIds.indexOf(newTeamId)] = displaced[index];
      });
      const target = groups.find((group) => group.id === editing.id);
      target.name = editing.name;
      target.teamIds = [...editing.teamIds];
      return { ...previous, groups, matches: generateGroupMatches(groups) };
    });
    setEditing(null);
  };
  return <div className="page-stack groups-page">
    <div className="groups-page-head"><div><span><FontAwesomeIcon icon={faLayerGroup} /> STRUKTUR KEJOHANAN</span><h1>Pengurusan Kumpulan</h1><p>Susun tiga pasukan bagi setiap kumpulan kejohanan.</p></div><div className="groups-head-actions"><button className="btn ghost" onClick={autoArrange}><FontAwesomeIcon icon={faBolt} /> Auto Susun Team</button><button className="btn primary" onClick={addGroup}><FontAwesomeIcon icon={faPlus} /> Tambah Kumpulan</button></div></div>
    <div className="info-strip"><FontAwesomeIcon icon={faBolt} /><strong>Format Round Robin</strong><span>Setiap kumpulan mengandungi tepat 3 pasukan dan menjana 3 perlawanan.</span></div>
    <div className="group-grid">{data.groups.map((group, index) => <article className="group-card" key={group.id}><div className="group-head"><div><span>KUMPULAN</span><strong>{String(index + 1).padStart(2, '0')}</strong></div><h3>{group.name}</h3><div className="row-actions"><button title="Tukar team" onClick={() => setEditing({ ...group, teamIds: [...group.teamIds] })}><FontAwesomeIcon icon={faEdit} /></button><button onClick={() => setData((p) => ({ ...p, groups: p.groups.filter((g) => g.id !== group.id), matches: p.matches.filter((m) => m.groupId !== group.id) }))}><FontAwesomeIcon icon={faTrash} /></button></div></div>
      <div className="group-teams">{group.teamIds.map((id, i) => <div key={id}><span>{i + 1}</span><TeamLogo team={teamById[id]} /><strong>{teamById[id]?.name}</strong></div>)}</div><div className="group-foot"><span>{group.teamIds.length}/3 pasukan</span><div className="capacity"><i style={{ width: `${group.teamIds.length / 3 * 100}%` }} /></div></div>
    </article>)}</div>
    {editing && <Modal title="Tukar Team Dalam Kumpulan" onClose={() => setEditing(null)}><form className="form-stack group-editor-form" onSubmit={(e) => { e.preventDefault(); saveGroup(); }}>
      <label>Nama Kumpulan<input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
      {[0, 1, 2].map((slot) => <label key={slot}>Pasukan {slot + 1}<select value={editing.teamIds[slot] || ''} onChange={(e) => setEditing((group) => { const teamIds = [...group.teamIds]; teamIds[slot] = e.target.value; return { ...group, teamIds }; })}><option value="">Pilih pasukan</option>{data.teams.map((team) => <option key={team.id} value={team.id} disabled={editing.teamIds.some((id, index) => index !== slot && id === team.id)}>{team.name}</option>)}</select></label>)}
      <div className="modal-actions"><button type="button" className="btn ghost" onClick={() => setEditing(null)}>Batal</button><button className="btn primary" disabled={editing.teamIds.length !== 3 || new Set(editing.teamIds).size !== 3}>Simpan & Jana Jadual</button></div>
    </form></Modal>}
  </div>;
}

function KnockoutSchedule({ type, standings, data, setData }) {
  const generated = Boolean(data.settings?.knockoutGenerated);
  const qualifiers = generated ? knockoutQualifiers(data, standings) : {};
  let openingNumber = 0;
  const openingRows = KNOCKOUT_OPENING.map(([homeCode, awayCode]) => ({
    code: awayCode ? `P${++openingNumber}` : `BYE-${homeCode}`,
    home: qualifiers[homeCode],
    away: awayCode ? qualifiers[awayCode] : null,
    homeLabel: qualifierSlotLabel(homeCode),
    awayLabel: awayCode ? qualifierSlotLabel(awayCode) : 'BYE ke Pusingan 16',
    bye: !awayCode,
  }));
  const placeholderRows = (count, code, previous) => Array.from({ length: count }, (_, index) => ({
    code: `${code}-${index + 1}`,
    homeLabel: `Pemenang ${previous}-${index * 2 + 1}`,
    awayLabel: `Pemenang ${previous}-${index * 2 + 2}`,
  }));
  const stages = type === 'quarter'
    ? [
      { title: 'Pusingan 16', code: 'P16', rows: P16_PATHS.map(([homeLabel, awayLabel], index) => ({ code: `P16-${index + 1}`, homeLabel, awayLabel })) },
      { title: 'Suku Akhir', code: 'SUKU', rows: placeholderRows(4, 'SUKU', 'P16') },
      { title: 'Separuh Akhir', code: 'SEPARUH', rows: placeholderRows(2, 'SEPARUH', 'SUKU') },
      { title: 'Final', code: 'FINAL', rows: placeholderRows(1, 'FINAL', 'SEPARUH') },
    ]
    : [
      { title: 'Pusingan Awal', code: 'P1-P26', rows: openingRows },
    ];
  const saved = Object.fromEntries((data.knockoutMatches || []).map((match) => [match.code, match]));
  const update = (code, field, value) => setData((previous) => {
    const existing = previous.knockoutMatches || [];
    const match = existing.find((item) => item.code === code);
    const knockoutMatches = match
      ? existing.map((item) => item.code === code ? { ...item, [field]: value } : item)
      : [...existing, { code, homeScore: '', awayScore: '', court: 'A', status: 'Menunggu', [field]: value }];
    return { ...previous, knockoutMatches };
  });
  const save = (code) => setData((previous) => ({
    ...previous,
    activities: [{ id: Date.now(), time: new Date().toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' }), text: `Keputusan ${code} disimpan`, type: 'result' }, ...previous.activities].slice(0, 8),
  }));
  return <div className="event-stage-sections">{stages.map((stage) => <section className="event-stage-section" key={stage.code}>
    <div className="event-stage-head"><div><span>PERINGKAT</span><strong>{stage.code}</strong></div><div><h2>{stage.title}</h2><p>{stage.rows.length} perlawanan</p></div></div>
    <div className="event-stage-list">{stage.rows.map((row, index) => {
      const result = saved[row.code] || { homeScore: '', awayScore: '', court: 'A', status: 'Menunggu' };
      const isBye = row.bye;
      return <article className={`event-stage-row ${isBye ? 'is-bye' : ''}`} key={row.code}>
      <div className="event-match-number"><span>PERLAWANAN</span><strong>{String(index + 1).padStart(2, '0')}</strong></div>
      <div className="event-team"><KnockoutTeam team={row.home} seed={row.homeSeed} label={row.homeLabel} /></div>
      <div className="event-score">{isBye ? <div className="event-versus"><b>VS</b><span>{row.code}</span></div> : <><input type="number" min="0" value={result.homeScore} onChange={(e) => update(row.code, 'homeScore', e.target.value)} /><b>:</b><input type="number" min="0" value={result.awayScore} onChange={(e) => update(row.code, 'awayScore', e.target.value)} /></>}</div>
      <div className="event-team away"><KnockoutTeam team={row.away} seed={row.awaySeed} label={row.awayLabel} /></div>
      {isBye ? <span className="event-status bye">BYE</span> : <div className="event-controls"><select value={result.court} onChange={(e) => update(row.code, 'court', e.target.value)}><option value="A">Gelanggang A</option><option value="B">Gelanggang B</option><option value="C">Gelanggang C</option></select><select value={result.status} onChange={(e) => update(row.code, 'status', e.target.value)}><option>Menunggu</option><option>Sedang Bermain</option><option>Tamat</option></select><button className="btn primary small" onClick={() => save(row.code)}><FontAwesomeIcon icon={faDownload} /> Simpan</button></div>}
    </article>;
    })}</div>
  </section>)}</div>;
}

function Matches({ data, setData, teamById, groupById, standings }) {
  const [filters, setFilters] = useState({ group: '', round: '', court: '', status: '' });
  const [eventTab, setEventTab] = useState('day1');
  const randomResult = () => {
    const loserScore = Math.floor(Math.random() * 20) + 10;
    return Math.random() > .5 ? { homeScore: 30, awayScore: loserScore } : { homeScore: loserScore, awayScore: 30 };
  };
  const simulateGroups = () => setData((previous) => ({
    ...previous,
    matches: previous.matches.map((match) => ({ ...match, ...randomResult(), status: 'Tamat' })),
    knockoutMatches: [],
    settings: { ...previous.settings, knockoutGenerated: false },
    activities: [{ id: Date.now(), time: new Date().toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' }), text: 'Admin menjana keputusan rawak semua peringkat kumpulan', type: 'result' }, ...previous.activities].slice(0, 8),
  }));
  const simulateKnockout = (codes, message) => setData((previous) => {
    const existing = Object.fromEntries((previous.knockoutMatches || []).map((match) => [match.code, match]));
    codes.forEach((code) => { existing[code] = { ...existing[code], code, ...randomResult(), court: existing[code]?.court || ['A', 'B', 'C'][Math.floor(Math.random() * 3)], status: 'Tamat' }; });
    return {
      ...previous,
      knockoutMatches: Object.values(existing),
      activities: [{ id: Date.now(), time: new Date().toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' }), text: message, type: 'result' }, ...previous.activities].slice(0, 8),
    };
  });
  const groupsComplete = data.matches.length > 0 && data.matches.every((match) => match.status === 'Tamat');
  const knockoutGenerated = Boolean(data.settings?.knockoutGenerated);
  const generateKnockout = () => setData((previous) => ({
    ...previous,
    knockoutMatches: [],
    settings: { ...previous.settings, knockoutGenerated: true },
    activities: [{ id: Date.now(), time: new Date().toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' }), text: 'Admin menjana susunan perlawanan kalah mati', type: 'schedule' }, ...previous.activities].slice(0, 8),
  }));
  const day3Codes = Array.from({ length: 26 }, (_, index) => `P${index + 1}`);
  const day3Complete = day3Codes.every((code) => (data.knockoutMatches || []).find((match) => match.code === code)?.status === 'Tamat');
  const day4Codes = [...Array.from({ length: 8 }, (_, index) => `P16-${index + 1}`), ...Array.from({ length: 4 }, (_, index) => `SUKU-${index + 1}`), ...Array.from({ length: 2 }, (_, index) => `SEPARUH-${index + 1}`), 'FINAL-1'];
  const update = (id, field, value) => setData((p) => ({ ...p, matches: p.matches.map((m) => m.id === id ? { ...m, [field]: value } : m) }));
  const save = (match) => {
    update(match.id, 'status', match.homeScore !== '' && match.awayScore !== '' ? 'Tamat' : match.status);
    setData((p) => ({ ...p, activities: [{ id: Date.now(), time: new Date().toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' }), text: `Keputusan ${groupById[match.groupId].name} disimpan`, type: 'result' }, ...p.activities].slice(0, 8) }));
  };
  const groupNumber = (match) => data.groups.findIndex((group) => group.id === match.groupId) + 1;
  const dayMatches = data.matches.filter((match) => eventTab === 'day1' ? groupNumber(match) <= 14 : groupNumber(match) >= 15);
  const shown = dayMatches.filter((m) => (!filters.group || m.groupId === filters.group) && (!filters.round || String(m.round) === filters.round) && (!filters.court || m.court === filters.court) && (!filters.status || m.status === filters.status));
  const displayedCount = eventTab === 'knockout' ? 26 : eventTab === 'quarter' ? 15 : shown.length;
  return <div className="page-stack matches-page">
    <div className="matches-page-head">
      <div><span><FontAwesomeIcon icon={faFlagCheckered} /> ROUND ROBIN AUTOMATIK</span><h1>Perlawanan & Keputusan</h1><p>Urus gelanggang, status perlawanan dan keputusan dalam satu paparan.</p></div>
      <div className="matches-head-stat"><strong>{displayedCount}</strong><span>PERLAWANAN<br />DIPAPARKAN</span></div>
    </div>
    <div className="event-tabs">
      {[['day1', 'HARI PERTAMA', 'Kumpulan 1 - 14'], ['day2', 'HARI KEDUA', 'Kumpulan 15 - 29'], ['knockout', 'HARI KETIGA', 'Perlawanan P1 hingga P26'], ['quarter', 'HARI KEEMPAT', 'P16 hingga final']].map(([id, label, note]) => <button className={eventTab === id ? 'active' : ''} key={id} onClick={() => setEventTab(id)}><strong>{label}</strong><span>{note}</span></button>)}
    </div>
    <section className="admin-simulator">
      <div className="admin-simulator-copy"><FontAwesomeIcon icon={faBolt} /><div><span>ALAT UJIAN ADMIN</span><strong>Simulasi Keputusan Rawak</strong><small>Skor maksimum 30 mata. Jana keputusan mengikut urutan peringkat.</small></div></div>
      <div className="admin-simulator-actions">
        <button className="btn primary" onClick={() => confirm('Jana keputusan rawak untuk semua perlawanan kumpulan?') && simulateGroups()}><FontAwesomeIcon icon={faLayerGroup} /> Auto Kumpulan</button>
        <button className="btn generate-knockout" disabled={!groupsComplete || knockoutGenerated} onClick={generateKnockout}><FontAwesomeIcon icon={faFlagCheckered} /> {knockoutGenerated ? 'Kalah Mati Telah Dijana' : 'Jana Perlawanan Kalah Mati'}</button>
        <button className="btn primary" disabled={!knockoutGenerated} onClick={() => confirm('Jana keputusan rawak P1 hingga P26?') && simulateKnockout(day3Codes, 'Admin menjana keputusan rawak P1 hingga P26')}><FontAwesomeIcon icon={faFlagCheckered} /> Auto Hari Ketiga</button>
        <button className="btn primary" disabled={!knockoutGenerated || !day3Complete} onClick={() => confirm('Jana keputusan rawak Pusingan 16 hingga Final?') && simulateKnockout(day4Codes, 'Admin menjana keputusan rawak Hari Keempat')}><FontAwesomeIcon icon={faTrophy} /> Auto Hari Keempat</button>
      </div>
    </section>
    {(eventTab === 'day1' || eventTab === 'day2') && <div className="filter-bar"><FontAwesomeIcon icon={faFilter} /><strong className="filter-label">Tapis Jadual</strong>{[
      ['group', 'Semua Kumpulan', data.groups.map((g) => [g.id, g.name])],
      ['round', 'Semua Pusingan', [['1', 'Pusingan 1'], ['2', 'Pusingan 2'], ['3', 'Pusingan 3']]],
      ['court', 'Semua Gelanggang', [['A', 'Gelanggang A'], ['B', 'Gelanggang B'], ['C', 'Gelanggang C']]],
      ['status', 'Semua Status', [['Tamat', 'Tamat'], ['Sedang Bermain', 'Sedang Bermain'], ['Menunggu', 'Menunggu']]],
    ].map(([key, placeholder, opts]) => <select key={key} value={filters[key]} onChange={(e) => setFilters({ ...filters, [key]: e.target.value })}><option value="">{placeholder}</option>{opts.map(([v, l]) => <option value={v} key={v}>{l}</option>)}</select>)}</div>}
    {(eventTab === 'day1' || eventTab === 'day2') && <div className="round-list">{[1, 2, 3].map((round) => {
      const roundMatches = shown.filter((match) => Number(match.round) === round);
      if (!roundMatches.length) return null;
      return <section className="round-section" key={round}>
        <div className="round-section-head"><div><span>PUSINGAN</span><strong>{String(round).padStart(2, '0')}</strong></div><div><h2>Pusingan {round}</h2><p>{roundMatches.length} perlawanan dipaparkan</p></div></div>
        <div className="match-list">{roundMatches.map((match, matchIndex) => <article className="match-list-row" key={match.id}>
          <div className="match-list-meta"><span>PERLAWANAN</span><strong>{String(matchIndex + 1).padStart(2, '0')}</strong></div>
          <div className="match-list-team home"><TeamLogo team={teamById[match.homeId]} /><strong>{teamById[match.homeId].name}</strong></div>
          <div className="match-list-score"><input type="number" min="0" value={match.homeScore} onChange={(e) => update(match.id, 'homeScore', e.target.value)} /><b>:</b><input type="number" min="0" value={match.awayScore} onChange={(e) => update(match.id, 'awayScore', e.target.value)} /></div>
          <div className="match-list-team away"><strong>{teamById[match.awayId].name}</strong><TeamLogo team={teamById[match.awayId]} /></div>
          <select value={match.court} onChange={(e) => update(match.id, 'court', e.target.value)}><option value="A">Gelanggang A</option><option value="B">Gelanggang B</option><option value="C">Gelanggang C</option></select>
          <select value={match.status} onChange={(e) => update(match.id, 'status', e.target.value)}><option>Menunggu</option><option>Sedang Bermain</option><option>Tamat</option></select>
          <button className="btn primary small" onClick={() => save(match)}><FontAwesomeIcon icon={faDownload} /> Simpan</button>
        </article>)}</div>
      </section>;
    })}</div>}
    {eventTab === 'knockout' && <KnockoutSchedule type="knockout" {...{ standings, data, setData }} />}
    {eventTab === 'quarter' && <KnockoutSchedule type="quarter" {...{ standings, data, setData }} />}
  </div>;
}

function KnockoutTeam({ team, seed, label }) {
  return <div className="knockout-team">
    {team ? <TeamLogo team={team} size="xs" /> : <span className="knockout-placeholder">?</span>}
    <span className="knockout-team-name">{team?.name || label}</span>
    {seed && <b>{seed}</b>}
  </div>;
}

function KnockoutMatch({ code, home, away, homeSeed, awaySeed, homeLabel, awayLabel, winnerLabel, bye = false, span = 1 }) {
  return <article className={`knockout-match ${bye ? 'is-bye' : ''}`} style={{ '--round-span': span, gridRow: `span ${span}` }}>
    <div className="knockout-match-code"><span>{code}</span>{bye && <strong>BYE</strong>}</div>
    <KnockoutTeam team={home} seed={homeSeed} label={homeLabel || winnerLabel || 'Menanti Pemenang Pusingan Terdahulu'} />
    <KnockoutTeam team={away} seed={awaySeed} label={bye ? 'Lolos Terus ke Pusingan 32' : awayLabel || winnerLabel || 'Menanti Pemenang Pusingan Terdahulu'} />
  </article>;
}

function BracketConnectors({ side }) {
  const openingCenters = Array.from({ length: 16 }, (_, index) => 130 + (index * 112));
  const p16Centers = [298, 746, 1194, 1642];
  const sukuCenters = [522, 1418];
  const semiCenter = 970;
  const coords = side === 'right'
    ? { openingEdge: 1056, p16Edge: 1014, p16Other: 704, sukuEdge: 662, sukuOther: 352, semiEdge: 310, pairX: 1034, groupX: 994, sukuX: 682, semiX: 330 }
    : { openingEdge: 340, p16Edge: 382, p16Other: 692, sukuEdge: 734, sukuOther: 1044, semiEdge: 1086, pairX: 362, groupX: 402, sukuX: 714, semiX: 1066 };
  const h = (x1, y, x2) => `M ${x1} ${y} H ${x2}`;
  const bracketFromCenters = (sources, target, fromX, trunkX, toX) => [
    ...sources.map((y) => h(fromX, y, trunkX)),
    `M ${trunkX} ${Math.min(...sources)} V ${Math.max(...sources)}`,
    h(trunkX, target, toX),
  ].join(' ');
  const p16Path = (group) => {
    const ys = [0, 1, 2, 3].map((offset) => openingCenters[group * 4 + offset]);
    const pairA = (ys[0] + ys[1]) / 2;
    const pairB = (ys[2] + ys[3]) / 2;
    return [
      h(coords.openingEdge, ys[0], coords.pairX), h(coords.openingEdge, ys[1], coords.pairX),
      `M ${coords.pairX} ${ys[0]} V ${ys[1]}`, h(coords.pairX, pairA, coords.groupX),
      h(coords.openingEdge, ys[2], coords.pairX), h(coords.openingEdge, ys[3], coords.pairX),
      `M ${coords.pairX} ${ys[2]} V ${ys[3]}`, h(coords.pairX, pairB, coords.groupX),
      `M ${coords.groupX} ${pairA} V ${pairB}`, h(coords.groupX, p16Centers[group], coords.p16Edge),
    ].join(' ');
  };
  return <svg className={`bracket-svg-connectors ${side}`} viewBox="0 0 1396 1900" preserveAspectRatio="none" aria-hidden="true">
    {[0, 1, 2, 3].map((group) => <path key={`opening-${group}`} d={p16Path(group)} />)}
    {[0, 1].map((group) => <path key={`suku-${group}`} d={bracketFromCenters([p16Centers[group * 2], p16Centers[group * 2 + 1]], sukuCenters[group], coords.p16Other, coords.sukuX, coords.sukuEdge)} />)}
    <path d={bracketFromCenters(sukuCenters, semiCenter, coords.sukuOther, coords.semiX, coords.semiEdge)} />
  </svg>;
}

function BracketHalf({ side, opening, qualifiers, generated }) {
  const stages = [
    { title: 'Pusingan 16', short: 'P16', count: 4, span: 4 },
    { title: 'Suku Akhir', short: 'SUKU', count: 2, span: 8 },
    { title: 'Separuh Akhir', short: 'SEPARUH', count: 1, span: 16 },
  ];
  const columns = [
    <section className="bracket-column prelim-column" key="awal">
      <div className="bracket-round-title"><span>01</span><div><strong>Pusingan Awal</strong><small>P1 hingga P26 · bahagian {side === 'left' ? 'kiri' : 'kanan'}</small></div></div>
      <div className="bracket-round-matches">{opening.map(({ homeCode, awayCode, code }) =>
        <KnockoutMatch key={code} code={code} home={qualifiers[homeCode]} away={awayCode ? qualifiers[awayCode] : null}
          homeLabel={qualifierSlotLabel(homeCode)} awayLabel={awayCode ? qualifierSlotLabel(awayCode) : undefined} bye={!awayCode} />
      )}</div>
    </section>,
    ...stages.map((stage, stageIndex) => <section className={`bracket-column stage-${stageIndex}`} key={stage.short}>
      <div className="bracket-round-title"><span>{String(stageIndex + 2).padStart(2, '0')}</span><div><strong>{stage.title}</strong><small>{stage.count} perlawanan</small></div></div>
      <div className="bracket-round-matches">{Array.from({ length: stage.count }, (_, index) =>
        <KnockoutMatch key={index} span={stage.span} code={`${stage.short}-${side === 'left' ? index + 1 : index + stage.count + 1}`}
          homeLabel={stageIndex ? `Pemenang ${stages[stageIndex - 1].short}-${index * 2 + 1}` : P16_PATHS[side === 'left' ? index : index + 4][0]}
          awayLabel={stageIndex ? `Pemenang ${stages[stageIndex - 1].short}-${index * 2 + 2}` : P16_PATHS[side === 'left' ? index : index + 4][1]} />
      )}</div>
    </section>),
  ];
  return <div className={`bracket-half ${side}`}>
    <BracketConnectors side={side} />
    {side === 'right' ? [...columns].reverse() : columns}
  </div>;
}

const CLASSIC_BRACKET_TEXT = String.raw`
J1  ───────────── BYE ─────────────┐
                                   ├── P32-1 ┐
32  vs 33 ────────────────────────┘         │
                                             ├── P16-1 ┐
16  vs 49 ────────────────────────┐         │         │
                                   ├── P32-2 ┘         │
17  vs 48 ────────────────────────┘                   │
                                                       ├── SUKU 1 ┐
8   vs 57 ────────────────────────┐                   │          │
                                   ├── P32-3 ┐         │          │
25  vs 40 ────────────────────────┘         │         │          │
                                             ├── P16-2 ┘          │
9   vs 56 ────────────────────────┐         │                    │
                                   ├── P32-4 ┘                    │
24  vs 41 ────────────────────────┘                              │
                                                                  ├── SEPARUH 1 ┐
J4  ───────────── BYE ─────────────┐                              │            │
                                   ├── P32-5 ┐                    │            │
29  vs 36 ────────────────────────┘         │                    │            │
                                             ├── P16-3 ┐          │            │
13  vs 52 ────────────────────────┐         │         │          │            │
                                   ├── P32-6 ┘         │          │            │
20  vs 45 ────────────────────────┘                   │          │            │
                                                       ├── SUKU 2 ┘            │
J5  ───────────── BYE ─────────────┐                   │                       │
                                   ├── P32-7 ┐         │                       │
28  vs 37 ────────────────────────┘         │         │                       │
                                             ├── P16-4 ┘                       │
12  vs 53 ────────────────────────┐         │                                 │
                                   ├── P32-8 ┘                                 │
21  vs 44 ────────────────────────┘                                           │
                                                                               ├── FINAL ── JUARA
J2  ───────────── BYE ─────────────┐                                           │
                                   ├── P32-9 ┐                                 │
31  vs 34 ────────────────────────┘         │                                 │
                                             ├── P16-5 ┐                       │
15  vs 50 ────────────────────────┐         │         │                       │
                                   ├── P32-10┘         │                       │
18  vs 47 ────────────────────────┘                   │                       │
                                                       ├── SUKU 3 ┐            │
7   vs 58 ────────────────────────┐                   │          │            │
                                   ├── P32-11┐         │          │            │
26  vs 39 ────────────────────────┘         │         │          │            │
                                             ├── P16-6 ┘          │            │
10  vs 55 ────────────────────────┐         │                    │            │
                                   ├── P32-12┘                    │            │
23  vs 42 ────────────────────────┘                              │            │
                                                                  ├── SEPARUH 2 ┘
J3  ───────────── BYE ─────────────┐                              │
                                   ├── P32-13┐                    │
30  vs 35 ────────────────────────┘         │                    │
                                             ├── P16-7 ┐          │
14  vs 51 ────────────────────────┐         │         │          │
                                   ├── P32-14┘         │          │
19  vs 46 ────────────────────────┘                   │          │
                                                       ├── SUKU 4 ┘
J6  ───────────── BYE ─────────────┐                   │
                                   ├── P32-15┐         │
27  vs 38 ────────────────────────┘         │         │
                                             ├── P16-8 ┘
11  vs 54 ────────────────────────┐         │
                                   ├── P32-16┘
22  vs 43 ────────────────────────┘
`.trim();

function compactBracketName(name) {
  if (!name) return '';
  return name.replace(/^SK\s+/i, '').replace(/^SRI\s+/i, 'Sri ').replace(/^SERI\s+/i, 'Seri ').slice(0, 18);
}

function ModernBracket({ qualifiers, generated, data }) {
  const saved = Object.fromEntries((data.knockoutMatches || []).map((match) => [match.code, match]));
  const matchWinner = (code, home, away) => {
    if (!home || !away) return home || null;
    const result = saved[code];
    if (!result || result.status !== 'Tamat' || result.homeScore === '' || result.awayScore === '') return null;
    const homeScore = Number(result.homeScore);
    const awayScore = Number(result.awayScore);
    if (Number.isNaN(homeScore) || Number.isNaN(awayScore) || homeScore === awayScore) return null;
    return homeScore > awayScore ? home : away;
  };
  const rowHeight = 104;
  const top = 88;
  let openingMatchNumber = 0;
  const rows = KNOCKOUT_OPENING.map(([homeCode, awayCode], index) => {
    const code = awayCode ? `P${++openingMatchNumber}` : `BYE-${homeCode}`;
    const home = generated ? qualifiers[homeCode] : null;
    const away = generated && awayCode ? qualifiers[awayCode] : null;
    return {
      y: top + index * rowHeight,
      code,
      homeCode,
      awayCode,
      home,
      away,
      homeSeed: homeCode.replace(/[JN]/, ''),
      awaySeed: awayCode ? awayCode.replace(/[JN]/, '') : 'BYE',
    };
  });
  const openingNodes = rows.map((row) => ({
    y: row.y,
    label: row.awayCode ? row.code : 'BYE',
    bye: !row.awayCode,
    winner: row.awayCode ? matchWinner(row.code, row.home, row.away) : row.home,
  }));
  const mid = (items) => items.reduce((sum, item) => sum + item.y, 0) / items.length;
  const makeStage = (source, count, labelPrefix, codePrefix) => Array.from({ length: count }, (_, index) => {
    const home = source[index * 2]?.winner || null;
    const away = source[index * 2 + 1]?.winner || null;
    const code = `${codePrefix}-${index + 1}`;
    return { y: mid(source.slice(index * 2, index * 2 + 2)), label: `${labelPrefix}-${index + 1}`, code, winner: matchWinner(code, home, away) };
  });
  const p32 = makeStage(openingNodes, 16, 'P32', 'P32');
  const p16 = makeStage(p32, 8, 'P16', 'P16');
  const suku = makeStage(p16, 4, 'SUKU', 'SUKU').map((node, index) => ({ ...node, label: `SUKU ${index + 1}` }));
  const separuh = makeStage(suku, 2, 'SEPARUH', 'SEPARUH').map((node, index) => ({ ...node, label: `SEPARUH ${index + 1}` }));
  const finalY = (separuh[0].y + separuh[1].y) / 2;
  const height = top * 2 + (rows.length - 1) * rowHeight;
  const x = { row: 52, prelim: 405, p32: 545, p16: 725, suku: 905, separuh: 1090, final: 1270 };
  const slotName = (code) => (generated && qualifiers[code]?.name) || qualifierSlotLabel(code);
  const entryPath = (row) => {
    const y1 = row.y - 24;
    const y2 = row.y + 24;
    const elbow = x.prelim - 30;
    return [
      `M ${x.row + 300} ${y1} H ${elbow}`,
      `M ${x.row + 300} ${y2} H ${elbow}`,
      `M ${elbow} ${y1} V ${y2}`,
      `M ${elbow} ${row.y} H ${x.prelim}`,
    ].join(' ');
  };
  const bracketPath = (source, targetY, fromX, elbowX, toX) => [
    ...source.map((item) => `M ${fromX} ${item.y} H ${elbowX}`),
    `M ${elbowX} ${source[0].y} V ${source[source.length - 1].y}`,
    `M ${elbowX} ${targetY} H ${toX}`,
  ].join(' ');
  const nodeX = (label) => label.startsWith('P32') ? x.p32 : label.startsWith('P16') ? x.p16 : label.startsWith('SUKU') ? x.suku : x.separuh;
  const nodeW = (label) => label.startsWith('SEPARUH') ? 104 : label.startsWith('SUKU') ? 82 : 70;
  return <section className="classic-bracket-panel modern-bracket-panel">
    <div className="classic-bracket-head">
      <div><span>BRACKET RASMI</span><h2>Pusingan Kalah Singkir</h2><p>Visual moden, susunan ikut bracket yang diberi.</p></div>
      <strong>64</strong>
    </div>
    <div className="classic-bracket-scroll modern-bracket-scroll">
      <svg className="modern-bracket-svg" viewBox={`0 0 1400 ${height}`} role="img" aria-label="Bracket kalah singkir">
        <defs>
          <linearGradient id="bracketLine" x1="0" x2="1"><stop offset="0%" stopColor="#0aa4b5" /><stop offset="55%" stopColor="#34d7e8" /><stop offset="100%" stopColor="#d6ff3f" /></linearGradient>
          <filter id="bracketGlow" x="-35%" y="-35%" width="170%" height="170%"><feDropShadow dx="0" dy="0" stdDeviation="3.5" floodColor="#19cde0" floodOpacity=".45" /></filter>
        </defs>
        <rect className="bracket-bg" x="0" y="0" width="1400" height={height} rx="28" />
        {rows.map((row) => <path className="bracket-line seed-entry-line" key={`entry-${row.homeCode}-${row.awayCode || 'bye'}`} d={entryPath(row)} />)}
        {rows.map((row, index) => <g className="modern-seed-pair" key={index}>
          <g className="modern-seed">
            <rect x={x.row} y={row.y - 44} width="300" height="38" rx="15" />
            <circle cx={x.row + 18} cy={row.y - 20} r="11" />
            <text x={x.row + 18} y={row.y - 16} textAnchor="middle">1</text>
            <text className="seed-name" x={x.row + 42} y={row.y - 16}>{slotName(row.homeCode)}</text>
            <text className="seed-badge" x={x.row + 274} y={row.y - 16} textAnchor="middle">{row.homeSeed}</text>
          </g>
          <g className={`modern-seed ${row.awayCode ? '' : 'is-bye-slot'}`}>
            <rect x={x.row} y={row.y + 6} width="300" height="38" rx="15" />
            <circle cx={x.row + 18} cy={row.y + 20} r="11" />
            <text x={x.row + 18} y={row.y + 24} textAnchor="middle">2</text>
            <text className="seed-name" x={x.row + 42} y={row.y + 24}>{row.awayCode ? slotName(row.awayCode) : 'BYE - Lolos Terus'}</text>
            <text className="seed-badge" x={x.row + 274} y={row.y + 24} textAnchor="middle">{row.awaySeed}</text>
          </g>
        </g>)}
        {openingNodes.map((node) => <g className={`modern-node modern-opening-node ${node.bye ? 'is-bye-node' : ''} ${node.winner ? 'has-winner' : ''}`} key={`opening-node-${node.label}-${node.y}`}>
          <rect x={x.prelim} y={node.y - 24} width="92" height="48" rx="14" />
          <text className="node-code" x={x.prelim + 46} y={node.y - 5} textAnchor="middle">{node.label}</text>
          <text className="node-winner" x={x.prelim + 46} y={node.y + 12} textAnchor="middle">{node.winner ? compactBracketName(node.winner.name) : 'Menunggu'}</text>
        </g>)}
        {p32.map((node, index) => <path className="bracket-line" key={`p32-line-${node.label}`} d={bracketPath(openingNodes.slice(index * 2, index * 2 + 2), node.y, x.prelim + 92, x.p32 - 30, x.p32)} />)}
        {p16.map((node, index) => <path className="bracket-line" key={`p16-line-${node.label}`} d={bracketPath(p32.slice(index * 2, index * 2 + 2), node.y, x.p32 + 70, x.p16 - 30, x.p16)} />)}
        {suku.map((node, index) => <path className="bracket-line" key={`suku-line-${node.label}`} d={bracketPath(p16.slice(index * 2, index * 2 + 2), node.y, x.p16 + 72, x.suku - 30, x.suku)} />)}
        {separuh.map((node, index) => <path className="bracket-line" key={`separuh-line-${node.label}`} d={bracketPath(suku.slice(index * 2, index * 2 + 2), node.y, x.suku + 84, x.separuh - 30, x.separuh)} />)}
        <path className="bracket-line final-line" d={bracketPath(separuh, finalY, x.separuh + 104, x.final - 34, x.final)} />
        {[p32, p16, suku, separuh].flat().map((node) => <g className={`modern-node ${node.winner ? 'has-winner' : ''}`} key={node.label}>
          <rect x={nodeX(node.label)} y={node.y - 21} width={nodeW(node.label)} height="42" rx="13" />
          <text className="node-code" x={nodeX(node.label) + nodeW(node.label) / 2} y={node.y - 2} textAnchor="middle">{node.label}</text>
          <text className="node-winner" x={nodeX(node.label) + nodeW(node.label) / 2} y={node.y + 13} textAnchor="middle">{node.winner ? compactBracketName(node.winner.name) : ''}</text>
        </g>)}
        <g className="modern-final">
          <rect x={x.final} y={finalY - 35} width="86" height="70" rx="18" />
          <text x={x.final + 43} y={finalY - 4} textAnchor="middle">FINAL</text>
          <text x={x.final + 43} y={finalY + 18} textAnchor="middle">JUARA</text>
        </g>
      </svg>
    </div>
  </section>;
}

function Knockout({ standings, data }) {
  const [mobileSide, setMobileSide] = useState('left');
  const generated = Boolean(data.settings?.knockoutGenerated);
  const qualifiers = generated ? knockoutQualifiers(data, standings) : {};
  let openingNumber = 0;
  const opening = KNOCKOUT_OPENING.map(([homeCode, awayCode]) => ({ homeCode, awayCode, code: awayCode ? `P${++openingNumber}` : `${homeCode} · BYE` }));
  return <div className="page-stack knockout-page">
    <div className="knockout-page-head">
      <div><span><FontAwesomeIcon icon={faFlagCheckered} /> FORMAT KALAH SINGKIR</span><h1>Bracket Kejohanan</h1><p>58 pasukan terbaik mara ke pusingan kalah singkir. Seed 1 hingga 6 menerima BYE.</p></div>
      <div className="knockout-head-stats"><div><strong>58</strong><span>PASUKAN</span></div><div><strong>6</strong><span>BYE</span></div><div><strong>1</strong><span>JUARA</span></div></div>
    </div>
    <div className={`knockout-note ${generated ? '' : 'waiting-generation'}`}><FontAwesomeIcon icon={faBolt} /><strong>{generated ? 'Pusingan 64 / Awal' : 'Slot Kalah Mati Belum Diisi'}</strong><span>{generated ? 'Susunan seed dijana daripada kedudukan keseluruhan semasa.' : 'Nama pasukan akan dipaparkan selepas semua perlawanan kumpulan selesai dan admin menekan Jana Perlawanan Kalah Mati.'}</span></div>
    <ModernBracket qualifiers={qualifiers} generated={generated} data={data} />
    <div className="mobile-bracket-tabs old-bracket-ui">
      <button className={mobileSide === 'left' ? 'active' : ''} onClick={() => setMobileSide('left')}>32 Kiri</button>
      <button className={mobileSide === 'final' ? 'active' : ''} onClick={() => setMobileSide('final')}>Final</button>
      <button className={mobileSide === 'right' ? 'active' : ''} onClick={() => setMobileSide('right')}>32 Kanan</button>
    </div>
    <div className="bracket-scroll old-bracket-ui">
      <div className={`bracket-board split-bracket mobile-show-${mobileSide}`}>
        <BracketHalf side="left" opening={opening.slice(0, 16)} qualifiers={qualifiers} generated={generated} />
        <section className="bracket-final-column">
          <div className="bracket-round-title final-title"><span>06</span><div><strong>Final</strong><small>Pertembungan dua juara bahagian</small></div></div>
          <div className="final-match-wrap">
            <KnockoutMatch code="FINAL" winnerLabel="Pemenang Separuh Akhir" />
            <div className="champion-slot"><FontAwesomeIcon icon={faTrophy} /><span>JUARA 2026</span><strong>Menanti pemenang final</strong></div>
          </div>
        </section>
        <BracketHalf side="right" opening={opening.slice(16)} qualifiers={qualifiers} generated={generated} />
      </div>
    </div>
  </div>;
}

function Stats({ data, standings, teamById }) {
  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [statsTab, setStatsTab] = useState('groups');
  const groups = data.groups.filter((group) => (!groupFilter || group.id === groupFilter)
    && (!query || group.teamIds.some((id) => teamById[id]?.name.toLowerCase().includes(query.toLowerCase()))));
  const qualifiers = (position) => data.groups.map((group) => {
    const teamIds = new Set(group.teamIds);
    const ranked = standings.filter((team) => teamIds.has(team.id));
    return ranked[position] ? { ...ranked[position], groupName: group.name } : null;
  }).filter(Boolean).sort((a, b) => b.p - a.p || b.gd - a.gd || b.f - a.f || a.name.localeCompare(b.name));
  const RankingTable = ({ rows, title, eyebrow }) => <section className="qualifier-ranking">
    <div className="qualifier-ranking-head"><div><span>{eyebrow}</span><h2>{title}</h2><p>Disusun mengikut mata, perbezaan mata dan jumlah mata jaringan.</p></div><strong>{rows.length}</strong></div>
    <div className="qualifier-rows">{rows.map((team, index) => <div className={`qualifier-card top-${index + 1}`} key={team.id}>
      <div className="qualifier-rank"><small>RANKING</small><strong>{String(index + 1).padStart(2, '0')}</strong>{index < 3 && <FontAwesomeIcon icon={faMedal} />}</div>
      <div className="qualifier-team"><TeamLogo team={team} size="lg" /><div><span>{team.groupName}</span><strong>{team.name}</strong><small>{index === 0 ? 'KEDUDUKAN TERBAIK' : `${team.w} menang · ${team.l} kalah`}</small></div></div>
      <div className="qualifier-stats"><div><span>MP</span><strong>{team.mp}</strong></div><div><span>MENANG</span><strong>{team.w}</strong></div><div><span>KALAH</span><strong>{team.l}</strong></div><div><span>BEZA MATA</span><strong>{team.gd > 0 ? '+' : ''}{team.gd}</strong></div><div className="points"><span>MATA</span><strong>{team.p}</strong></div></div>
    </div>)}</div>
  </section>;
  return <div className="page-stack group-standings-page">
    <div className="group-standings-head"><div><span><FontAwesomeIcon icon={faTrophy} /> CARTA KEDUDUKAN</span><h1>Kedudukan Mengikut Kumpulan</h1><p>Susunan sekolah berdasarkan keputusan perlawanan round robin.</p></div><div><strong>{data.groups.length}</strong><span>KUMPULAN</span></div></div>
    <div className="stats-tabs"><button className={statsTab === 'groups' ? 'active' : ''} onClick={() => setStatsTab('groups')}><FontAwesomeIcon icon={faLayerGroup} /><strong>Kedudukan Kumpulan</strong><span>Semua pasukan mengikut kumpulan</span></button><button className={statsTab === 'champions' ? 'active' : ''} onClick={() => setStatsTab('champions')}><FontAwesomeIcon icon={faTrophy} /><strong>Johan Kumpulan</strong><span>Ranking semua juara kumpulan</span></button><button className={statsTab === 'runners' ? 'active' : ''} onClick={() => setStatsTab('runners')}><FontAwesomeIcon icon={faMedal} /><strong>Naib Johan Kumpulan</strong><span>Ranking semua tempat kedua</span></button></div>
    {statsTab === 'groups' && <><div className="group-standings-tools"><label className="search"><FontAwesomeIcon icon={faSearch} /><input placeholder="Cari sekolah atau regu..." value={query} onChange={(e) => setQuery(e.target.value)} /></label><select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}><option value="">Semua Kumpulan</option>{data.groups.map((g) => <option value={g.id} key={g.id}>{g.name}</option>)}</select></div>
    <div className="group-standings-grid">{groups.map((group, groupIndex) => {
      const teamIds = new Set(group.teamIds);
      const rows = standings.filter((team) => teamIds.has(team.id));
      return <article className="group-standing-card" key={group.id}>
        <div className="group-standing-title"><div><span>KUMPULAN</span><strong>{String(groupIndex + 1).padStart(2, '0')}</strong></div><h2>{group.name}</h2><span>{rows.filter((r) => r.mp > 0).length}/3 telah bermain</span></div>
        <div className="group-standing-labels"><span>#</span><span>PASUKAN</span><span>MP</span><span>W</span><span>L</span><span>GD</span><span>PTS</span></div>
        <div className="group-standing-rows">{rows.map((team, index) => <div className={index === 0 ? 'group-leader' : ''} key={team.id}>
          <span className={`rank n${index + 1}`}>{index + 1}</span><div className="group-team"><TeamLogo team={team} /><strong>{team.name}</strong>{index === 0 && <FontAwesomeIcon icon={faMedal} />}</div><span>{team.mp}</span><span>{team.w}</span><span>{team.l}</span><span>{team.gd > 0 ? '+' : ''}{team.gd}</span><b>{team.p}</b>
        </div>)}</div>
      </article>;
    })}</div></>}
    {statsTab === 'champions' && <RankingTable rows={qualifiers(0)} title="Ranking Johan Kumpulan" eyebrow="TEMPAT PERTAMA SETIAP KUMPULAN" />}
    {statsTab === 'runners' && <RankingTable rows={qualifiers(1)} title="Ranking Naib Johan Kumpulan" eyebrow="TEMPAT KEDUA SETIAP KUMPULAN" />}
  </div>;
}

export default function App() {
  const firebaseHydrated = useRef(!isFirebaseConfigured());
  const [data, setData] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      const expectedTeams = seedData().teams.length;
      if (!localStorage.getItem(ROSTER_VERSION_KEY) || stored?.teams?.length !== expectedTeams) {
        localStorage.setItem(ROSTER_VERSION_KEY, 'done');
        return migrateRoster(stored);
      }
      if (stored && !localStorage.getItem(KNOCKOUT_GATE_VERSION_KEY)) {
        localStorage.setItem(KNOCKOUT_GATE_VERSION_KEY, 'done');
        return repairStoredData({ ...stored, knockoutMatches: [], settings: { ...stored.settings, knockoutGenerated: false } });
      }
      return stored ? repairStoredData(stored) : seedData();
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return seedData();
    }
  });
  const [active, setActive] = useState('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const printRef = useRef(null);
  useEffect(() => {
    if (!isFirebaseConfigured()) return undefined;
    return subscribeToTournament((remoteData) => {
      firebaseHydrated.current = true;
      if (remoteData) setData(repairStoredData(remoteData));
      else saveTournament(data).catch((error) => console.error('Firebase belum dapat dimulakan.', error));
    }, (error) => {
      firebaseHydrated.current = true;
      console.error('Firebase sync gagal.', error);
    });
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      if (isFirebaseConfigured() && firebaseHydrated.current) {
        saveTournament(data).catch((error) => console.error('Tidak dapat sync ke Firebase.', error));
      }
    } catch (error) {
      console.error('Tidak dapat menyimpan data kejohanan.', error);
      const compactData = removeOversizedLogos(data, true);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(compactData));
        setData(compactData);
      } catch (storageError) {
        console.error('Storan browser masih penuh selepas logo dibuang.', storageError);
      }
    }
  }, [data]);
  useEffect(() => {
    if (localStorage.getItem(LOGO_CLEANUP_KEY)) return;
    const cleanExistingLogos = async () => {
      try {
        const logoEntries = await Promise.all(data.schools.filter((school) => school.logo).map(async (school) => [school.id, await removeEdgeWhiteBackground(school.logo)]));
        if (logoEntries.length) {
          const cleaned = Object.fromEntries(logoEntries);
          setData((previous) => ({
            ...previous,
            schools: previous.schools.map((school) => cleaned[school.id] ? { ...school, logo: cleaned[school.id] } : school),
            teams: previous.teams.map((team) => cleaned[team.schoolId] ? { ...team, logo: cleaned[team.schoolId] } : team),
          }));
        }
        localStorage.setItem(LOGO_CLEANUP_KEY, 'done');
      } catch (error) {
        console.error('Logo lama tidak dapat dimampatkan.', error);
      }
    };
    cleanExistingLogos();
  }, []);
  const teamById = useMemo(() => Object.fromEntries(data.teams.map((t) => [t.id, t])), [data.teams]);
  const groupById = useMemo(() => Object.fromEntries(data.groups.map((g) => [g.id, g])), [data.groups]);
  const standings = useMemo(() => calculateStandings(data), [data]);
  const printPdf = async () => {
    const html2pdf = (await import('html2pdf.js')).default;
    html2pdf().set({ margin: 6, filename: `Takraw-${active}.pdf`, image: { type: 'jpeg', quality: .96 }, html2canvas: { scale: 1.5, backgroundColor: '#080b18' }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }, pagebreak: { mode: ['avoid-all', 'css', 'legacy'] } }).from(printRef.current).save();
  };
  const page = active === 'dashboard' ? <Dashboard {...{ data, standings, teamById, groupById }} />
    : active === 'schools' ? <Schools {...{ data, setData }} />
    : active === 'groups' ? <Groups {...{ data, setData, teamById }} />
    : active === 'matches' ? <Matches {...{ data, setData, teamById, groupById, standings }} />
    : active === 'knockout' ? <Knockout {...{ standings, data }} />
    : <Stats {...{ data, standings, teamById }} />;
  return <div className="app-shell">
    <aside className={menuOpen ? 'open' : ''}><div className="brand"><span><FontAwesomeIcon icon={faFutbol} /></span><div><strong>TAKRAW</strong><small>MSSD HULU LANGAT</small></div></div>
      <nav>{navItems.map((item) => <button className={active === item.id ? 'active' : ''} key={item.id} onClick={() => { setActive(item.id); setMenuOpen(false); }}><FontAwesomeIcon icon={item.icon} /><span>{item.label}</span></button>)}<button className="admin-nav-button" onClick={() => { setResetOpen(true); setMenuOpen(false); }}><FontAwesomeIcon icon={faGaugeHigh} /><span>Admin</span><b>Pusat Reset</b></button></nav>
      <div className="side-card"><FontAwesomeIcon icon={faFire} /><strong>Musim 2026</strong><span>Sistem kejohanan aktif</span><div><i /></div></div>
    </aside>
    <main><header><button className="menu-btn" onClick={() => setMenuOpen(!menuOpen)}><FontAwesomeIcon icon={faBars} /></button><div><span>Selamat datang,</span><strong>Urusetia Kejohanan</strong></div><div className="header-actions"><div className="system-live"><i /> SISTEM LIVE</div>{active === 'matches' && <PrintButton onClick={printPdf} />}<span className="avatar">UK</span></div></header>
      <div className="content" ref={printRef}>{page}</div>
    </main>
    {resetOpen && <AdminResetModal {...{ data, setData }} onClose={() => setResetOpen(false)} />}
  </div>;
}
