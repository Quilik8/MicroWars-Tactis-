const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT_DIR = path.join(__dirname, '..');
const PROMO_DIR = path.join(ROOT_DIR, 'promocion');
const TEMP_DIR = path.join(PROMO_DIR, 'temp_videos');
const PORT = Number(process.env.PROMO_PORT || 8099);
const BASE_URL = `http://127.0.0.1:${PORT}/index.html`;
const VIEWPORT = { width: 1920, height: 1080 };

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.webm': 'video/webm'
};

const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const onlyArg = process.argv.find(arg => arg.startsWith('--only='));
const only = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',').map(v => v.trim()).filter(Boolean)) : null;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function promoPath(fileName) {
  return path.join(PROMO_DIR, fileName);
}

function hasAllOutputs(outputs) {
  return outputs.every(fileName => fs.existsSync(promoPath(fileName)) && fs.statSync(promoPath(fileName)).size > 0);
}

function shouldRun(scene) {
  if (only && !only.has(scene.id)) return false;
  return force || !hasAllOutputs(scene.outputs);
}

function startServer() {
  const server = http.createServer((req, res) => {
    const requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, '');
    const filePath = safePath === '/' ? path.join(ROOT_DIR, 'index.html') : path.join(ROOT_DIR, safePath);

    if (!filePath.startsWith(ROOT_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(err.code === 'ENOENT' ? 404 : 500);
        res.end(err.code === 'ENOENT' ? 'Not found' : 'Server error');
        return;
      }

      res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
      res.end(content);
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () => {
      server.off('error', reject);
      console.log(`[server] ${BASE_URL}`);
      resolve(server);
    });
  });
}

function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ].filter(Boolean);

  return candidates.find(candidate => fs.existsSync(candidate));
}

async function launchRecorder() {
  ensureDir(TEMP_DIR);
  const beforeVideos = new Set(
    fs.readdirSync(TEMP_DIR).filter(fileName => fileName.endsWith('.webm'))
  );

  const executablePath = findChromeExecutable();
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--ignore-gpu-blocklist',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });

  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: TEMP_DIR, size: VIEWPORT }
  });
  const page = await context.newPage();

  return { browser, context, page, beforeVideos };
}

