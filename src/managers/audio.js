/**
 * MicroWars: Swarm Tactics — Módulo de Audio Nativo
 * ══════════════════════════════════════════════════
 * SFX procedurales + Música generativa ambiental (Web Audio API).
 * Sin archivos externos. Sin copyright. 100% código.
 */

const AudioContext = window.AudioContext || window.webkitAudioContext;
let actx = null;
let masterGain = null;

function ensureAudio() {
    if (!actx) {
        actx = new AudioContext();
        masterGain = actx.createGain();
        masterGain.gain.value = 1.0;
        masterGain.connect(actx.destination);

        const resumeOnInteraction = () => {
            if (actx && actx.state === 'suspended') actx.resume();
            window.removeEventListener('click', resumeOnInteraction);
            window.removeEventListener('touchstart', resumeOnInteraction);
        };
        window.addEventListener('click', resumeOnInteraction);
        window.addEventListener('touchstart', resumeOnInteraction);
    }
}

// ══════════════════════════════════════════════════
// SFX (Efectos de Sonido Puntuales)
// ══════════════════════════════════════════════════
function playTone(freq, type, duration, vol, slideFreq) {
    ensureAudio();
    if (actx.state === 'suspended') actx.resume();
    const osc = actx.createOscillator();
    const gain = actx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, actx.currentTime);
    if (slideFreq) {
        osc.frequency.exponentialRampToValueAtTime(slideFreq, actx.currentTime + duration);
    }

    gain.gain.setValueAtTime(vol, actx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, actx.currentTime + duration);

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start();
    osc.stop(actx.currentTime + duration);
}

export const SFX = {
    intro: () => {
        playTone(100, 'sawtooth', 0.1, 0.1, 200);
        setTimeout(() => playTone(200, 'sawtooth', 0.1, 0.1, 400), 100);
        setTimeout(() => playTone(400, 'sawtooth', 0.4, 0.15, 800), 200);
    },
    click: () => playTone(800, 'sine', 0.1, 0.1, 1200),
    move: () => playTone(400, 'triangle', 0.15, 0.1, 200),
    combat: () => playTone(150 + Math.random() * 50, 'sawtooth', 0.1, 0.03),
    capture: () => {
        playTone(400, 'sine', 0.1, 0.2);
        setTimeout(() => playTone(600, 'sine', 0.1, 0.2), 100);
        setTimeout(() => playTone(800, 'sine', 0.3, 0.2), 200);
    },
    lost: () => playTone(200, 'sawtooth', 0.5, 0.2, 50),
    shoot: () => playTone(600, 'sawtooth', 0.05, 0.1, 100), // Sonido seco de disparo
    evolve: () => {
        playTone(300, 'triangle', 0.1, 0.2, 600);
        setTimeout(() => playTone(450, 'triangle', 0.1, 0.2, 900), 80);
        setTimeout(() => playTone(600, 'triangle', 0.2, 0.2, 1200), 160);
    },
    victory: () => {
        playTone(440, 'sine', 0.2, 0.2, 880);
        setTimeout(() => playTone(554, 'sine', 0.2, 0.2, 1108), 200);
        setTimeout(() => playTone(659, 'sine', 0.5, 0.2, 1318), 400);
    },
    gameover: () => {
        playTone(220, 'sawtooth', 0.3, 0.2, 110);
        setTimeout(() => playTone(164, 'sawtooth', 0.3, 0.2, 82), 300);
        setTimeout(() => playTone(110, 'sawtooth', 0.6, 0.2, 55), 600);
    }
};

export function resumeAudio() {
    ensureAudio();
    if (actx.state === 'suspended') actx.resume();
}

// ══════════════════════════════════════════════════
// MÚSICA PROCEDURAL GENERATIVA
// ══════════════════════════════════════════════════

// Escalas musicales (Hz)
const SCALES = {
    MINOR: [220, 261.63, 293.66, 329.63, 349.23, 392, 440, 523.25], // La menor (Tactical)
    DORIAN: [220, 246.94, 261.63, 293.66, 329.63, 369.99, 392, 440], // La Dórico (Mystery/Menu)
    PHRYGIAN: [220, 233.08, 261.63, 293.66, 329.63, 349.23, 392, 440], // La Frigio (Forbidden/Desert)
};

const BASS_NOTES = [110, 130.81, 146.83, 164.81];

let musicPlaying = false;
let currentTheme = 'LEVEL';
let musicNodes = [];
let musicTimers = [];

function createFilter(type, freq, Q) {
    ensureAudio();
    const filter = actx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = Q || 1;
    return filter;
}

