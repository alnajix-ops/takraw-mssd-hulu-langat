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
  faXmark, faCheck, faClock, faFire, faSitemap,
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
const TOURNAMENT_DATE = '22 - 26 JUN 2026';
const TOURNAMENT_LOCATION = 'DEWAN BERLIAN SK BANDAR SERI PUTRA';
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
  ['Pemenang P32-1', 'Pemenang P32-2'], ['Pemenang P32-3', 'Pemenang P32-4'],
  ['Pemenang P32-5', 'Pemenang P32-6'], ['Pemenang P32-7', 'Pemenang P32-8'],
  ['Pemenang P32-9', 'Pemenang P32-10'], ['Pemenang P32-11', 'Pemenang P32-12'],
  ['Pemenang P32-13', 'Pemenang P32-14'], ['Pemenang P32-15', 'Pemenang P32-16'],
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

function normalizeTournamentSettings(settings = {}, freshSettings = seedData().settings) {
  return {
    ...freshSettings,
    ...settings,
    date: TOURNAMENT_DATE,
    location: TOURNAMENT_LOCATION,
  };
}

function cleanTournamentData(base = seedData()) {
  return removeOversizedLogos({
    ...base,
    matches: generateGroupMatches(base.groups),
    activities: [],
    knockoutMatches: [],
    settings: {
      ...normalizeTournamentSettings(base.settings),
      knockoutGenerated: false,
      isFullReset: false,
    },
  }, true);
}

function emptyTournamentData() {
  const fresh = seedData();
  return {
    schools: [],
    teams: [],
    groups: [],
    matches: [],
    activities: [],
    knockoutMatches: [],
    settings: {
      ...normalizeTournamentSettings(fresh.settings),
      knockoutGenerated: false,
      isFullReset: true,
    },
  };
}

function getLocalTournamentData() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function isOlderThanLocalReset(remoteData) {
  try {
    const localData = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const localReset = Date.parse(localData?.settings?.lastResetAt || '');
    if (!localReset) return false;
    const remoteReset = Date.parse(remoteData?.settings?.lastResetAt || '');
    const remoteUpdated = Date.parse(remoteData?.updatedAt || '');
    return Math.max(remoteReset || 0, remoteUpdated || 0) < localReset;
  } catch {
    return false;
  }
}

