import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import zlib from 'zlib';
import forge from 'node-forge';

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const LOGIN = 'katyaritm';

// ---------- CORS для всех маршрутов (идёт первым) ----------
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.set('Access-Control-Allow-Headers',
    'x-test,ngrok-skip-browser-warning,Content-Type,Accept,Access-Control-Allow-Headers');
  if (req.path === '/') res.set('Access-Control-Allow-Methods', '*'); // задание 1
  // /result4/ должен отвечать одинаково на все методы, включая OPTIONS
  if (req.method === 'OPTIONS' && !req.path.startsWith('/result4')) return res.sendStatus(204);
  next();
});

// ---------- Неделя 4: /result4/ — ДО общих парсеров ----------
// Тело читается сырой строкой при любом Content-Type
app.all('/result4', express.text({ type: () => true }), (req, res) => {
  const body = typeof req.body === 'string' ? req.body : '';
  res.setHeader('Content-Type', 'application/json'); // ровно application/json, без charset
  res.end(JSON.stringify({
    message: LOGIN,
    'x-result': req.get('x-test') ?? '',
    'x-body': body
  }));
});

// ---------- Неделя 8: /wordpress/ — прокси к вашему экземпляру WordPress ----------
// Адрес WordPress задаётся переменной окружения WP_URL (например, https://my-wp.example.ru).
// Прокси стоит ДО парсеров тела, чтобы POST-запросы доходили до WordPress без изменений.
if (process.env.WP_URL) {
  try {
    const { createProxyMiddleware } = await import('http-proxy-middleware');
    app.use('/wordpress', createProxyMiddleware({ target: process.env.WP_URL, changeOrigin: true }));
    console.log('WordPress proxy -> ' + process.env.WP_URL);
  } catch (e) {
    console.error('WordPress proxy disabled:', e.message);
  }
} else {
  app.use('/wordpress', (req, res) => {
    res.status(503); sendText(res, 'WordPress is not configured: set WP_URL');
  });
}

// ---------- Общие парсеры тела (для /insert/ и прочих) ----------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Отдаёт текст ровно с "text/plain; charset=UTF-8" (Express сам переписал бы в utf-8)
function sendText(res, text, type = 'text/plain; charset=UTF-8') {
  res.set('Content-Type', type);
  res.end(text);
}

// ---------- Неделя 1: корень ----------
app.get('/', (req, res) => {
  res.set('X-Author', LOGIN);
  sendText(res, LOGIN);
});

// ---------- /login и /login/ ----------
app.get('/login', (req, res) => sendText(res, LOGIN));

// ---------- Неделя 2: /sample/ ----------
app.get('/sample', (req, res) => {
  sendText(res, 'function task(x) { return x * this * this; }');
});

// ---------- Неделя 3: /promise/ ----------
app.get('/promise', (req, res) => {
  sendText(res,
    "function task(x) { return new Promise((resolve, reject) => x < 18 ? resolve('yes') : reject('no')); }");
});

// ---------- Неделя 3: /fetch/ ----------
app.get('/fetch', (req, res) => {
  sendText(res, `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>fetch</title></head>
<body>
  <input id="inp">
  <button id="bt">Go</button>
  <script>
    document.getElementById('bt').addEventListener('click', async () => {
      const inp = document.getElementById('inp');
      const r = await fetch(inp.value);
      inp.value = await r.text();
    });
  </script>
</body>
</html>`, 'text/html; charset=UTF-8');
});

// ---------- /hour ----------
app.get('/hour', (req, res) => {
  const hour = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow', hour: '2-digit', hourCycle: 'h23'
  }).format(new Date());
  sendText(res, hour.padStart(2, '0'));
});

// ---------- /insert/ (MongoDB) ----------
app.post('/insert', async (req, res) => {
  const { login, password, URL } = req.body || {};
  if (!URL) { res.status(400); return sendText(res, 'no URL'); }
  let conn;
  try {
    const mongoose = (await import('mongoose')).default; // загружается только здесь
    const userSchema = new mongoose.Schema({ login: String, password: String });
    conn = mongoose.createConnection(URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 15000
    });
    await conn; // ждём подключения; ошибка попадёт в catch, а не уронит сервер
    const User = conn.model('User', userSchema, 'users'); // коллекция users
    await User.create({ login, password });
    sendText(res, 'ok');
  } catch (e) {
    console.error('insert error:', e.message);
    res.status(500); sendText(res, 'error: ' + e.message);
  } finally {
    if (conn) conn.close().catch(() => {});
  }
});

// ---------- Неделя 8: /render/ — рендер pug-шаблона ----------
app.post('/render', async (req, res) => {
  try {
    const addr = req.query.addr;
    if (!addr) { res.status(400); return sendText(res, 'no addr'); }
    let data = req.body;
    if (typeof data === 'string') data = JSON.parse(data);
    const { random2, random3 } = data || {};
    const pug = (await import('pug')).default;
    const tpl = await (await fetch(addr)).text();
    const html = pug.render(tpl, { random2, random3 });
    sendText(res, html, 'text/html; charset=UTF-8');
  } catch (e) {
    console.error('render error:', e.message);
    res.status(500); sendText(res, 'error: ' + e.message);
  }
});

