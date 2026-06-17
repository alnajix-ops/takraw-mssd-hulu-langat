const TEAM_NAMES = [
  'SK Bandar Seri Putra A', 'SK Bandar Seri Putra B', 'SK Bandar Seri Putra C',
  'SK Taman Rakan A', 'SK Taman Rakan B', 'SK Bandar Tun Hussein Onn',
  'SK Rinching Hilir A', 'SK Rinching Hilir B', 'SK Desa Baiduri A', 'SK Desa Baiduri B', 'SK Desa Baiduri C',
  'SK Dusun Nanding A', 'SK Dusun Nanding B', 'SK Dusun Nanding C', 'SK Kajang A', 'SK Kajang B',
  'SK Bandar Sunway Semenyih A', 'SK Bandar Sunway Semenyih B', 'Sri Al-Amin Bangi A', 'Sri Al-Amin Bangi B',
  'Sri Ilmi Ampang', 'SK Taming Jaya A', 'SK Taming Jaya B', 'SK Sungai Lui',
  'SK Taman Pelangi Semenyih A', 'SK Taman Pelangi Semenyih B', 'SK Leftenan Adnan A', 'SK Leftenan Adnan B',
  'SK Kantan Permai A', 'SK Kantan Permai B', 'SK Kantan Permai C', 'SK Cheras Jaya A', 'SK Cheras Jaya B',
  'SK Batu Sembilan A', 'SK Batu Sembilan B', 'SK Batu Sembilan C', 'SK Bandar Tasik Kesuma A', 'SK Bandar Tasik Kesuma B',
  'SK Jalan Enam A', 'SK Jalan Enam B', 'SK Taman Kosas A', 'SK Taman Kosas B', 'SK TAAM A', 'SK TAAM B',
  'SK Sri Jelok A', 'SK Sri Jelok B', 'SK Sri Jelok C', 'SK Bandar Bukit Mahkota A', 'SK Bandar Bukit Mahkota B',
  'SK Bandar Bukit Mahkota C', 'SK Bandar Rinching A', 'SK Bandar Rinching B', 'SK Beranang A', 'SK Beranang B',
  'SK Beranang C', 'SK Seksyen 7 A', 'SK Seksyen 7 B', 'SK Sungai Tekali A', 'SK Sungai Tekali B',
  'SK Taman Nirwana A', 'SK Taman Nirwana B', 'Seri ABIM Sungai Ramal A', 'Seri ABIM Sungai Ramal B',
  'Seri ABIM Sungai Ramal C', 'SK Ampang Campuran A', 'SK Ampang Campuran B', 'SK Tasek Permai A',
  'SK Tasek Permai B', 'SK Taman Tasik A', 'SK Taman Tasik B', 'SK Lembah Jaya A', 'SK Lembah Jaya B',
  'SRAI Bandar Baru Bangi A', 'SRAI Bandar Baru Bangi B', 'SK Bukit Raya A', 'SK Bukit Raya B', 'SK Bangi',
  'SK Bandar Teknologi A', 'SK Bandar Teknologi B', 'SK Taman Jasmin A', 'SK Taman Jasmin B', 'SK Pandan Indah',
  'SK Semenyih A', 'SK Semenyih B', 'SK Semenyih C', 'SK Bandar Tun Hussein Onn A', 'SK Bandar Tun Hussein Onn B',
];

const COLORS = ['#18d5ff', '#8b5cf6', '#f8c94c', '#19e68c', '#ff5f86', '#6f8dff'];

export function initials(name) {
  return name.replace(/^SK\s/, '').split(/\s+/).slice(0, 2).map((part) => part[0]).join('');
}

export function seedData() {
  const schoolNames = [...new Set(TEAM_NAMES.map((name) => name.replace(/\s([ABC])$/, '')))];
  const schools = schoolNames.map((name, index) => ({
    id: `school-${index + 1}`,
    name,
    color: COLORS[index % COLORS.length],
    logo: '',
  }));

  const teams = TEAM_NAMES.map((name, index) => {
    const suffixMatch = name.match(/\s([ABC])$/);
    const suffix = suffixMatch?.[1] || '';
    const schoolName = suffix ? name.slice(0, -2) : name;
    const school = schools.find((item) => item.name === schoolName);
    return {
      id: `team-${index + 1}`,
      schoolId: school.id,
      name,
      suffix,
      logo: '',
      color: school.color,
    };
  });

  const groups = Array.from({ length: Math.ceil(teams.length / 3) }, (_, index) => ({
    id: `group-${index + 1}`,
    name: `Kumpulan ${index + 1}`,
    teamIds: teams.slice(index * 3, index * 3 + 3).map((team) => team.id),
  }));

  const matches = groups.flatMap((group, groupIndex) => {
    const [a, b, c] = group.teamIds;
    const pairs = [[a, b], [b, c], [a, c]];
    return pairs.map(([homeId, awayId], roundIndex) => {
      const seq = groupIndex * 3 + roundIndex;
      const statusCycle = seq < 7 ? 'Tamat' : seq < 10 ? 'Sedang Bermain' : 'Menunggu';
      const startHour = 8 + Math.floor(seq / 9);
      const minute = (seq % 3) * 20;
      const completed = statusCycle === 'Tamat';
      const live = statusCycle === 'Sedang Bermain';
      return {
        id: `match-${seq + 1}`,
        groupId: group.id,
        round: roundIndex + 1,
        homeId,
        awayId,
        court: ['A', 'B', 'C'][seq % 3],
        time: `${String(startHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
        status: statusCycle,
        homeScore: completed ? 21 : live ? 14 + (seq % 7) : '',
        awayScore: completed ? 11 + (seq % 9) : live ? 12 + (seq % 6) : '',
      };
    });
  });

  return {
    schools,
    teams,
    groups,
    matches,
    activities: [
      { id: 1, time: '10:42', text: 'Keputusan Kumpulan 3 dikemas kini', type: 'result' },
      { id: 2, time: '10:35', text: 'Perlawanan bermula di Gelanggang B', type: 'live' },
      { id: 3, time: '10:20', text: 'SK Bandar Seri Putra A menang 21–17', type: 'win' },
      { id: 4, time: '10:05', text: 'Jadual Gelanggang C dikemas kini', type: 'schedule' },
    ],
    settings: {
      date: '18 – 20 Jun 2026',
      location: 'Dewan Kompleks Sukan Hulu Langat',
      courts: 3,
    },
  };
}

export function calculateStandings(data) {
  const rows = Object.fromEntries(data.teams.map((team) => [team.id, {
    ...team, mp: 0, w: 0, l: 0, d: 0, f: 0, a: 0, gd: 0, p: 0,
  }]));
  data.matches.filter((match) => match.status === 'Tamat').forEach((match) => {
    const home = rows[match.homeId];
    const away = rows[match.awayId];
    if (!home || !away) return;
    const hs = Number(match.homeScore);
    const as = Number(match.awayScore);
    home.mp += 1; away.mp += 1;
    home.f += hs; home.a += as; away.f += as; away.a += hs;
    if (hs > as) { home.w += 1; home.p += 3; away.l += 1; }
    else if (hs < as) { away.w += 1; away.p += 3; home.l += 1; }
    else { home.d += 1; away.d += 1; home.p += 1; away.p += 1; }
  });
  return Object.values(rows).map((row) => ({ ...row, gd: row.f - row.a }))
    .sort((a, b) => b.p - a.p || b.gd - a.gd || b.f - a.f);
}