async function withTimeout(label, ms, task) {
  let timer;
  try {
    return await Promise.race([
      task,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} tardo mas de ${ms}ms`)), ms);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function waitForStableFile(filePath, maxWaitMs = 12000) {
  let lastSize = -1;
  let stableTicks = 0;
  let firstSeenAt = 0;
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    if (fs.existsSync(filePath)) {
      if (!firstSeenAt) firstSeenAt = Date.now();
      const size = fs.statSync(filePath).size;
      if (size > 0 && size === lastSize && Date.now() - firstSeenAt > 5000) {
        stableTicks += 1;
        if (stableTicks >= 5) return true;
      } else {
        stableTicks = 0;
        lastSize = size;
      }
    }
    await sleep(1000);
  }

  return fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
}

function findNewVideo(beforeVideos) {
  const videos = fs.readdirSync(TEMP_DIR)
    .filter(fileName => fileName.endsWith('.webm') && !beforeVideos.has(fileName))
    .map(fileName => {
      const filePath = path.join(TEMP_DIR, fileName);
      const stat = fs.statSync(filePath);
      return { fileName, filePath, size: stat.size, time: stat.mtimeMs };
    })
    .filter(video => video.size > 0)
    .sort((a, b) => b.time - a.time);

  return videos[0] || null;
}

async function closeRecorder(recorder, videoName) {
  await withTimeout('context.close', 30000, recorder.context.close()).catch(err => {
    console.warn(`[video] ${err.message}; se intentara cerrar el browser directamente.`);
  });

  await withTimeout('browser.close', 30000, recorder.browser.close()).catch(err => {
    console.warn(`[video] ${err.message}; se intentara rescatar el archivo temporal.`);
  });

  await sleep(2000);
  const video = findNewVideo(recorder.beforeVideos);

  if (!video) {
    console.warn(`[video] No se pudo encontrar el video temporal para ${videoName}`);
    return;
  }

  await waitForStableFile(video.filePath, 60000);
  const finalPath = promoPath(videoName);
  fs.copyFileSync(video.filePath, finalPath);
  try {
    fs.rmSync(video.filePath, { force: true });
  } catch (err) {
    console.warn(`[video] Temporal aun bloqueado, queda en temp_videos/: ${path.basename(video.filePath)}`);
  }
  console.log(`[video] ${videoName}`);
}

async function openGame(page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.startLevel && document.querySelector('#btnLevels'), null, { timeout: 15000 });
  await page.waitForTimeout(1500);
}

async function screenshot(page, fileName) {
  await page.screenshot({ path: promoPath(fileName), fullPage: false });
  console.log(`[png] ${fileName}`);
}

async function runRecordedScene(scene, body) {
  console.log(`\n=== ${scene.title} ===`);
  const recorder = await launchRecorder();

  try {
    await body(recorder.page);
  } finally {
    await closeRecorder(recorder, scene.video);
  }
}

function cleanupTempVideos() {
  if (!fs.existsSync(TEMP_DIR)) return;

  const stale = fs.readdirSync(TEMP_DIR).filter(fileName => fileName.endsWith('.webm'));
  for (const fileName of stale) {
    const filePath = path.join(TEMP_DIR, fileName);
    const size = fs.statSync(filePath).size;
    if (size === 0) {
      fs.rmSync(filePath, { force: true });
      console.log(`[cleanup] temporal vacio eliminado: ${fileName}`);
    }
  }
}

const scenes = [
  {
    id: 'menu',
    title: 'Escena 1: Menu de inicio',
    video: '1_menu_inicio.webm',
    outputs: ['1_menu_inicio.png', '1_menu_inicio.webm'],
    run: () => runRecordedScene(scenes[0], async page => {
      await openGame(page);
      await page.waitForTimeout(2500);
      await screenshot(page, '1_menu_inicio.png');
      await page.waitForTimeout(5000);
    })
  },
  {
    id: 'sectores',
    title: 'Escena 2: Seleccion de sectores',
    video: '2_seleccion_sector_3_animacion.webm',
    outputs: [
      '2_seleccion_sector_1.png',
      '3_sector_1_niveles.png',
      '4_seleccion_sector_3.png',
      '2_seleccion_sector_3_animacion.webm'
    ],
    run: () => runRecordedScene(scenes[1], async page => {
      await openGame(page);
      await page.click('#btnLevels');
      await page.waitForSelector('.sector-macro-card[data-idx="0"]', { timeout: 10000 });
      await page.waitForTimeout(800);
      await screenshot(page, '2_seleccion_sector_1.png');

      await page.click('.sector-macro-card[data-idx="0"]');
      await page.waitForSelector('.btn-back-macro', { timeout: 10000 });
      await page.waitForTimeout(800);
      await screenshot(page, '3_sector_1_niveles.png');

      await page.click('.btn-back-macro');
      await page.waitForSelector('.ft-node', { timeout: 10000 });
      await page.evaluate(() => {
        const nodes = document.querySelectorAll('.ft-node');
        if (nodes[2]) nodes[2].click();
      });
      await page.waitForTimeout(1500);
      await screenshot(page, '4_seleccion_sector_3.png');
      await page.waitForTimeout(4000);
    })
  },
  ...Array.from({ length: 6 }, (_, index) => {
    const sector = index + 1;
    return {
      id: `sector${sector}`,
      title: `Escena ${sector + 2}: Sector ${sector} gameplay`,
      video: `sector_${sector}_nivel_juego.webm`,
      outputs: [
        `sector_${sector}_nivel_intro.png`,
        `sector_${sector}_nivel_juego.png`,
        `sector_${sector}_nivel_juego.webm`
      ],
      run: () => runRecordedScene(scenes[sector + 1], async page => {
        await openGame(page);
        await page.evaluate(idx => window.startLevel(idx, 0), index);
        await page.waitForSelector('#levelIntro:not(.hidden)', { timeout: 10000 });
        await page.waitForTimeout(1200);
        await screenshot(page, `sector_${sector}_nivel_intro.png`);

        await page.click('#levelIntro').catch(() => {});
        await page.waitForTimeout(12000);
        await screenshot(page, `sector_${sector}_nivel_juego.png`);
      })
    };
  })
];

async function capturePromo() {
  ensureDir(PROMO_DIR);
  ensureDir(TEMP_DIR);
  cleanupTempVideos();

  const selectedScenes = scenes.filter(shouldRun);
  if (selectedScenes.length === 0) {
    console.log('[ok] Todo el material esperado ya existe. Usa --force para regenerarlo.');
    return;
  }

  const server = await startServer();
  try {
    for (const scene of selectedScenes) {
      await scene.run();
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  console.log('\nProceso completado.');
  console.log(`Carpeta: ${PROMO_DIR}`);
  console.log('Esperado: 16 PNG y 8 WEBM.');
}

capturePromo().catch(err => {
  console.error('[error]', err);
  process.exitCode = 1;
});