// ---------- Неделя 9: /test/ — щёлкнуть по #bt и прочитать #inp ----------
async function clickWithPuppeteer(url) {
  const puppeteer = (await import('puppeteer')).default;
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
    await page.waitForSelector('#bt', { timeout: 10000 });
    const before = await page.$eval('#inp', el => el.value);
    await page.click('#bt');
    await page.waitForFunction(
      prev => { const v = document.querySelector('#inp').value; return v !== '' && v !== prev; },
      { timeout: 10000 }, before
    ).catch(() => {});
    return await page.$eval('#inp', el => el.value);
  } finally {
    await browser.close();
  }
}

// Запасной вариант без браузера: исполняет скрипты страницы в jsdom
async function clickWithJsdom(url) {
  const { JSDOM, VirtualConsole } = await import('jsdom');
  const html = await (await fetch(url)).text();
  const dom = new JSDOM(html, {
    url, runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    virtualConsole: new VirtualConsole()
  });
  const win = dom.window;
  if (!win.fetch) win.fetch = fetch; // jsdom не умеет fetch
  await new Promise(r => {
    if (win.document.readyState === 'complete') r();
    else win.addEventListener('load', r);
    setTimeout(r, 5000);
  });
  const inp = win.document.getElementById('inp');
  const before = inp.value;
  win.document.getElementById('bt').click();
  for (let i = 0; i < 50 && (inp.value === '' || inp.value === before); i++) {
    await new Promise(r => setTimeout(r, 100));
  }
  const value = inp.value;
  win.close();
  return value;
}

app.get('/test', async (req, res) => {
  const url = req.query.URL;
  if (!url) { res.status(400); return sendText(res, 'no URL'); }
  try {
    sendText(res, String(await clickWithPuppeteer(url)));
  } catch (e) {
    console.error('puppeteer failed, using jsdom:', e.message);
    try {
      sendText(res, String(await clickWithJsdom(url)));
    } catch (e2) {
      res.status(500); sendText(res, 'error: ' + e2.message);
    }
  }
});

// ---------- /zipper ----------
app.post('/zipper', upload.any(), (req, res) => {
  const file = (req.files || [])[0];
  if (!file) return res.status(400).type('text/plain').send('no file');
  res.set('Content-Type', 'application/gzip');
  res.set('Content-Disposition', 'attachment; filename="result.gz"');
  res.send(zlib.gzipSync(file.buffer));
});

// ---------- /size2json/ ----------
app.post('/size2json', upload.any(), (req, res) => {
  const file = (req.files || []).find(f => f.fieldname === 'image') || (req.files || [])[0];
  if (!file) return res.status(400).json({ error: 'no image' });
  const b = file.buffer;
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (b.length < 24 || !b.subarray(0, 8).equals(sig)) return res.status(400).json({ error: 'not png' });
  res.json({ width: b.readUInt32BE(16), height: b.readUInt32BE(20) });
});

// ---------- /id/:n ----------
app.get('/id/:n', async (req, res) => {
  try {
    // GET без тела и без заголовка Content-Type
    const r = await fetch('https://nd.kodaktor.ru/users/' + encodeURIComponent(req.params.n));
    const data = await r.json();
    sendText(res, String(data.login));
  } catch (e) {
    res.status(500); sendText(res, 'error: ' + e.message);
  }
});

// ---------- /decypher ----------
function getField(req, name) {
  const file = (req.files || []).find(f => f.fieldname === name);
  if (file) return file.buffer;
  if (req.body && req.body[name] !== undefined) return Buffer.from(req.body[name]);
  return null;
}

function decrypt(keyPem, data) {
  try {
    return crypto.privateDecrypt(
      { key: keyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING }, data
    ).toString('utf8');
  } catch (_) {}
  const pk = forge.pki.privateKeyFromPem(keyPem);
  return pk.decrypt(data.toString('binary'), 'RSAES-PKCS1-V1_5');
}

app.post('/decypher', upload.any(), (req, res) => {
  try {
    const key = getField(req, 'key');
    const secret = getField(req, 'secret');
    if (!key || !secret) return res.status(400).type('text/plain').send('need key and secret');
    const s = secret.toString('utf8').trim();
    const data = /^[A-Za-z0-9+/=\s]+$/.test(s) ? Buffer.from(s, 'base64') : secret;
    sendText(res, decrypt(key.toString('utf8'), data));
  } catch (e) {
    res.status(500); sendText(res, 'decrypt error: ' + e.message);
  }
});

// Страховка: необработанная ошибка не должна ронять весь сервер
process.on('unhandledRejection', e => console.error('unhandledRejection:', e && e.message));
process.on('uncaughtException', e => console.error('uncaughtException:', e && e.message));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log('Listening on ' + PORT));