function playMusicalNote(freq, type, duration, vol, filterFreq) {
    ensureAudio();
    if (actx.state === 'suspended') return;

    const osc = actx.createOscillator();
    const gain = actx.createGain();
    const filter = createFilter('lowpass', filterFreq || 2000, 2);
    const now = actx.currentTime;

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    const attack = 0.05;
    const decay = duration * 0.3;
    const sustain = vol * 0.6;
    const release = duration * 0.4;

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + attack);
    gain.gain.linearRampToValueAtTime(sustain, now + attack + decay);
    gain.gain.setValueAtTime(sustain, now + duration - release);
    gain.gain.linearRampToValueAtTime(0.001, now + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    osc.start(now);
    osc.stop(now + duration + 0.05);
}

/** 
 * Inicia el generador de música ambiental.
 * @param {string} theme 'MENU' o 'LEVEL'
 * @param {number} levelIndex Índice del nivel para variar parámetros
 */
export function startMusic(theme = 'LEVEL', levelIndex = 0) {
    ensureAudio();
    if (musicPlaying && currentTheme === theme) return;
    if (musicPlaying) stopMusic(); // Cambiar de tema

    musicPlaying = true;
    currentTheme = theme;
    resumeAudio();

    // Parámetros basados en el tema
    let bpm = (theme === 'MENU') ? 90 : 120 + (levelIndex % 3) * 10;
    let baseScale = (theme === 'MENU') ? SCALES.DORIAN : SCALES.MINOR;
    if (levelIndex > 3 && theme === 'LEVEL') baseScale = SCALES.PHRYGIAN; // Mas tensión en niveles altos

    const beatLen = 60 / bpm;

    // ── CAPA 1: Kick / Pulso ──
    const kickInterval = setInterval(() => {
        if (!musicPlaying) return;
        const osc = actx.createOscillator();
        const gain = actx.createGain();
        const now = actx.currentTime;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(theme === 'MENU' ? 60 : 80, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.15);

        gain.gain.setValueAtTime(theme === 'MENU' ? 0.08 : 0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.25);
    }, beatLen * 1000);
    musicTimers.push(kickInterval);

    // ── CAPA 2: Bassline ──
    let bassIdx = 0;
    const bassInterval = setInterval(() => {
        if (!musicPlaying) return;
        const note = BASS_NOTES[bassIdx % BASS_NOTES.length];
        bassIdx++;
        playMusicalNote(note, 'triangle', beatLen * 1.5, theme === 'MENU' ? 0.05 : 0.08, 400);
    }, beatLen * 2000);
    musicTimers.push(bassInterval);

    // ── CAPA 3: Melodía ──
    const melodyInterval = setInterval(() => {
        if (!musicPlaying) return;
        if (Math.random() > 0.4) {
            const note = baseScale[Math.floor(Math.random() * baseScale.length)];
            const duration = beatLen * (1 + Math.random() * 2);
            playMusicalNote(note, theme === 'MENU' ? 'sine' : 'triangle', duration, 0.04, 1500);
        }
    }, beatLen * 3000);
    musicTimers.push(melodyInterval);

    // ── CAPA 4: Arpegio (solo para LEVEL) ──
    if (theme === 'LEVEL') {
        const arpInterval = setInterval(() => {
            if (!musicPlaying) return;
            for (let i = 0; i < 3; i++) {
                setTimeout(() => {
                    if (!musicPlaying) return;
                    const note = baseScale[Math.floor(Math.random() * baseScale.length)];
                    playMusicalNote(note * 2, 'sine', 0.15, 0.02, 3000);
                }, i * 120);
            }
        }, beatLen * 8000);
        musicTimers.push(arpInterval);
    }

    // ── CAPA 5: Pad ──
    const pad = actx.createOscillator();
    const padGain = actx.createGain();
    const padFilter = createFilter('lowpass', theme === 'MENU' ? 400 : 300, 0.5);

    pad.type = 'sawtooth';
    pad.frequency.value = theme === 'MENU' ? 110 : 55; // A2 para menú, A1 para niveles
    padGain.gain.value = 0.03;

    pad.connect(padFilter);
    padFilter.connect(padGain);
    padGain.connect(masterGain);
    pad.start();

    musicNodes.push({ osc: pad, gain: padGain });
}

export function stopMusic() {
    ensureAudio();
    musicPlaying = false;
    currentTheme = null;

    for (let t of musicTimers) clearInterval(t);
    musicTimers = [];

    for (let node of musicNodes) {
        try {
            node.gain.gain.linearRampToValueAtTime(0.001, actx.currentTime + 0.5);
            node.osc.stop(actx.currentTime + 0.6);
        } catch (e) { }
    }
    musicNodes = [];
}
