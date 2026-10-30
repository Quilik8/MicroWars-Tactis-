export const FACTION_PATHS={
 carpinteras:'<path d="M7 6l18 2-1 18-17-2Z M12 10l-1 10 M17 11l-1 10 M22 12l-1 10"/>',
 negras:'<path d="M7 23V9h18"/><circle cx="7" cy="23" r="3"/><circle cx="7" cy="9" r="3"/><circle cx="25" cy="9" r="3"/>',
 tejedoras:'<path d="M4 6Q15 2 25 12Q19 19 8 16Z M6 24Q17 30 28 19Q23 11 12 15Z M10 10l12 12"/>',
 cortadoras:'<path d="M5 26Q2 9 26 5L23 13l-6 1 3 5Q13 28 5 26Z M6 25L18 13"/>',
 fuego:'<path d="M7 27Q2 22 7 16T7 5 M16 27Q11 20 16 13T16 3 M25 27Q20 22 25 16T25 5"/>',
 bala:'<path d="M5 5l7 5-4 10 6 7 M27 5l-7 5 4 10-6 7 M5 5l1 12 M27 5l-1 12"/>',
 mutantes:'<path d="M5 8l7 2 4-5 4 7 7 3-6 6-2 7-7-6-8-1 3-7Z"/>',
 termitas:'<path d="M4 27V13Q16-5 28 13V27 M10 27V15Q16 5 22 15V27 M4 27h24"/>',
 avispas:'<path d="M16 7v21 M16 18Q-1-3 5 17l11 4 M16 18Q33-3 27 17l-11 4"/>',
 arañas:'<path d="M16 3v26 M3 16h26 M6 6l20 20 M26 6L6 26 M9 9l7-3 7 3 3 7-3 7-7 3-7-3-3-7Z"/>',
 escarabajos:'<path d="M16 4Q1 4 5 25Q16 33 27 25Q31 4 16 4Z M16 4v25 M6 13h20"/>'
};
export const factionEmblem=id=>`<svg class="faction-emblem" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${FACTION_PATHS[id]||''}</svg>`;
