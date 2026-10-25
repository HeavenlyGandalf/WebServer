import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import zlib from 'zlib';
import forge from 'node-forge';

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const LOGIN = 'katyaritm';

// ---------- CORS ----------
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.set('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ---------- /login и /login/ ----------
app.get('/login', (req, res) => {
  res.type('text/plain').send(LOGIN);
});

// ---------- Задание 1: /hour ----------
app.get('/hour', (req, res) => {
  const hour = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    hourCycle: 'h23'
  }).format(new Date());
  res.type('text/plain').send(hour.padStart(2, '0'));
});

// ---------- Задание 2: /zipper ----------
app.post('/zipper', upload.any(), (req, res) => {
  const file = (req.files || [])[0];
  if (!file) return res.status(400).type('text/plain').send('no file');
  const gz = zlib.gzipSync(file.buffer);
  res.set('Content-Type', 'application/gzip');
  res.set('Content-Disposition', 'attachment; filename="result.gz"');
  res.send(gz);
});

// ---------- Задание 3: /size2json/ ----------
app.post('/size2json', upload.any(), (req, res) => {
  const file = (req.files || []).find(f => f.fieldname === 'image') || (req.files || [])[0];
  if (!file) return res.status(400).json({ error: 'no image' });
  const b = file.buffer;
  // PNG: сигнатура 8 байт, затем чанк IHDR; ширина — байты 16–19, высота — 20–23
  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (b.length < 24 || !b.subarray(0, 8).equals(pngSig)) {
    return res.status(400).json({ error: 'not png' });
  }
  res.json({ width: b.readUInt32BE(16), height: b.readUInt32BE(20) });
});

// ---------- Задание 4: /id/:n ----------
app.get('/id/:n', async (req, res) => {
  try {
    // GET без тела и без заголовка Content-Type
    const r = await fetch('https://nd.kodaktor.ru/users/' + encodeURIComponent(req.params.n));
    const data = await r.json();
    res.type('text/plain').send(String(data.login));
  } catch (e) {
    res.status(500).type('text/plain').send('error: ' + e.message);
  }
});

// ---------- Задание с расшифровкой: /decypher ----------
function getField(req, name) {
  const file = (req.files || []).find(f => f.fieldname === name);
  if (file) return file.buffer;
  if (req.body && req.body[name] !== undefined) return Buffer.from(req.body[name]);
  return null;
}

function decrypt(keyPem, data) {
  try {
    return crypto.privateDecrypt(
      { key: keyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
      data
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
    const secretText = secret.toString('utf8').trim();
    const isBase64 = /^[A-Za-z0-9+/=\s]+$/.test(secretText);
    const data = isBase64 ? Buffer.from(secretText, 'base64') : secret;
    res.type('text/plain').send(decrypt(key.toString('utf8'), data));
  } catch (e) {
    res.status(500).type('text/plain').send('decrypt error: ' + e.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log('Listening on ' + PORT));