function removeEdgeWhiteBackground(source) {
  return new Promise((resolve) => {
    if (!source) return resolve(source);
    const image = new Image();
    image.onload = () => {
      const maxDimension = 240;
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
      resolve(canvas.toDataURL('image/webp', 0.76));
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

function attachSchoolLogosToTeams(data) {
  const schoolById = Object.fromEntries((data.schools || []).map((school) => [school.id, school]));
  return {
    ...data,
    teams: (data.teams || []).map((team) => {
      const school = schoolById[team.schoolId];
      return {
        ...team,
        logo: school?.logo || team.logo || '',
        color: school?.color || team.color,
      };
    }),
  };
}

function prepareTournamentForStorage(data) {
  return {
    ...data,
    teams: (data.teams || []).map((team) => ({ ...team, logo: '' })),
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
  const fresh = cleanTournamentData();
  if (!stored || !Array.isArray(stored.teams) || !Array.isArray(stored.schools)) return fresh;
  const validTeamIds = new Set(stored.teams.map((team) => team.id));
  const groups = (Array.isArray(stored.groups) ? stored.groups : fresh.groups)
    .map((group) => ({ ...group, teamIds: (Array.isArray(group.teamIds) ? group.teamIds : []).filter((id) => validTeamIds.has(id)) }))
    .filter((group) => group.teamIds.length);
  const validGroupIds = new Set(groups.map((group) => group.id));
  const matches = (Array.isArray(stored.matches) ? stored.matches : [])
    .filter((match) => validGroupIds.has(match.groupId) && validTeamIds.has(match.homeId) && validTeamIds.has(match.awayId));

  return attachSchoolLogosToTeams(removeOversizedLogos({
    ...fresh,
    ...stored,
    schools: stored.schools,
    teams: stored.teams,
    groups,
    matches: Array.isArray(stored.matches) ? matches : fresh.matches,
    activities: Array.isArray(stored.activities) ? stored.activities : fresh.activities,
    knockoutMatches: Array.isArray(stored.knockoutMatches) ? stored.knockoutMatches : [],
    settings: normalizeTournamentSettings(stored.settings, fresh.settings),
  }));
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

function AdminLoginModal({ onLogin, onClose }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const handleLogin = (e) => {
    e.preventDefault();
    if (password === 'BSP206') {
      onLogin();
    } else {
      setError('Kata laluan tidak sah.');
    }
  };
  return <Modal title="Log Masuk Admin" onClose={onClose}>
    <form onSubmit={handleLogin} className="form-stack">
      {error && <div style={{ color: '#ef4444', fontSize: '14px', background: '#fef2f2', padding: '8px 12px', borderRadius: '4px', border: '1px solid #fca5a5' }}>{error}</div>}
      <label>Kata Laluan Admin
        <input type="password" autoFocus required value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} placeholder="Masukkan kata laluan..." />
      </label>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={onClose}>Batal</button>
        <button type="submit" className="btn primary">Log Masuk</button>
      </div>
    </form>
  </Modal>;
}

function AdminResetModal({ data, commitReset, onClose }) {
  const [pending, setPending] = useState(null);
  const [notice, setNotice] = useState('');
  const requestReset = (title, message, action, danger = false) => setPending({ title, message, action, danger });
  const runReset = () => {
    commitReset(pending.action);
    setNotice(`${pending.title} berjaya dilaksanakan.`);
    setPending(null);
  };
  const resetGroups = (previous) => {
    const groups = Array.from({ length: Math.ceil(previous.teams.length / 3) }, (_, index) => ({
      id: `group-${index + 1}`,
      name: `Kumpulan ${index + 1}`,
      teamIds: previous.teams.slice(index * 3, index * 3 + 3).map((team) => team.id),
    }));
    return { ...previous, groups, matches: generateGroupMatches(groups), knockoutMatches: [], activities: [], settings: { ...previous.settings, knockoutGenerated: false } };
  };
  const resetResults = (previous) => ({
    ...previous,
    matches: previous.matches.map((match) => ({ ...match, status: 'Menunggu', homeScore: '', awayScore: '' })),
    knockoutMatches: [],
    activities: [],
    settings: { ...previous.settings, knockoutGenerated: false },
  });
  const resetKnockoutResults = (previous) => ({
    ...previous,
    knockoutMatches: previous.knockoutMatches ? previous.knockoutMatches.map((match) => ({ ...match, status: 'Menunggu', homeScore: '', awayScore: '' })) : [],
  });
  const resetLogos = (previous) => ({
    ...previous,
    schools: previous.schools.map((school) => ({ ...school, logo: '' })),
    teams: previous.teams.map((team) => ({ ...team, logo: '' })),
  });
  return <Modal title="Pusat Reset Admin" onClose={onClose}>
    {notice && <div className="reset-notice"><FontAwesomeIcon icon={faCheck} /> {notice}</div>}
    {!pending ? <div className="admin-reset-grid">
      <button onClick={() => requestReset('Reset Kumpulan & Jadual', 'Susun semula semua pasukan mengikut urutan dan jana jadual kumpulan baharu?', resetGroups)}><FontAwesomeIcon icon={faLayerGroup} /><div><strong>Reset Kumpulan & Jadual</strong><span>Susun semula kumpulan asal dan kosongkan jadual kalah singkir.</span></div></button>
      <button onClick={() => requestReset('Reset Keputusan (Kumpulan)', 'Kosongkan semua skor peringkat kumpulan?', resetResults)}><FontAwesomeIcon icon={faFutbol} /><div><strong>Reset Keputusan</strong><span>Kosongkan skor dan status Peringkat Kumpulan.</span></div></button>
      <button onClick={() => requestReset('Reset Keputusan (Kalah Singkir)', 'Kosongkan skor untuk kesemua perlawanan kalah singkir?', resetKnockoutResults)}><FontAwesomeIcon icon={faTrophy} /><div><strong>Reset Kalah Singkir</strong><span>Kosongkan skor perlawanan dari Pusingan 64 hingga Final.</span></div></button>
      <button onClick={() => requestReset('Reset Struktur Bracket', 'Kosongkan susunan formasi kalah singkir yang telah dijana (anda boleh menjananya semula kemudian)?', (p) => ({ ...p, knockoutMatches: [], settings: { ...p.settings, knockoutGenerated: false } }))}><FontAwesomeIcon icon={faSitemap} /><div><strong>Reset Struktur Bracket</strong><span>Buang struktur peringkat kalah singkir supaya ia boleh dijana semula.</span></div></button>
      <button onClick={() => requestReset('Reset Logo Sekolah', 'Buang semua logo sekolah yang telah dimuat naik?', resetLogos)}><FontAwesomeIcon icon={faSchool} /><div><strong>Reset Logo Sekolah</strong><span>Buang semua logo tanpa mengubah pasukan.</span></div></button>
      <button onClick={() => requestReset('Reset Pasukan & Semua Data', 'Kembalikan sekolah, pasukan, kumpulan dan keputusan kepada data asal?', () => cleanTournamentData())}><FontAwesomeIcon icon={faUsers} /><div><strong>Reset Pasukan & Semua Data</strong><span>Kembalikan keseluruhan sistem kepada data asal.</span></div></button>
      <button className="danger" onClick={() => requestReset('Reset Penuh Sistem', 'Kosongkan semua sekolah, pasukan, kumpulan, jadual, logo dan keputusan?', () => emptyTournamentData(), true)}><FontAwesomeIcon icon={faTrash} /><div><strong>Reset Penuh Sistem</strong><span>Kosongkan keseluruhan sistem.</span></div></button>
    </div> : <div className={`reset-confirm ${pending.danger ? 'danger' : ''}`}><div className="reset-confirm-icon"><FontAwesomeIcon icon={pending.danger ? faTrash : faBolt} /></div><h4>{pending.title}</h4><p>{pending.message}</p><div className="modal-actions"><button className="btn ghost" onClick={() => setPending(null)}>Batal</button><button className={`btn ${pending.danger ? 'danger-btn' : 'primary'}`} onClick={runReset}>Ya, Teruskan Reset</button></div></div>}
  </Modal>;
}

function Dashboard({ data, setData, standings, teamById, groupById, bracket, isAdmin }) {
  const normalizedGroupMatches = data.matches.map(m => ({
    ...m,
    isKnockout: false,
    homeObj: teamById[m.homeId],
    awayObj: teamById[m.awayId],
    homeName: teamById[m.homeId]?.name || 'Menunggu',
    awayName: teamById[m.awayId]?.name || 'Menunggu',
    subtitle: `${groupById[m.groupId]?.name || 'Kumpulan'} · Pusingan ${m.round}`
  }));

  const normalizedKnockoutMatches = bracket.compiledRows.filter(r => !r.bye).map(r => ({
    id: r.code,
    isKnockout: true,
    homeScore: r.result.homeScore,
    awayScore: r.result.awayScore,
    status: r.result.status,
    court: r.result.court,
    homeObj: r.home, // may be undefined for placeholders
    awayObj: r.away,
    homeName: r.homeName,
    awayName: r.awayName,
    subtitle: `Kalah Singkir · ${r.code}`
  }));

  const allMatches = [...normalizedGroupMatches, ...normalizedKnockoutMatches].filter(m => m.homeName && m.awayName);
  const sortedAllMatches = [...allMatches].sort((a, b) => {
    if (!a.isKnockout && b.isKnockout) return -1;
    if (a.isKnockout && !b.isKnockout) return 1;

    if (!a.isKnockout) {
      const aRound = Number(a.round) || 99;
      const bRound = Number(b.round) || 99;
      if (aRound !== bRound) return aRound - bRound;
      const aGrp = data.groups.findIndex(g => g.id === a.groupId);
      const bGrp = data.groups.findIndex(g => g.id === b.groupId);
      return aGrp - bGrp;
    }

    return 0; // Knockouts remain in their order
  });

  const activeCourts = ['A', 'B', 'C'].map((court) => {
    const live = sortedAllMatches.find((m) => m.court === court && m.status === 'Sedang Bermain');
    const waiting = sortedAllMatches.filter((m) => m.court === court && m.status === 'Menunggu');
    return { court, live: live || waiting[0], next: live ? waiting[0] : waiting[1] };
  }).filter(({ live }) => live);

  const finishedGroup = normalizedGroupMatches.filter((m) => m.status === 'Tamat').length;
  const progressGroup = normalizedGroupMatches.length ? Math.round((finishedGroup / normalizedGroupMatches.length) * 100) : 0;

  const leaders = data.groups.slice(0, 6).map((group) => {
    const teamIds = new Set(group.teamIds);
    return { group, team: standings.find((row) => teamIds.has(row.id)) };
  });

  const tickerItems = sortedAllMatches
    .filter((match) => ['Sedang Bermain', 'Tamat'].includes(match.status))
    .slice(0, 6);

  return <div className="page-stack dashboard-page">
    <section className="hero">
      <div className="arena-lights" aria-hidden="true"><i /><i /><i /><i /></div>
      <div className="hero-logo-art" aria-hidden="true"><img src={mssdLogo} alt="" /></div>
      <div className="hero-copy">
        <div className="hero-kicker"><span>EDISI 2026</span><b>MSSD HULU LANGAT · LIVE TOURNAMENT SYSTEM</b></div>
        <div className="eyebrow"><FontAwesomeIcon icon={faTrophy} /> KEJOHANAN PERINGKAT DAERAH</div>
        <h1>KEJOHANAN SEPAK TAKRAW<br /><em>MSSD HULU LANGAT</em></h1>
        <p>BAWAH 12 TAHUN · TAHUN 2026</p>
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
        {tickerItems.length ? tickerItems.map((match, index) => <React.Fragment key={match.id}>
          {index > 0 && <em>&bull;</em>}<b>GELANGGANG {match.court}</b> {match.homeName} <strong>{match.homeScore || 0} : {match.awayScore || 0}</strong> {match.awayName}
        </React.Fragment>) : <><b>SISTEM RESET</b> Tiada kemas kini perlawanan dipaparkan buat masa ini.</>}
      </div></div>
    </div>

    <div className="summary-grid">
      {[
        [faSchool, data.schools.length, 'Jumlah Sekolah', 'cyan'],
        [faUsers, data.groups.length, 'Jumlah Kumpulan', 'purple'],
        [faTrophy, data.matches.length, 'Jumlah Perlawanan Kumpulan', 'gold'],
        [faCheck, finishedGroup, 'Selesai', 'green'],
        [faClock, Math.max(0, data.matches.length - finishedGroup), 'Belum Selesai', 'pink'],
      ].map(([icon, value, label, tone]) => <div className={`summary-card ${tone}`} key={label}>
        <span className="summary-icon"><FontAwesomeIcon icon={icon} /></span>
        <div><strong>{value}</strong><span>{label}</span></div>
      </div>)}
      <div className="summary-card progress-card">
        <div className="progress-ring" style={{ '--progress': `${progressGroup * 3.6}deg` }}><strong>{progressGroup}%</strong></div>
        <div><strong>Kemajuan</strong><span>{finishedGroup} daripada {data.matches.length} tamat</span></div>
      </div>
    </div>

    <section>
      <SectionHead eyebrow="PUSAT KAWALAN PERLAWANAN" title="Gelanggang Aktif" action={<div className="live-now"><i /> LIVE SEKARANG</div>} />
      <div className="court-grid">
        {activeCourts.map(({ court, live, next }) => {
          return <article className={`court-card court-${court.toLowerCase()} ${live.status === 'Sedang Bermain' ? 'is-live' : ''}`} key={court}>
            <span className="court-watermark">{court}</span>
            <div className="court-top"><span><FontAwesomeIcon icon={faFutbol} /> GELANGGANG {court}</span><Status value={live.status} /></div>
            <div className="scoreboard">
              <div className="score-team">{live.homeObj ? <TeamLogo team={live.homeObj} size="lg" /> : <div className="team-logo lg initials">?</div>}<strong>{live.homeName}</strong><small>HOME</small></div>
              <div className="big-score"><span>{live.homeScore || 0}</span><b>:</b><span>{live.awayScore || 0}</span><small>{live.subtitle}</small></div>
              <div className="score-team">{live.awayObj ? <TeamLogo team={live.awayObj} size="lg" /> : <div className="team-logo lg initials">?</div>}<strong>{live.awayName}</strong><small>AWAY</small></div>
            </div>
            <div className="next-match"><span><FontAwesomeIcon icon={faChevronRight} /> PERLAWANAN SETERUSNYA</span>{next
              ? <div className="next-match-teams">{next.homeObj ? <TeamLogo team={next.homeObj} size="xs" /> : null}<strong>{next.homeName}</strong><b>VS</b><strong>{next.awayName}</strong>{next.awayObj ? <TeamLogo team={next.awayObj} size="xs" /> : null}</div>
              : <strong>Jadual di Gelanggang {court} selesai</strong>}</div>
          </article>;
        })}
      </div>
    </section>

    <div className="dashboard-columns schedule-only">
      <section className="panel schedule-panel">
        <SectionHead eyebrow="JADUAL LANGSUNG" title="Perlawanan Hari Ini & Aktif Menunggu" action={<button className="text-btn">Lihat Semua <FontAwesomeIcon icon={faChevronRight} /></button>} />
        <div className="table-scroll"><table className="compact-schedule"><thead><tr><th>Gelanggang</th><th>Peringkat</th><th>Perlawanan</th><th>Status</th></tr></thead>
          <tbody>{sortedAllMatches.filter((m) => m.status !== 'Tamat').slice(0, 10).map((m, i) => <tr key={m.id || i}><td><span className="court-tag">Gel. {m.court}</span></td><td><b>{m.subtitle.split('·')[0].trim()}</b></td><td><div className="match-cell">{m.homeObj ? <TeamLogo team={m.homeObj} size="xs" /> : null} {m.homeName}<b>VS</b>{m.awayName} {m.awayObj ? <TeamLogo team={m.awayObj} size="xs" /> : null}</div></td><td><Status value={m.status} /></td></tr>)}</tbody>
        </table></div>
      </section>
    </div>
    <div className="dashboard-columns lower">
      <section className="panel"><SectionHead eyebrow="KEDUDUKAN SEMASA" title="Pendahulu Kumpulan" /><div className="leader-grid">{leaders.filter(({ team }) => team).map(({ group, team }) => <div className="leader-card" key={group.id}><TeamLogo team={team} /><div><span>{group.name}</span><strong>{team.name}</strong></div><b>{team.p} PTS</b></div>)}</div></section>
      <section className="panel"><SectionHead eyebrow="LOG SISTEM" title="Aktiviti Terkini" /><div className="timeline">{data.activities.map((a) => <div key={a.id}><i /><span>{a.time}</span><strong>{a.text}</strong></div>)}</div></section>
    </div>
  </div>;
}

function Schools({ data, setData, isAdmin }) {
  const [editing, setEditing] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkLogoOpen, setBulkLogoOpen] = useState(false);
  const [groupPlannerOpen, setGroupPlannerOpen] = useState(false);
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
    <SectionHead eyebrow="PANGKALAN DATA" title="Sekolah & Regu" action={isAdmin ? <div className="school-head-actions"><button className="btn ghost" onClick={() => setGroupPlannerOpen(true)}><FontAwesomeIcon icon={faLayerGroup} /> Susun Kumpulan</button><button className="btn ghost" onClick={() => setBulkLogoOpen(true)}><FontAwesomeIcon icon={faUpload} /> Upload Logo Pukal</button><button className="btn ghost" onClick={() => setBulkOpen(true)}><FontAwesomeIcon icon={faClipboard} /> Daftar Sekolah Pukal</button><button className="btn primary" onClick={() => setEditing({ name: '', logo: '' })}><FontAwesomeIcon icon={faPlus} /> Tambah Sekolah</button></div> : null} />
    <div className="toolbar"><label className="search"><FontAwesomeIcon icon={faSearch} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari sekolah..." /></label><span>{filtered.length} sekolah · {data.teams.length} regu</span></div>
    <div className="school-grid">{filtered.map((school) => {
      const teams = data.teams.filter((t) => t.schoolId === school.id);
      return <article className="school-card" key={school.id}><div className="school-card-head"><TeamLogo team={school} size="lg" /><div><h3>{school.name}</h3><span>{teams.length} regu berdaftar</span></div>{isAdmin && <div className="row-actions"><button onClick={() => setEditing(school)}><FontAwesomeIcon icon={faEdit} /></button><button onClick={() => setData((p) => ({ ...p, schools: p.schools.filter((s) => s.id !== school.id), teams: p.teams.filter((t) => t.schoolId !== school.id) }))}><FontAwesomeIcon icon={faTrash} /></button></div>}</div>
        <div className="regu-list">{teams.map((team) => <div key={team.id}><span className="suffix">{team.suffix}</span><strong>{team.name}</strong>{isAdmin && <button title="Copy Team" onClick={() => setCopied(team)}><FontAwesomeIcon icon={faCopy} /></button>}</div>)}</div>
        {isAdmin && <div className="school-actions"><button className="btn small" onClick={() => addRegu(school)}><FontAwesomeIcon icon={faPlus} /> Tambah Regu</button><button className="btn small ghost" disabled={!copied} onClick={() => pasteRegu(school)}><FontAwesomeIcon icon={faClipboard} /> Paste Team</button></div>}
      </article>;
    })}</div>
    {editing && <SchoolModal school={editing} onSave={saveSchool} onClose={() => setEditing(null)} />}
    {bulkOpen && <BulkSchoolModal data={data} setData={setData} onClose={() => setBulkOpen(false)} />}
    {bulkLogoOpen && <BulkLogoModal data={data} setData={setData} onClose={() => setBulkLogoOpen(false)} />}
    {groupPlannerOpen && <SchoolGroupPlanner data={data} setData={setData} onClose={() => setGroupPlannerOpen(false)} />}
  </div>;
}

function SchoolGroupPlanner({ data, setData, onClose }) {
  const makeGroups = (teams = data.teams) => Array.from({ length: Math.ceil(Math.max(teams.length, 1) / 3) }, (_, index) => ({
    id: `group-${index + 1}`,
    name: `Kumpulan ${index + 1}`,
    teamIds: teams.slice(index * 3, index * 3 + 3).map((team) => team.id),
  }));
  const initialGroups = data.groups.length ? data.groups : makeGroups();
  const [draftGroups, setDraftGroups] = useState(initialGroups.map((group, index) => ({
    id: group.id || `group-${index + 1}`,
    name: group.name || `Kumpulan ${index + 1}`,
    teamIds: [...(group.teamIds || [])].slice(0, 3),
  })));
  const selectedIds = draftGroups.flatMap((group) => group.teamIds).filter(Boolean);
  const selectedSet = new Set(selectedIds);
  const unassigned = data.teams.filter((team) => !selectedSet.has(team.id));
  const updateSlot = (groupIndex, slot, teamId) => setDraftGroups((groups) => groups.map((group, index) => {
    if (index !== groupIndex) return group;
    const teamIds = [...group.teamIds];
    teamIds[slot] = teamId;
    return { ...group, teamIds };
  }));
  const autoArrange = () => setDraftGroups(makeGroups(data.teams));
  const clearGroups = () => setDraftGroups(makeGroups([]).map((group) => ({ ...group, teamIds: [] })));
  const addGroup = () => setDraftGroups((groups) => [...groups, { id: `group-${Date.now()}`, name: `Kumpulan ${groups.length + 1}`, teamIds: [] }]);
  const save = () => {
    const groups = draftGroups.map((group, index) => ({
      ...group,
      id: group.id || `group-${index + 1}`,
      name: group.name || `Kumpulan ${index + 1}`,
      teamIds: group.teamIds.filter(Boolean),
    })).filter((group) => group.teamIds.length);
    const duplicate = groups.flatMap((group) => group.teamIds).find((id, index, list) => list.indexOf(id) !== index);
    if (duplicate) return alert('Ada pasukan yang dimasukkan lebih daripada satu kumpulan.');
    setData((previous) => ({
      ...previous,
      groups,
      matches: generateGroupMatches(groups),
      knockoutMatches: [],
      activities: [{ id: Date.now(), time: new Date().toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' }), text: 'Susunan kumpulan dikemas kini dari tab sekolah', type: 'schedule' }, ...previous.activities].slice(0, 8),
      settings: { ...previous.settings, knockoutGenerated: false },
    }));
    onClose();
  };
  return <Modal title="Susun Kumpulan Pasukan" onClose={onClose}><div className="school-group-planner">
    <div className="planner-top">
      <div><strong>{data.teams.length} pasukan</strong><span>{unassigned.length} belum masuk kumpulan</span></div>
      <div className="planner-actions"><button className="btn small ghost" onClick={clearGroups}>Kosongkan</button><button className="btn small ghost" onClick={addGroup}>Tambah Kumpulan</button><button className="btn small primary" onClick={autoArrange}><FontAwesomeIcon icon={faBolt} /> Auto Susun</button></div>
    </div>
    {!!unassigned.length && <div className="unassigned-teams"><b>Belum masuk kumpulan:</b>{unassigned.slice(0, 12).map((team) => <span key={team.id}>{team.name}</span>)}{unassigned.length > 12 && <em>+{unassigned.length - 12} lagi</em>}</div>}
    <div className="planner-grid">{draftGroups.map((group, groupIndex) => <article className="planner-group" key={group.id}>
      <label>Nama Kumpulan<input value={group.name} onChange={(event) => setDraftGroups((groups) => groups.map((item, index) => index === groupIndex ? { ...item, name: event.target.value } : item))} /></label>
      {[0, 1, 2].map((slot) => <TeamPicker key={slot} label={`Slot ${slot + 1}`} teams={data.teams} value={group.teamIds[slot] || ''} selectedSet={selectedSet} onChange={(teamId) => updateSlot(groupIndex, slot, teamId)} />)}
    </article>)}</div>
    <div className="modal-actions"><button className="btn ghost" onClick={onClose}>Batal</button><button className="btn primary" onClick={save}><FontAwesomeIcon icon={faCheck} /> Simpan & Jana Jadual</button></div>
  </div></Modal>;
}

function TeamPicker({ label, teams, value, selectedSet, onChange }) {
  const selected = teams.find((team) => team.id === value);
  const [query, setQuery] = useState(selected?.name || '');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setQuery(selected?.name || '');
  }, [selected?.id]);
  const normalized = query.trim().toLowerCase();
  const options = teams
    .filter((team) => (!selectedSet.has(team.id) || team.id === value)
      && (!normalized || team.name.toLowerCase().includes(normalized)))
    .slice(0, 8);
  const choose = (team) => {
    onChange(team.id);
    setQuery(team.name);
    setOpen(false);
  };
  const clear = () => {
    onChange('');
    setQuery('');
    setOpen(true);
  };
  return <label className="team-picker-label">{label}<div className="team-picker">
    <input value={query} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} placeholder="Taip nama pasukan, contoh: TAMAN" />
    {value && <button type="button" onClick={clear} aria-label="Kosongkan pilihan"><FontAwesomeIcon icon={faXmark} /></button>}
    {open && <div className="team-picker-menu">
      {options.length ? options.map((team) => <button type="button" key={team.id} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(team)}>{team.name}</button>)
        : <span>Tiada pasukan sepadan</span>}
    </div>}
  </div></label>;
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

function normalizeLogoKey(value = '') {
  return value
    .toLowerCase()
    .replace(/\.(png|jpe?g|webp|gif)$/i, '')
    .replace(/\b(logo|lencana|badge|emblem|school|sekolah)\b/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function findLogoTarget(fileName, data) {
  const fileKey = normalizeLogoKey(fileName);
  if (!fileKey) return null;
  const schools = data.schools.map((school) => ({
    school,
    key: normalizeLogoKey(school.name),
  })).filter((item) => item.key);
  const teams = data.teams.map((team) => ({
    school: data.schools.find((school) => school.id === team.schoolId),
    key: normalizeLogoKey(team.name),
  })).filter((item) => item.school && item.key);
  return [...teams, ...schools]
    .filter((item) => item.key === fileKey || fileKey.includes(item.key) || item.key.includes(fileKey))
    .sort((a, b) => b.key.length - a.key.length)[0]?.school || null;
}

function readLogoFile(file) {
  return new Promise((resolve, reject) => {
    if (file.size > 5 * 1024 * 1024) return reject(new Error('Saiz melebihi 5MB'));
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        resolve(await removeEdgeWhiteBackground(reader.result));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('Fail tidak dapat dibaca'));
    reader.readAsDataURL(file);
  });
}

function BulkLogoModal({ data, setData, onClose }) {
  const [items, setItems] = useState([]);
  const [processing, setProcessing] = useState(false);
  const handleFiles = async (files) => {
    const list = [...files].filter((file) => /\.(png|jpe?g|webp)$/i.test(file.name));
    if (!list.length) return alert('Pilih fail logo PNG, JPG, JPEG atau WEBP.');
    setProcessing(true);
    const nextItems = await Promise.all(list.map(async (file) => {
      const school = findLogoTarget(file.name, data);
      if (!school) return { fileName: file.name, status: 'Tiada padanan sekolah' };
      try {
        const logo = await readLogoFile(file);
        return { fileName: file.name, schoolId: school.id, schoolName: school.name, logo, status: 'Sedia' };
      } catch (error) {
        return { fileName: file.name, schoolId: school.id, schoolName: school.name, status: error.message || 'Gagal proses' };
      }
    }));
    setItems(nextItems);
    setProcessing(false);
  };
  const ready = items.filter((item) => item.logo && item.schoolId);
  const save = () => {
    if (!ready.length) return alert('Tiada logo yang berjaya dipadankan.');
    const logoBySchool = Object.fromEntries(ready.map((item) => [item.schoolId, item.logo]));
    setData((previous) => ({
      ...previous,
      schools: previous.schools.map((school) => logoBySchool[school.id] ? { ...school, logo: logoBySchool[school.id] } : school),
      teams: previous.teams.map((team) => logoBySchool[team.schoolId] ? { ...team, logo: logoBySchool[team.schoolId] } : team),
    }));
    onClose();
  };
  return <Modal title="Upload Logo Sekolah Pukal" onClose={onClose}><div className="bulk-logo-form">
    <div className="bulk-guide"><FontAwesomeIcon icon={faUpload} /><div><strong>Pilih banyak logo sekali</strong><span>Nama fail akan dipadankan dengan nama sekolah atau regu. Contoh: SK Taman Rakan.png</span></div></div>
    <label className="upload-box bulk-logo-drop"><FontAwesomeIcon icon={faUpload} /><strong>{processing ? 'Memproses logo...' : 'Pilih fail logo pukal'}</strong><span>PNG, JPG, JPEG atau WEBP · Maksimum 5MB setiap fail</span><input multiple type="file" accept=".png,.jpg,.jpeg,.webp" disabled={processing} onChange={(event) => handleFiles(event.target.files)} /></label>
    {!!items.length && <div className="bulk-logo-results">
      <div className="bulk-preview"><span>{ready.length} logo sedia</span><span>{items.length - ready.length} perlu semak</span><span>{items.length} fail dipilih</span></div>
      <div className="bulk-logo-list">{items.map((item) => <div className={item.logo ? 'matched' : 'unmatched'} key={item.fileName}>
        <span>{item.fileName}</span><strong>{item.schoolName || item.status}</strong>
      </div>)}</div>
    </div>}
    <div className="modal-actions"><button className="btn ghost" onClick={onClose}>Batal</button><button className="btn primary" disabled={processing || !ready.length} onClick={save}><FontAwesomeIcon icon={faCheck} /> Simpan {ready.length || ''} Logo</button></div>
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

function Groups({ data, setData, teamById, isAdmin }) {
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
    <div className="groups-page-head"><div><span><FontAwesomeIcon icon={faLayerGroup} /> STRUKTUR KEJOHANAN</span><h1>Pengurusan Kumpulan</h1><p>Susun tiga pasukan bagi setiap kumpulan kejohanan.</p></div>{isAdmin && <div className="groups-head-actions"><button className="btn ghost" onClick={autoArrange}><FontAwesomeIcon icon={faBolt} /> Auto Susun Team</button><button className="btn primary" onClick={addGroup}><FontAwesomeIcon icon={faPlus} /> Tambah Kumpulan</button></div>}</div>
    <div className="info-strip"><FontAwesomeIcon icon={faBolt} /><strong>Format Round Robin</strong><span>Setiap kumpulan mengandungi tepat 3 pasukan dan menjana 3 perlawanan.</span></div>
    <div className="group-grid">{data.groups.map((group, index) => <article className="group-card" key={group.id}><div className="group-head"><div><span>KUMPULAN</span><strong>{String(index + 1).padStart(2, '0')}</strong></div><h3>{group.name}</h3>{isAdmin && <div className="row-actions"><button title="Tukar team" onClick={() => setEditing({ ...group, teamIds: [...group.teamIds] })}><FontAwesomeIcon icon={faEdit} /></button><button onClick={() => setData((p) => ({ ...p, groups: p.groups.filter((g) => g.id !== group.id), matches: p.matches.filter((m) => m.groupId !== group.id) }))}><FontAwesomeIcon icon={faTrash} /></button></div>}</div>
      <div className="group-teams">{group.teamIds.map((id, i) => <div key={id}><span>{i + 1}</span><TeamLogo team={teamById[id]} /><strong>{teamById[id]?.name}</strong></div>)}</div><div className="group-foot"><span>{group.teamIds.length}/3 pasukan</span><div className="capacity"><i style={{ width: `${group.teamIds.length / 3 * 100}%` }} /></div></div>
    </article>)}</div>
    {editing && <Modal title="Tukar Team Dalam Kumpulan" onClose={() => setEditing(null)}><form className="form-stack group-editor-form" onSubmit={(e) => { e.preventDefault(); saveGroup(); }}>
      <label>Nama Kumpulan<input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
      {[0, 1, 2].map((slot) => <label key={slot}>Pasukan {slot + 1}<select value={editing.teamIds[slot] || ''} onChange={(e) => setEditing((group) => { const teamIds = [...group.teamIds]; teamIds[slot] = e.target.value; return { ...group, teamIds }; })}><option value="">Pilih pasukan</option>{data.teams.map((team) => <option key={team.id} value={team.id} disabled={editing.teamIds.some((id, index) => index !== slot && id === team.id)}>{team.name}</option>)}</select></label>)}
      <div className="modal-actions"><button type="button" className="btn ghost" onClick={() => setEditing(null)}>Batal</button><button className="btn primary" disabled={editing.teamIds.length !== 3 || new Set(editing.teamIds).size !== 3}>Simpan & Jana Jadual</button></div>
    </form></Modal>}
  </div>;
}

function useKnockoutBracket(data, standings) {
  return useMemo(() => {
    const generated = Boolean(data.settings?.knockoutGenerated);
    const qualifiers = generated ? knockoutQualifiers(data, standings) : {};
    
    const openingRows = KNOCKOUT_OPENING.map(([homeCode, awayCode], index) => ({
      code: `P${index + 1}`,
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
    
    const p32Rows = Array.from({ length: 16 }, (_, index) => {
      const first = openingRows[index * 2];
      const second = openingRows[index * 2 + 1];
      return {
        code: `P32-${index + 1}`,
        homeLabel: first?.bye ? `Laluan ${first.code}` : `Pemenang ${first?.code}`,
        awayLabel: second?.bye ? `Laluan ${second.code}` : `Pemenang ${second?.code}`,
      };
    });
    
    const p16Rows = P16_PATHS.map(([homeLabel, awayLabel], index) => ({ code: `P16-${index + 1}`, homeLabel, awayLabel }));
    const sukuRows = placeholderRows(4, 'SUKU', 'P16');
    const cupSemiRows = placeholderRows(2, 'SEPARUH', 'SUKU');
    const cupFinalRows = placeholderRows(1, 'FINAL', 'SEPARUH');
    const plateSemiRows = [
      { code: 'PLATE-SF-1', homeLabel: 'Kalah Suku 1', awayLabel: 'Kalah Suku 2' },
      { code: 'PLATE-SF-2', homeLabel: 'Kalah Suku 3', awayLabel: 'Kalah Suku 4' },
    ];
    const plateFinalRows = [{ code: 'FINAL-PLATE', homeLabel: 'Pemenang Plate 1', awayLabel: 'Pemenang Plate 2' }];
    
    const saved = Object.fromEntries((data.knockoutMatches || []).map((match) => [match.code, match]));
    const allRows = [...openingRows, ...p32Rows, ...p16Rows, ...sukuRows, ...cupSemiRows, ...cupFinalRows, ...plateSemiRows, ...plateFinalRows];
    const rowByCode = Object.fromEntries(allRows.map((row) => [row.code, row]));
    
    const normaliseOutcomeCode = (code) => {
      const value = String(code || '').trim().toUpperCase();
      if (/^SUKU\s+\d+$/.test(value)) return value.replace(' ', '-');
      if (/^SEPARUH\s+\d+$/.test(value)) return value.replace(' ', '-');
      if (/^PLATE\s+\d+$/.test(value)) return `PLATE-SF-${value.match(/\d+/)?.[0] || ''}`;
      return value;
    };

    function outcomeByCode(code, depth = 0) {
      if (depth > 14) return { winner: null, loser: null };
      const row = rowByCode[normaliseOutcomeCode(code)];
      if (!row) return { winner: null, loser: null };
      
      const homeName = row.home?.name || resolveLabel(row.homeLabel, depth + 1);
      const awayName = row.away?.name || resolveLabel(row.awayLabel, depth + 1);
      if (row.bye) return { winner: homeName || null, loser: null };
      
      const result = saved[row.code];
      if (!result || result.status !== 'Tamat' || result.homeScore === '' || result.awayScore === '') return { winner: null, loser: null };
      
      const homeScore = Number(result.homeScore);
      const awayScore = Number(result.awayScore);
      if (Number.isNaN(homeScore) || Number.isNaN(awayScore) || homeScore === awayScore) return { winner: null, loser: null };
      return homeScore > awayScore
        ? { winner: homeName || null, loser: awayName || null }
        : { winner: awayName || null, loser: homeName || null };
    }

    function resolveLabel(label, depth = 0) {
      if (!label || depth > 14) return label || 'Menunggu';
      const text = String(label);
      const winnerMatch = text.match(/^Pemenang\s+(.+)$/i);
      if (winnerMatch) return outcomeByCode(winnerMatch[1], depth + 1).winner || text;
      const routeMatch = text.match(/^Laluan\s+(.+)$/i);
      if (routeMatch) return outcomeByCode(routeMatch[1], depth + 1).winner || text;
      const sukuLoserMatch = text.match(/^Kalah\s+Suku\s+(\d+)$/i);
      if (sukuLoserMatch) return outcomeByCode(`SUKU-${sukuLoserMatch[1]}`, depth + 1).loser || text;
      const plateWinnerMatch = text.match(/^Pemenang\s+Plate\s+(\d+)$/i);
      if (plateWinnerMatch) return outcomeByCode(`PLATE-SF-${plateWinnerMatch[1]}`, depth + 1).winner || text;
      return text;
    }

    const compiledRows = allRows.map(row => {
      const homeName = row.home?.name || resolveLabel(row.homeLabel);
      const awayName = row.away?.name || resolveLabel(row.awayLabel);
      const result = saved[row.code] || { homeScore: '', awayScore: '', court: 'A', status: 'Menunggu' };
      return {
        ...row,
        homeName,
        awayName,
        result
      };
    });

    return {
      compiledRows,
      rowByCode,
      stages: {
        openingRows, p32Rows, p16Rows, sukuRows, cupSemiRows, cupFinalRows, plateSemiRows, plateFinalRows
      }
    };
  }, [data.settings?.knockoutGenerated, data.knockoutMatches, data.matches]);
}

function KnockoutSchedule({ type, standings, data, setData, isAdmin, bracket }) {
  const { stages, compiledRows } = bracket;
  const saved = Object.fromEntries((data.knockoutMatches || []).map((match) => [match.code, match]));
  
  const displayStages = type === 'quarter'
    ? [
      { title: 'Suku Akhir', code: 'SUKU', rows: stages.sukuRows },
      { title: 'Separuh Akhir Plate', code: 'PLATE SF', rows: stages.plateSemiRows },
      { title: 'Separuh Akhir Cup', code: 'SEPARUH', rows: stages.cupSemiRows },
      { title: 'Final Plate', code: 'PLATE FINAL', rows: stages.plateFinalRows },
      { title: 'Final Cup', code: 'FINAL', rows: stages.cupFinalRows },
    ]
    : [
      { title: 'Pusingan 64', code: 'P1-P32', rows: stages.openingRows },
      { title: 'Pusingan 32', code: 'P32', rows: stages.p32Rows },
      { title: 'Pusingan 16', code: 'P16', rows: stages.p16Rows },
    ];

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
  return <div className="event-stage-sections">{displayStages.map((stage) => <section className="event-stage-section" key={stage.code}>
    <div className="event-stage-head"><div><span>PERINGKAT</span><strong>{stage.code}</strong></div><div><h2>{stage.title}</h2><p>{stage.rows.length} perlawanan</p></div></div>
    <div className="event-stage-list">{stage.rows.map((baseRow, index) => {
      const row = compiledRows.find(r => r.code === baseRow.code);
      const result = row.result;
      const isBye = row.bye;
      const homeLabel = row.homeName;
      const awayLabel = row.awayName;
      const teamByName = Object.fromEntries(data.teams.map(t => [t.name, t]));
      const homeTeam = row.home || teamByName[homeLabel];
      const awayTeam = row.away || teamByName[awayLabel];
      return <article className={`event-stage-row ${isBye ? 'is-bye' : ''} ${!isAdmin ? 'readonly' : ''}`} key={row.code}>
      <div className="event-match-number"><span>PERLAWANAN</span><strong>{String(index + 1).padStart(2, '0')}</strong></div>
      <div className="event-team"><KnockoutTeam team={homeTeam} seed={row.homeSeed} label={homeLabel} /></div>
      <div className="event-score">{isBye ? <div className="event-versus"><b>VS</b><span>{row.code}</span></div> : isAdmin ? <><input type="number" min="0" value={result.homeScore} onChange={(e) => update(row.code, 'homeScore', e.target.value)} /><b>:</b><input type="number" min="0" value={result.awayScore} onChange={(e) => update(row.code, 'awayScore', e.target.value)} /></> : <><div className="score-ro">{result.homeScore !== undefined && result.homeScore !== '' ? result.homeScore : '-'}</div><b>:</b><div className="score-ro">{result.awayScore !== undefined && result.awayScore !== '' ? result.awayScore : '-'}</div></>}</div>
      <div className="event-team away"><KnockoutTeam team={awayTeam} seed={row.awaySeed} label={awayLabel} /></div>
      {isBye ? <span className="event-status bye">BYE</span> : isAdmin ? <div className="event-controls"><select value={result.court} onChange={(e) => update(row.code, 'court', e.target.value)}><option value="A">Gelanggang A</option><option value="B">Gelanggang B</option><option value="C">Gelanggang C</option></select><select value={result.status} onChange={(e) => update(row.code, 'status', e.target.value)}><option>Menunggu</option><option>Sedang Bermain</option><option>Tamat</option></select><button className="btn primary small" onClick={() => save(row.code)}><FontAwesomeIcon icon={faDownload} /> Simpan</button></div> : <div className="event-controls readonly"><div className="court-tag">Gel. {result.court}</div><Status value={result.status} /></div>}
    </article>;
    })}</div>
  </section>)}</div>;
}

function Matches({ data, setData, teamById, groupById, standings, bracket, isAdmin }) {
  const [filters, setFilters] = useState({ group: '', round: '', court: '', status: '' });
  const groupNumber = (match) => data.groups.findIndex((group) => group.id === match.groupId) + 1;
  const [eventTab, setEventTab] = useState(() => {
    const activeGroupMatches = data.matches.filter(m => m.status === 'Sedang Bermain' || m.status === 'Menunggu');
    if (activeGroupMatches.length > 0) {
      const gNum = groupNumber(activeGroupMatches[0]);
      return gNum <= 14 ? 'day1' : 'day2';
    }
    const activeKnockouts = (data.knockoutMatches || []).filter(m => m.status === 'Sedang Bermain' || m.status === 'Menunggu');
    if (activeKnockouts.length > 0) {
      const match = activeKnockouts[0];
      if (match.code.startsWith('P')) return 'knockout';
      return 'quarter';
    }
    return 'day1';
  });
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
  const resetKnockout = () => {
    if (window.confirm('Adakah anda pasti untuk reset semua rekod Kalah Mati? Rekod skor akan padam.')) {
      setData((previous) => ({
        ...previous,
        knockoutMatches: [],
        settings: { ...previous.settings, knockoutGenerated: false },
        activities: [{ id: Date.now(), time: new Date().toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' }), text: 'Menetapkan semula semua data perlawanan Kalah Mati.', type: 'schedule' }, ...previous.activities].slice(0, 8),
      }));
    }
  };
  const day3Codes = [
    ...Array.from({ length: 32 }, (_, index) => `P${index + 1}`),
    ...Array.from({ length: 16 }, (_, index) => `P32-${index + 1}`),
    ...Array.from({ length: 8 }, (_, index) => `P16-${index + 1}`),
  ];
  const day3Complete = day3Codes.every((code) => (data.knockoutMatches || []).find((match) => match.code === code)?.status === 'Tamat');
  const day4Codes = [...Array.from({ length: 4 }, (_, index) => `SUKU-${index + 1}`), 'PLATE-SF-1', 'PLATE-SF-2', ...Array.from({ length: 2 }, (_, index) => `SEPARUH-${index + 1}`), 'FINAL-PLATE', 'FINAL-1'];
  const update = (id, field, value) => setData((p) => ({ ...p, matches: p.matches.map((m) => m.id === id ? { ...m, [field]: value } : m) }));
  const save = (match) => {
    update(match.id, 'status', match.homeScore !== '' && match.awayScore !== '' ? 'Tamat' : match.status);
    setData((p) => ({ ...p, activities: [{ id: Date.now(), time: new Date().toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' }), text: `Keputusan ${groupById[match.groupId].name} disimpan`, type: 'result' }, ...p.activities].slice(0, 8) }));
  };
  const dayMatches = data.matches.filter((match) => eventTab === 'day1' ? groupNumber(match) <= 14 : groupNumber(match) >= 15);
  const shown = dayMatches.filter((m) => (!filters.group || m.groupId === filters.group) && (!filters.round || String(m.round) === filters.round) && (!filters.court || m.court === filters.court) && (!filters.status || m.status === filters.status));
  const displayedCount = eventTab === 'knockout' ? 56 : eventTab === 'quarter' ? 7 : shown.length;
  return <div className="page-stack matches-page">
    <div className="matches-page-head">
      <div><span><FontAwesomeIcon icon={faFlagCheckered} /> ROUND ROBIN AUTOMATIK</span><h1>Perlawanan & Keputusan</h1><p>Urus gelanggang, status perlawanan dan keputusan dalam satu paparan.</p></div>
      <div className="matches-head-stat"><strong>{displayedCount}</strong><span>PERLAWANAN<br />DIPAPARKAN</span></div>
    </div>
    <div className="event-tabs">
      {[['day1', 'HARI PERTAMA', 'Kumpulan 1 - 14'], ['day2', 'HARI KEDUA', 'Kumpulan 15 - 29'], ['knockout', 'HARI KETIGA', 'Pusingan 64 hingga Pusingan 16'], ['quarter', 'HARI KEEMPAT', 'Suku akhir hingga final']].map(([id, label, note]) => <button className={eventTab === id ? 'active' : ''} key={id} onClick={() => setEventTab(id)}><strong>{label}</strong><span>{note}</span></button>)}
    </div>
    {isAdmin && <section className="admin-simulator">
      <div className="admin-simulator-copy"><FontAwesomeIcon icon={faBolt} /><div><span>ALAT UJIAN ADMIN</span><strong>Simulasi Keputusan Rawak</strong><small>Skor maksimum 30 mata. Jana keputusan mengikut urutan peringkat.</small></div></div>
      <div className="admin-simulator-actions" style={{ marginBottom: '12px' }}>
        <button className="btn primary" onClick={() => simulateGroups()}><FontAwesomeIcon icon={faLayerGroup} /> Auto Kumpulan</button>
        <button className="btn generate-knockout" disabled={!groupsComplete || knockoutGenerated} onClick={generateKnockout}><FontAwesomeIcon icon={faFlagCheckered} /> {knockoutGenerated ? 'Kalah Mati Telah Dijana' : 'Jana Perlawanan Kalah Mati'}</button>
        {knockoutGenerated && <button className="btn outline" onClick={resetKnockout} style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}><FontAwesomeIcon icon={faFlagCheckered} /> Reset Kalah Mati</button>}
      </div>
      <div className="admin-simulator-actions">
        <button className="btn primary" disabled={!knockoutGenerated} onClick={() => simulateKnockout(day3Codes, 'Admin menjana keputusan rawak Hari Ketiga')}><FontAwesomeIcon icon={faFlagCheckered} /> Auto Hari Ketiga</button>
        <button className="btn primary" disabled={!knockoutGenerated || !day3Complete} onClick={() => simulateKnockout(day4Codes, 'Admin menjana keputusan rawak Hari Keempat')}><FontAwesomeIcon icon={faTrophy} /> Auto Hari Keempat</button>
      </div>
    </section>}
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
        <div className="match-list">{roundMatches.map((match, matchIndex) => <article className={`match-list-row ${!isAdmin ? 'readonly' : ''}`} key={match.id}>
          <div className="match-list-meta"><span>PERLAWANAN</span><strong>{String(matchIndex + 1).padStart(2, '0')}</strong></div>
          <div className="match-list-team home"><TeamLogo team={teamById[match.homeId]} /><strong>{teamById[match.homeId].name}</strong></div>
          <div className="match-list-score">
            {isAdmin ? <><input type="number" min="0" value={match.homeScore} onChange={(e) => update(match.id, 'homeScore', e.target.value)} /><b>:</b><input type="number" min="0" value={match.awayScore} onChange={(e) => update(match.id, 'awayScore', e.target.value)} /></> : <><div className="score-ro">{match.homeScore !== '' ? match.homeScore : '-'}</div><b>:</b><div className="score-ro">{match.awayScore !== '' ? match.awayScore : '-'}</div></>}
          </div>
          <div className="match-list-team away"><strong>{teamById[match.awayId].name}</strong><TeamLogo team={teamById[match.awayId]} /></div>
          {isAdmin ? <><select value={match.court} onChange={(e) => update(match.id, 'court', e.target.value)}><option value="A">Gelanggang A</option><option value="B">Gelanggang B</option><option value="C">Gelanggang C</option></select>
          <select value={match.status} onChange={(e) => update(match.id, 'status', e.target.value)}><option>Menunggu</option><option>Sedang Bermain</option><option>Tamat</option></select>
          <button className="btn primary small" onClick={() => save(match)}><FontAwesomeIcon icon={faDownload} /> Simpan</button></> : <><div className="court-tag">Gel. {match.court}</div><Status value={match.status} /><div></div></>}
        </article>)}</div>
      </section>;
    })}</div>}
    {eventTab === 'knockout' && <KnockoutSchedule type="knockout" {...{ standings, data, setData, isAdmin, bracket }} />}
    {eventTab === 'quarter' && <KnockoutSchedule type="quarter" {...{ standings, data, setData, isAdmin, bracket }} />}
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

function ModernBracket({ qualifiers, generated, data, phase = 'early' }) {
  const saved = Object.fromEntries((data.knockoutMatches || []).map((match) => [match.code, match]));
  const matchOutcome = (code, home, away, isStructuralBye = false) => {
    if (isStructuralBye) return { winner: home || null, loser: 'BYE', score: 'BYE' };
    if (!home || !away) return { winner: null, loser: null, score: '' };
    const result = saved[code];
    if (!result || result.status !== 'Tamat' || result.homeScore === '' || result.awayScore === '') return { winner: null, loser: null, score: '' };
    const homeScore = Number(result.homeScore);
    const awayScore = Number(result.awayScore);
    if (Number.isNaN(homeScore) || Number.isNaN(awayScore) || homeScore === awayScore) return { winner: null, loser: null, score: `${result.homeScore}-${result.awayScore}` };
    return { winner: homeScore > awayScore ? home : away, loser: homeScore > awayScore ? away : home, score: `${homeScore}-${awayScore}` };
  };
  const rowHeight = 112;
  const top = 74;
  const rows = KNOCKOUT_OPENING.map(([homeCode, awayCode], index) => {
    const code = `P${index + 1}`;
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
    label: row.code,
    bye: !row.awayCode,
    ...matchOutcome(row.code, row.home, row.away, !row.awayCode),
  }));
  const mid = (items) => items.reduce((sum, item) => sum + item.y, 0) / items.length;
  const makeStage = (source, count, labelPrefix, codePrefix, startNumber = 0) => Array.from({ length: count }, (_, index) => {
    const homeSource = source[index * 2] || null;
    const awaySource = source[index * 2 + 1] || null;
    const home = homeSource?.winner || null;
    const away = awaySource?.winner || null;
    const number = startNumber + index + 1;
    const code = `${codePrefix}-${number}`;
    return {
      y: mid(source.slice(index * 2, index * 2 + 2)),
      label: `${labelPrefix}-${number}`,
      code,
      homeSource,
      awaySource,
      ...matchOutcome(code, home, away),
    };
  });
  const p32 = makeStage(openingNodes, 16, 'P32', 'P32');
  const p16 = makeStage(p32, 8, 'P16', 'P16');
  const suku = makeStage(p16, 4, 'SUKU', 'SUKU').map((node, index) => ({ ...node, label: `SUKU ${index + 1}` }));
  const separuh = makeStage(suku, 2, 'SEPARUH', 'SEPARUH').map((node, index) => ({ ...node, label: `SEPARUH ${index + 1}` }));
  const finalY = (separuh[0].y + separuh[1].y) / 2;
  const height = top * 2 + (rows.length - 1) * rowHeight;
  const x = { row: 52, p32: 450, p16: 790, suku: 1130, separuh: 1470, final: 1810 };
  const slotName = (code) => (generated && qualifiers[code]?.name) || qualifierSlotLabel(code);
  const rowScore = (row, side) => {
    const result = saved[row.code];
    const hasScore = result?.status === 'Tamat' && result.homeScore !== '' && result.awayScore !== '';
    if (hasScore) return side === 'home' ? result.homeScore : result.awayScore;
    if (!row.awayCode && side === 'away') return 'BYE';
    return '';
  };
  const scorePair = (code, bye = false) => {
    const result = saved[code];
    if (result?.status === 'Tamat' && result.homeScore !== '' && result.awayScore !== '') return [result.homeScore, result.awayScore];
    return ['', bye ? 'BYE' : ''];
  };
  const sourceName = (source) => {
    if (source?.winner?.name) return source.winner.name;
    if (source?.bye) return `Laluan ${source.label}`;
    return source?.label ? `Pemenang ${source.label}` : 'Menunggu';
  };
  const sourceLogo = (source) => source?.winner?.logo || null;
  const trimCardName = (name) => (name || 'Menunggu').length > 33 ? `${name.slice(0, 32)}...` : name;
  const bracketPath = (source, targetY, fromX, elbowX, toX) => [
    ...source.map((item) => `M ${fromX} ${item.y} H ${elbowX}`),
    `M ${elbowX} ${source[0].y} V ${source[source.length - 1].y}`,
    `M ${elbowX} ${targetY} H ${toX}`,
  ].join(' ');
  const nodeX = (label, map = x) => label.startsWith('P32') ? map.p32 : label.startsWith('P16') ? map.p16 : label.startsWith('SUKU') ? map.suku : map.separuh;
  const cardW = 315;
  const cardH = 72;
  const scoreW = 42;
  const renderMatchCard = ({ xPos, y, code, homeName, awayName, homeLogo = null, awayLogo = null, homeScore = '', awayScore = '', bye = false, winner = null, className = '' }) => (
    <g className={`modern-match-card ${bye ? 'is-bye-card' : ''} ${winner ? 'has-winner' : ''} ${className}`} key={`${code}-${xPos}-${y}`}>
      <text className="match-code-label" x={xPos} y={y - cardH / 2 - 8}>{code}</text>
      <rect className="match-card-shell" x={xPos} y={y - cardH / 2} width={cardW} height={cardH} rx="10" />
      <line className="match-card-divider" x1={xPos} y1={y} x2={xPos + cardW} y2={y} />
      <rect className="match-score-block" x={xPos + cardW - scoreW} y={y - cardH / 2} width={scoreW} height={cardH} rx="8" />
      <circle className="match-vs-dot" cx={xPos + cardW - scoreW} cy={y} r="12" />
      <text className="match-vs-text" x={xPos + cardW - scoreW} y={y + 4} textAnchor="middle">vs</text>
      {homeLogo ? <image href={homeLogo} x={xPos + 10} y={y - 28} width="20" height="20" preserveAspectRatio="xMidYMid meet" /> : <circle cx={xPos + 20} cy={y - 18} r="10" fill="var(--color-bg-base)" stroke="var(--color-border)" />}
      {awayLogo && !bye ? <image href={awayLogo} x={xPos + 10} y={y + 12} width="20" height="20" preserveAspectRatio="xMidYMid meet" /> : !bye ? <circle cx={xPos + 20} cy={y + 22} r="10" fill="var(--color-bg-base)" stroke="var(--color-border)" /> : null}
      <text className="match-card-team" x={xPos + 38} y={y - 13}>{trimCardName(homeName)}</text>
      <text className="match-card-team" x={xPos + (bye ? 16 : 38)} y={y + 27}>{trimCardName(awayName)}</text>
      <text className="match-card-score" x={xPos + cardW - scoreW / 2} y={y - 13} textAnchor="middle">{homeScore}</text>
      <text className="match-card-score" x={xPos + cardW - scoreW / 2} y={y + 27} textAnchor="middle">{awayScore}</text>
    </g>
  );
  const renderStageCard = (node, map = x) => {
    const [homeScore, awayScore] = scorePair(node.code);
    return renderMatchCard({
      xPos: nodeX(node.label, map),
      y: node.y,
      code: node.label,
      homeName: sourceName(node.homeSource),
      awayName: sourceName(node.awaySource),
      homeLogo: sourceLogo(node.homeSource),
      awayLogo: sourceLogo(node.awaySource),
      homeScore,
      awayScore,
      winner: node.winner,
    });
  };
  const buildSide = (start, sideName) => {
    const offset = rows[start]?.y - top;
    const sideRows = rows.slice(start, start + 16).map((row) => ({ ...row, y: row.y - offset }));
    const sideOpening = sideRows.map((row) => ({
      y: row.y,
      label: row.code,
      bye: !row.awayCode,
      ...matchOutcome(row.code, row.home, row.away, !row.awayCode),
    }));
    const sideP32 = makeStage(sideOpening, 8, 'P32', 'P32', start === 0 ? 0 : 8);
    const sideP16 = makeStage(sideP32, 4, 'P16', 'P16', start === 0 ? 0 : 4);
    const sideSuku = makeStage(sideP16, 2, 'SUKU', 'SUKU', start === 0 ? 0 : 2).map((node, index) => ({ ...node, label: `SUKU ${start === 0 ? index + 1 : index + 3}` }));
    const sideSeparuh = makeStage(sideSuku, 1, 'SEPARUH', 'SEPARUH', start === 0 ? 0 : 1).map((node) => ({ ...node, label: `SEPARUH ${start === 0 ? 1 : 2}` }));
    return { sideName, sideRows, sideOpening, sideP32, sideP16, sideSuku, sideSeparuh };
  };
  const sideHeight = top * 2 + 15 * rowHeight;
  const sideX = { row: 390, p32: 750, p16: 1110, suku: 1110, separuh: 1350 };
  const sideXReverse = { row: 2150, p32: 1790, p16: 1430, suku: 1430, separuh: 1220 };
  const leftSide = buildSide(0, 'Bahagian Kiri');
  const rightSide = buildSide(16, 'Bahagian Kanan');
  const connectorPath = (source, targetY, sourceX, targetX, reverse = false) => {
    const sourceEdge = reverse ? sourceX : sourceX + cardW;
    const targetEdge = reverse ? targetX + cardW : targetX;
    const elbow = reverse
      ? Math.min(sourceEdge - 30, targetEdge + 42)
      : Math.max(sourceEdge + 30, targetEdge - 42);
    return bracketPath(source, targetY, sourceEdge, elbow, targetEdge);
  };
  const renderBracketSide = (side, reverse = false) => {
    const map = reverse ? sideXReverse : sideX;
    return (
      <g key={side.sideName}>
        {side.sideP32.map((node, index) => <path className="bracket-line" key={`p32-line-${side.sideName}-${node.label}`} d={connectorPath(side.sideOpening.slice(index * 2, index * 2 + 2), node.y, map.row, map.p32, reverse)} />)}
        {side.sideP16.map((node, index) => <path className="bracket-line" key={`p16-line-${side.sideName}-${node.label}`} d={connectorPath(side.sideP32.slice(index * 2, index * 2 + 2), node.y, map.p32, map.p16, reverse)} />)}
        {side.sideSuku.map((node, index) => <path className="bracket-line" key={`suku-line-${side.sideName}-${node.label}`} d={connectorPath(side.sideP16.slice(index * 2, index * 2 + 2), node.y, map.p16, map.suku, reverse)} />)}
        {side.sideSeparuh.map((node, index) => <path className="bracket-line final-line" key={`separuh-line-${side.sideName}-${node.label}`} d={connectorPath(side.sideSuku.slice(index * 2, index * 2 + 2), node.y, map.suku, map.separuh, reverse)} />)}
        {side.sideRows.map((row) => renderMatchCard({
          xPos: map.row,
          y: row.y,
          code: row.code,
          homeName: slotName(row.homeCode),
          awayName: row.awayCode ? slotName(row.awayCode) : 'BYE - Lolos Terus',
          homeLogo: row.home?.logo,
          awayLogo: row.away?.logo,
          homeScore: rowScore(row, 'home'),
          awayScore: rowScore(row, 'away'),
          bye: !row.awayCode,
          winner: side.sideOpening.find((node) => node.y === row.y)?.winner,
        }))}
        {[side.sideP32, side.sideP16, side.sideSuku, side.sideSeparuh].flat().map((node) => renderStageCard(node, map))}
      </g>
    );
  };
  const finalSources = [leftSide.sideSeparuh[0], rightSide.sideSeparuh[0]];
  const [finalHomeScore, finalAwayScore] = scorePair('FINAL-1');
  const cupWidth = 2720;
  const cupHeight = sideHeight + 250;
  const earlyCanvas = { x: 330, width: 2360, height: sideHeight };
  const finalX = 1235;
  const cupFinalY = (leftSide.sideSuku[0].y + leftSide.sideSuku[1].y) / 2;
  const plateTop = cupFinalY + 300;
  const plateSemiY = plateTop + 124;
  const plateFinalY = plateTop + 214;
  const renderRoundHeader = (xPos, label, anchor = 'middle') => (
    <text className="bracket-round-heading" x={xPos} y="24" textAnchor={anchor}>{label}</text>
  );
  const drawCupFinalLine = () => {
    const leftEdge = sideX.separuh + cardW;
    const rightEdge = sideXReverse.separuh;
    const finalLeft = finalX;
    const finalRight = finalX + cardW;
    return <>
      <path className="bracket-line final-line" d={`M ${leftEdge} ${leftSide.sideSeparuh[0].y} H ${finalLeft - 34} V ${cupFinalY} H ${finalLeft}`} />
      <path className="bracket-line final-line" d={`M ${rightEdge} ${rightSide.sideSeparuh[0].y} H ${finalRight + 34} V ${cupFinalY} H ${finalRight}`} />
    </>;
  };
  const renderEarlySide = (side, reverse = false) => {
    const map = reverse ? sideXReverse : sideX;
    return <g key={`${side.sideName}-early`}>
      {side.sideP32.map((node, index) => <path className="bracket-line" key={`early-p32-line-${side.sideName}-${node.label}`} d={connectorPath(side.sideOpening.slice(index * 2, index * 2 + 2), node.y, map.row, map.p32, reverse)} />)}
      {side.sideP16.map((node, index) => <path className="bracket-line" key={`early-p16-line-${side.sideName}-${node.label}`} d={connectorPath(side.sideP32.slice(index * 2, index * 2 + 2), node.y, map.p32, map.p16, reverse)} />)}
      {side.sideRows.map((row) => renderMatchCard({
        xPos: map.row,
        y: row.y,
        code: row.code,
        homeName: slotName(row.homeCode),
        awayName: row.awayCode ? slotName(row.awayCode) : 'BYE - Lolos Terus',
        homeLogo: row.home?.logo,
        awayLogo: row.away?.logo,
        homeScore: rowScore(row, 'home'),
        awayScore: rowScore(row, 'away'),
        bye: !row.awayCode,
        winner: side.sideOpening.find((node) => node.y === row.y)?.winner,
      }))}
      {[side.sideP32, side.sideP16].flat().map((node) => renderStageCard(node, map))}
    </g>;
  };
  const finalMap = {
    plateChampion: 130,
    plateFinal: 480,
    plateSemi: 840,
    suku: 1210,
    cupSemi: 1580,
    cupFinal: 1950,
    cupChampion: 2340,
    q1: 132,
    q2: 262,
    q3: 392,
    q4: 522,
    topSemi: 197,
    bottomSemi: 457,
    finalY: 327,
    championY: 327,
    plateY: 327,
  };
  const finalCanvasWidth = 2750;
  const finalCanvasHeight = 650;
  const renderFinalBracket = () => {
    const finalNode = matchOutcome('FINAL-1', finalSources[0]?.winner || null, finalSources[1]?.winner || null);

    const plateSemi1Home = suku[0]?.loser || null;
    const plateSemi1Away = suku[1]?.loser || null;
    const plateSemi1Outcome = matchOutcome('PLATE-SF-1', plateSemi1Home, plateSemi1Away);

    const plateSemi2Home = suku[2]?.loser || null;
    const plateSemi2Away = suku[3]?.loser || null;
    const plateSemi2Outcome = matchOutcome('PLATE-SF-2', plateSemi2Home, plateSemi2Away);

    const plateFinalHome = plateSemi1Outcome.winner;
    const plateFinalAway = plateSemi2Outcome.winner;
    const plateFinalOutcome = matchOutcome('FINAL-PLATE', plateFinalHome, plateFinalAway);

    const qNodes = suku.map((node, index) => ({
      node,
      y: [finalMap.q1, finalMap.q2, finalMap.q3, finalMap.q4][index],
    }));
    const semiNodes = [
      { node: separuh[0], y: finalMap.topSemi },
      { node: separuh[1], y: finalMap.bottomSemi },
    ];
    const bracketJoin = (fromYs, targetY, sourceX, targetX) => {
      const elbow = Math.round((sourceX + targetX) / 2);
      const topY = Math.min(...fromYs);
      const bottomY = Math.max(...fromYs);
      return [
        ...fromYs.map((y) => `M ${sourceX} ${y} H ${elbow}`),
        `M ${elbow} ${topY} V ${bottomY}`,
        `M ${elbow} ${targetY} H ${targetX}`,
      ].join(' ');
    };
    const rightJoin = bracketJoin;
    const leftJoin = bracketJoin;
    const simpleBox = ({ xPos, y, code, homeName, awayName, homeLogo, awayLogo, className = '' }) => renderMatchCard({
      xPos,
      y,
      code,
      homeName,
      awayName,
      homeLogo,
      awayLogo,
      className,
    });
    const championCard = (team, xPos, y, label, extraClass = '') => {
      const isWinner = !!team;
      const isPlate = extraClass.includes('plate');
      
      return (
        <foreignObject x={xPos - 50} y={y - 140} width="380" height="320" style={{ overflow: 'visible' }}>
          <div xmlns="http://www.w3.org/1999/xhtml" className={`cyber-champ-card ${isWinner ? 'has-winner' : ''} ${extraClass}`}>
             
             {isWinner ? (
               <div className="cyber-champ-panel">
                 <div className="cyber-panel-border cyber-shape"></div>
                 <div className="cyber-panel-bg cyber-shape"></div>
                 
                 <div className="cyber-icon-mount">
                   <div className="cyber-icon-glow"></div>
                   <div className="cyber-wreath"></div>
                   <div className={`cyber-icon-svg ${isPlate ? 'is-plate' : 'is-cup'}`}>
                      {isPlate ? (
                        <FontAwesomeIcon icon={faMedal} />
                      ) : (
                        <FontAwesomeIcon icon={faTrophy} />
                      )}
                   </div>
                 </div>

                 <div className="cyber-content">
                   <div className="cyber-subtitle">
                     <span className="cyber-diamond">✦</span> {label} <span className="cyber-diamond">✦</span>
                   </div>
                   
                   <div className="cyber-team-name">
                     {compactBracketName(team.name)}
                   </div>
                   
                   <div className="cyber-divider"></div>
                   
                   <div className="cyber-year">
                     <span className="cyber-diamond-sm">♦</span> TAHUN 2026 <span className="cyber-diamond-sm">♦</span>
                   </div>
                 </div>
               </div>
             ) : (
               <div className="cyber-champ-waiting">
                 <div className="cyber-panel-border cyber-shape" style={{opacity: 0.3, background: '#143545'}}></div>
                 <div className="cyber-panel-bg cyber-shape" style={{background: '#091a24'}}></div>
                 <FontAwesomeIcon icon={faClock} className="cyber-waiting-icon"/>
                 <div className="cyber-waiting-text">SISTEM MENUNGGU</div>
               </div>
             )}
          </div>
        </foreignObject>
      );
    };
    return <>
      <text className="bracket-round-heading" x={finalMap.plateFinal + cardW / 2} y="36" textAnchor="middle">AKHIR</text>
      <text className="bracket-round-heading" x={finalMap.plateSemi + cardW / 2} y="36" textAnchor="middle">SEPARUH AKHIR</text>
      <text className="bracket-round-heading" x={finalMap.suku + cardW / 2} y="36" textAnchor="middle">SUKU AKHIR</text>
      <text className="bracket-round-heading" x={finalMap.cupSemi + cardW / 2} y="36" textAnchor="middle">SEPARUH AKHIR</text>
      <text className="bracket-round-heading" x={finalMap.cupFinal + cardW / 2} y="36" textAnchor="middle">AKHIR</text>
      <text className="bracket-center-title cup-label" x={finalMap.cupFinal + cardW / 2} y="92" textAnchor="middle">CUP</text>
      <text className="bracket-center-title plate-title" x={finalMap.plateFinal + cardW / 2} y="92" textAnchor="middle">PLATE</text>

      <path className="bracket-line final-line" d={rightJoin([finalMap.q1, finalMap.q2], finalMap.topSemi, finalMap.suku + cardW, finalMap.cupSemi)} />
      <path className="bracket-line final-line" d={rightJoin([finalMap.q3, finalMap.q4], finalMap.bottomSemi, finalMap.suku + cardW, finalMap.cupSemi)} />
      <path className="bracket-line final-line" d={rightJoin([finalMap.topSemi, finalMap.bottomSemi], finalMap.finalY, finalMap.cupSemi + cardW, finalMap.cupFinal)} />
      <path className="bracket-line final-line" d={`M ${finalMap.cupFinal + cardW} ${finalMap.finalY} H ${finalMap.cupChampion}`} />

      <path className="bracket-line final-line" d={leftJoin([finalMap.q1, finalMap.q2], finalMap.topSemi, finalMap.suku, finalMap.plateSemi + cardW)} />
      <path className="bracket-line final-line" d={leftJoin([finalMap.q3, finalMap.q4], finalMap.bottomSemi, finalMap.suku, finalMap.plateSemi + cardW)} />
      <path className="bracket-line final-line" d={leftJoin([finalMap.topSemi, finalMap.bottomSemi], finalMap.plateY, finalMap.plateSemi, finalMap.plateFinal + cardW)} />
      <path className="bracket-line final-line" d={`M ${finalMap.plateFinal} ${finalMap.plateY} H ${finalMap.plateChampion + 240}`} />

      {qNodes.map(({ node, y }) => {
        const [homeScore, awayScore] = scorePair(node.code);
        return renderMatchCard({
          xPos: finalMap.suku,
          y,
          code: node.label,
          homeName: sourceName(node.homeSource),
          awayName: sourceName(node.awaySource),
          homeLogo: sourceLogo(node.homeSource),
          awayLogo: sourceLogo(node.awaySource),
          homeScore,
          awayScore,
          winner: node.winner,
        });
      })}
      {semiNodes.map(({ node, y }) => {
        const [homeScore, awayScore] = scorePair(node.code);
        return renderMatchCard({
          xPos: finalMap.cupSemi,
          y,
          code: node.label,
          homeName: sourceName(node.homeSource),
          awayName: sourceName(node.awaySource),
          homeLogo: sourceLogo(node.homeSource),
          awayLogo: sourceLogo(node.awaySource),
          homeScore,
          awayScore,
          winner: node.winner,
        });
      })}
      {renderMatchCard({
        xPos: finalMap.cupFinal,
        y: finalMap.finalY,
        code: 'FINAL CUP',
        homeName: sourceName(finalSources[0]),
        awayName: sourceName(finalSources[1]),
        homeLogo: sourceLogo(finalSources[0]),
        awayLogo: sourceLogo(finalSources[1]),
        homeScore: finalHomeScore,
        awayScore: finalAwayScore,
        winner: finalNode.winner,
        className: 'modern-final-card',
      })}
      {renderMatchCard({
        xPos: finalMap.plateSemi,
        y: finalMap.topSemi,
        code: 'PLATE-SF-1',
        homeName: sourceName({ winner: plateSemi1Home }),
        awayName: sourceName({ winner: plateSemi1Away }),
        homeLogo: plateSemi1Home?.logo,
        awayLogo: plateSemi1Away?.logo,
        homeScore: plateSemi1Outcome.score ? plateSemi1Outcome.score.split('-')[0] : '',
        awayScore: plateSemi1Outcome.score ? plateSemi1Outcome.score.split('-')[1] : '',
        winner: plateSemi1Outcome.winner,
        className: 'plate-match-card',
      })}
      {renderMatchCard({
        xPos: finalMap.plateSemi,
        y: finalMap.bottomSemi,
        code: 'PLATE-SF-2',
        homeName: sourceName({ winner: plateSemi2Home }),
        awayName: sourceName({ winner: plateSemi2Away }),
        homeLogo: plateSemi2Home?.logo,
        awayLogo: plateSemi2Away?.logo,
        homeScore: plateSemi2Outcome.score ? plateSemi2Outcome.score.split('-')[0] : '',
        awayScore: plateSemi2Outcome.score ? plateSemi2Outcome.score.split('-')[1] : '',
        winner: plateSemi2Outcome.winner,
        className: 'plate-match-card',
      })}
      {renderMatchCard({
        xPos: finalMap.plateFinal,
        y: finalMap.plateY,
        code: 'FINAL-PLATE',
        homeName: sourceName({ winner: plateFinalHome }),
        awayName: sourceName({ winner: plateFinalAway }),
        homeLogo: plateFinalHome?.logo,
        awayLogo: plateFinalAway?.logo,
        homeScore: plateFinalOutcome.score ? plateFinalOutcome.score.split('-')[0] : '',
        awayScore: plateFinalOutcome.score ? plateFinalOutcome.score.split('-')[1] : '',
        winner: plateFinalOutcome.winner,
        className: 'plate-match-card plate-final-card',
      })}
      {championCard(finalNode.winner, finalMap.cupChampion, finalMap.championY, 'JOHAN CUP')}
      {championCard(plateFinalOutcome.winner, finalMap.plateChampion, finalMap.championY, 'JOHAN PLATE', 'plate-winner-card')}
    </>;
  };
  return <section className="classic-bracket-panel modern-bracket-panel">
    <div className="classic-bracket-scroll modern-bracket-scroll">
      <svg
        className="modern-bracket-svg modern-bracket-cup-svg"
        style={{ '--bracket-canvas-width': `${phase === 'early' ? earlyCanvas.width : finalCanvasWidth}px` }}
        viewBox={phase === 'early' ? `${earlyCanvas.x} 0 ${earlyCanvas.width} ${earlyCanvas.height}` : `0 0 ${finalCanvasWidth} ${finalCanvasHeight}`}
        role="img"
        aria-label="Bracket kalah singkir Cup dan Plate"
      >
        <defs>
          <linearGradient id="bracketLine" x1="0" x2="1"><stop offset="0%" stopColor="#0aa4b5" /><stop offset="55%" stopColor="#34d7e8" /><stop offset="100%" stopColor="#d6ff3f" /></linearGradient>
          <filter id="bracketGlow" x="-35%" y="-35%" width="170%" height="170%"><feDropShadow dx="0" dy="0" stdDeviation="3.5" floodColor="#19cde0" floodOpacity=".45" /></filter>
          <radialGradient id="winnerRadial"><stop offset="0%" stopColor="#d6ff3f" stopOpacity="0.4" /><stop offset="60%" stopColor="#d6ff3f" stopOpacity="0.1" /><stop offset="100%" stopColor="#d6ff3f" stopOpacity="0" /></radialGradient>
          <linearGradient id="goldGradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#ffee55"/><stop offset="50%" stopColor="#f3c22b"/><stop offset="100%" stopColor="#c59811"/></linearGradient>
          <linearGradient id="silverGradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#f4f9f7"/><stop offset="50%" stopColor="#a7c0bc"/><stop offset="100%" stopColor="#7a9b96"/></linearGradient>
        </defs>
        <rect className="bracket-bg" x="0" y="0" width={cupWidth} height={phase === 'early' ? sideHeight : finalCanvasHeight} rx="28" />
        {phase === 'early' ? <>
          {renderRoundHeader(sideX.row + cardW / 2, 'PUSINGAN 64')}
          {renderRoundHeader(sideX.p32 + cardW / 2, 'PUSINGAN 32')}
          {renderRoundHeader(sideX.p16 + cardW / 2, 'PUSINGAN 16')}
          {renderRoundHeader(sideXReverse.p16 + cardW / 2, 'PUSINGAN 16')}
          {renderRoundHeader(sideXReverse.p32 + cardW / 2, 'PUSINGAN 32')}
          {renderRoundHeader(sideXReverse.row + cardW / 2, 'PUSINGAN 64')}
          {renderEarlySide(leftSide)}
          {renderEarlySide(rightSide, true)}
        </> : renderFinalBracket()}
      </svg>
    </div>
  </section>;
}

function Knockout({ standings, data }) {
  const [mobileSide, setMobileSide] = useState('left');
  const [bracketPhase, setBracketPhase] = useState('early');
  const generated = Boolean(data.settings?.knockoutGenerated);
  const qualifiers = generated ? knockoutQualifiers(data, standings) : {};
  const opening = KNOCKOUT_OPENING.map(([homeCode, awayCode], index) => ({ homeCode, awayCode, code: `P${index + 1}` }));
  return <div className="page-stack knockout-page">
    <div className="knockout-page-head">
      <div><span><FontAwesomeIcon icon={faFlagCheckered} /> FORMAT KALAH SINGKIR</span><h1>Laluan Kejuaraan</h1><p>58 pasukan terbaik berentap dalam laluan kalah singkir menuju gelaran juara. Pasukan di kedudukan 1 hingga 6 diberi laluan terus ke pusingan seterusnya.</p></div>
      <div className="knockout-head-stats"><div><strong>58</strong><span>PASUKAN</span></div><div><strong>6</strong><span>BYE</span></div><div><strong>1</strong><span>JUARA</span></div></div>
    </div>
    <div className={`knockout-note ${generated ? '' : 'waiting-generation'}`}><FontAwesomeIcon icon={faBolt} /><strong>{generated ? 'Pusingan 64' : 'Slot Kalah Mati Belum Diisi'}</strong><span>{generated ? 'Susunan seed dijana daripada kedudukan keseluruhan semasa.' : 'Nama pasukan akan dipaparkan selepas semua perlawanan kumpulan selesai dan admin menekan Jana Perlawanan Kalah Mati.'}</span></div>
    <div className="knockout-inner-tabs">
      <button className={bracketPhase === 'early' ? 'active' : ''} onClick={() => setBracketPhase('early')}>
        <strong>Peringkat 64 - 16</strong>
        <span>Pusingan 64, pusingan 32 dan pusingan 16</span>
      </button>
      <button className={bracketPhase === 'finals' ? 'active' : ''} onClick={() => setBracketPhase('finals')}>
        <strong>Peringkat Suku Akhir - Akhir</strong>
        <span>Suku akhir, separuh akhir dan akhir</span>
      </button>
    </div>
    <ModernBracket qualifiers={qualifiers} generated={generated} data={data} phase={bracketPhase} />
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
  const [statsView, setStatsView] = useState('groups');
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
    <div className="stats-tabs">
      <button className={statsView === 'groups' ? 'active' : ''} onClick={() => setStatsView('groups')}><FontAwesomeIcon icon={faLayerGroup} /><strong>Kedudukan Kumpulan</strong><span>Semua pasukan mengikut kumpulan</span></button>
      <button className={statsView === 'champions' ? 'active' : ''} onClick={() => setStatsView('champions')}><FontAwesomeIcon icon={faTrophy} /><strong>Johan Kumpulan</strong><span>Ranking tempat pertama ikut mata dan beza mata</span></button>
      <button className={statsView === 'runners' ? 'active' : ''} onClick={() => setStatsView('runners')}><FontAwesomeIcon icon={faMedal} /><strong>Naib Johan Kumpulan</strong><span>Ranking tempat kedua ikut mata dan beza mata</span></button>
    </div>
    {statsView === 'groups' && <div className="group-standings-tools"><label className="search"><FontAwesomeIcon icon={faSearch} /><input placeholder="Cari sekolah atau regu..." value={query} onChange={(e) => setQuery(e.target.value)} /></label><select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}><option value="">Semua Kumpulan</option>{data.groups.map((g) => <option value={g.id} key={g.id}>{g.name}</option>)}</select></div>}
    {statsView === 'champions' && <RankingTable rows={qualifiers(0)} eyebrow="TEMPAT PERTAMA SETIAP KUMPULAN" title="Ranking Johan Kumpulan" />}
    {statsView === 'runners' && <RankingTable rows={qualifiers(1)} eyebrow="TEMPAT KEDUA SETIAP KUMPULAN" title="Ranking Naib Johan Kumpulan" />}
    {statsView === 'groups' && <div className="group-standings-grid">{groups.map((group, groupIndex) => {
      const teamIds = new Set(group.teamIds);
      const rows = standings.filter((team) => teamIds.has(team.id));
      return <article className="group-standing-card" key={group.id}>
        <div className="group-standing-title"><div><span>KUMPULAN</span><strong>{String(groupIndex + 1).padStart(2, '0')}</strong></div><h2>{group.name}</h2><span>{rows.filter((r) => r.mp > 0).length}/3 telah bermain</span></div>
        <div className="group-standing-labels"><span>#</span><span>PASUKAN</span><span>MP</span><span>W</span><span>L</span><span>GD</span><span>PTS</span></div>
        <div className="group-standing-rows">{rows.map((team, index) => <div className={index === 0 ? 'group-leader' : ''} key={team.id}>
          <span className={`rank n${index + 1}`}>{index + 1}</span><div className="group-team"><TeamLogo team={team} /><strong>{team.name}</strong>{index === 0 && <FontAwesomeIcon icon={faMedal} />}</div><span>{team.mp}</span><span>{team.w}</span><span>{team.l}</span><span>{team.gd > 0 ? '+' : ''}{team.gd}</span><b>{team.p}</b>
        </div>)}</div>
      </article>;
    })}</div>}
  </div>;
}

export default function App() {
  const firebaseHydrated = useRef(!isFirebaseConfigured());
  const ignoreRemoteUntil = useRef(0);
  const isRemoteUpdate = useRef(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);
  const [data, setData] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      const expectedTeams = seedData().teams.length;
      if (!localStorage.getItem(ROSTER_VERSION_KEY)) {
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
  const commitReset = (createNextData) => {
    const nextData = repairStoredData(createNextData(data));
    const resetData = {
      ...nextData,
      settings: {
        ...nextData.settings,
        lastResetAt: new Date().toISOString(),
      },
    };
    const persistedResetData = prepareTournamentForStorage(resetData);
    ignoreRemoteUntil.current = Date.now() + 3000;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedResetData));
    localStorage.setItem(ROSTER_VERSION_KEY, 'done');
    localStorage.setItem(KNOCKOUT_GATE_VERSION_KEY, 'done');
    if (!resetData.schools.some((school) => school.logo)) localStorage.setItem(LOGO_CLEANUP_KEY, 'done');
    setData(resetData);
    if (isFirebaseConfigured()) {
      saveTournament(persistedResetData).catch((error) => console.error('Reset tidak dapat sync ke Firebase.', error));
    }
  };
  useEffect(() => {
    if (!isFirebaseConfigured()) return undefined;
    const unsubscribe = subscribeToTournament((remoteData) => {
      if (window.__FIREBASE_QUOTA_EXCEEDED__) return;
      firebaseHydrated.current = true;
      if (Date.now() < ignoreRemoteUntil.current) return;
      if (remoteData && isOlderThanLocalReset(remoteData)) {
        const localData = getLocalTournamentData();
        if (localData) {
          saveTournament(localData).catch((error) => {
            console.error('Reset tempatan tidak dapat dihantar semula ke Firebase.', error);
            if (error?.code === 'resource-exhausted') window.__FIREBASE_QUOTA_EXCEEDED__ = true;
          });
        }
        return;
      }
      if (remoteData) {
        setData((currentData) => {
          const incomingData = repairStoredData(remoteData);
          const sanitize = (d) => {
            const { updatedAt, ...rest } = d;
            return JSON.stringify(prepareTournamentForStorage(rest));
          };
          const currentJson = sanitize(currentData);
          const incomingJson = sanitize(incomingData);
          if (currentJson !== incomingJson) {
            isRemoteUpdate.current = true;
            return incomingData;
          }
          return currentData;
        });
      } else {
        saveTournament(getLocalTournamentData() || data).catch((error) => {
          console.error('Firebase belum dapat dimulakan.', error);
          if (error?.code === 'resource-exhausted') window.__FIREBASE_QUOTA_EXCEEDED__ = true;
        });
      }
    }, (error) => {
      firebaseHydrated.current = true;
      console.error('Firebase sync gagal.', error);
      if (error?.code === 'resource-exhausted') window.__FIREBASE_QUOTA_EXCEEDED__ = true;
    });
    return () => unsubscribe();
  }, []);
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      try {
        const persistedData = prepareTournamentForStorage(data);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedData));
        if (isFirebaseConfigured() && firebaseHydrated.current && !window.__FIREBASE_QUOTA_EXCEEDED__) {
          if (isRemoteUpdate.current) {
            isRemoteUpdate.current = false;
          } else {
            saveTournament(persistedData).catch((error) => {
              console.error('Tidak dapat sync ke Firebase.', error);
              if (error?.code === 'resource-exhausted') window.__FIREBASE_QUOTA_EXCEEDED__ = true;
            });
          }
        }
      } catch (error) {
        console.error('Tidak dapat menyimpan data kejohanan.', error);
        const compactData = removeOversizedLogos(data);
        const persistedCompactData = prepareTournamentForStorage(compactData);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedCompactData));
          setData(compactData);
        } catch (storageError) {
          console.error('Storan browser masih penuh selepas logo besar dibuang.', storageError);
          const logoFreeData = removeOversizedLogos(compactData, true);
          const persistedLogoFreeData = prepareTournamentForStorage(logoFreeData);
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedLogoFreeData));
            setData(logoFreeData);
          } catch (finalStorageError) {
            console.error('Storan browser masih penuh selepas semua logo dibuang.', finalStorageError);
          }
        }
      }
    }, 1500);
    return () => clearTimeout(timeoutId);
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
  const bracket = useKnockoutBracket(data, standings);
  const printPdf = () => {
    window.print();
  };
  const page = active === 'dashboard' ? <Dashboard {...{ data, setData, standings, teamById, groupById, bracket, isAdmin }} />
    : active === 'schools' ? <Schools {...{ data, setData, isAdmin }} />
    : active === 'groups' ? <Groups {...{ data, setData, teamById, isAdmin }} />
    : active === 'matches' ? <Matches {...{ data, setData, teamById, groupById, standings, bracket, isAdmin }} />
    : active === 'knockout' ? <Knockout {...{ standings, data, bracket }} />
    : <Stats {...{ data, standings, teamById }} />;
  return <div className="app-shell">
    <aside className={menuOpen ? 'open' : ''}><div className="brand"><span><FontAwesomeIcon icon={faFutbol} /></span><div><strong>TAKRAW</strong><small>MSSD HULU LANGAT</small></div></div>
      <nav>
        {navItems.map((item) => {
          if (!isAdmin && (item.id === 'schools' || item.id === 'groups')) return null;
          return <button className={active === item.id ? 'active' : ''} key={item.id} onClick={() => { setActive(item.id); setMenuOpen(false); }}><FontAwesomeIcon icon={item.icon} /><span>{item.label}</span></button>;
        })}
        {isAdmin && <button className="admin-nav-button" onClick={() => { setResetOpen(true); setMenuOpen(false); }}><FontAwesomeIcon icon={faGaugeHigh} /><span>Admin</span><b>Pusat Reset</b></button>}
      </nav>
      <div className="side-card"><FontAwesomeIcon icon={faFire} /><strong>Tahun 2026</strong><span>Sistem kejohanan aktif</span><div><i /></div></div>
    </aside>
    <main><header><button className="menu-btn" onClick={() => setMenuOpen(!menuOpen)}><FontAwesomeIcon icon={faBars} /></button><div><span>Selamat datang,</span><strong>Urusetia Kejohanan</strong></div><div className="header-actions"><div className="system-live"><i /> SISTEM LIVE</div>{active === 'matches' && <PrintButton onClick={printPdf} />}<button onClick={() => isAdmin ? setIsAdmin(false) : setAdminLoginOpen(true)} className={`btn ${isAdmin ? 'primary' : 'ghost'}`} style={{ marginLeft: 8 }}>{isAdmin ? 'Tutup Admin' : 'Buka Admin'}</button><span className="avatar">UK</span></div></header>
      <div className="content" ref={printRef}>{page}</div>
    </main>
    {resetOpen && <AdminResetModal {...{ data, commitReset }} onClose={() => setResetOpen(false)} />}
    {adminLoginOpen && <AdminLoginModal onLogin={() => { setIsAdmin(true); setAdminLoginOpen(false); }} onClose={() => setAdminLoginOpen(false)} />}
  </div>;
}
