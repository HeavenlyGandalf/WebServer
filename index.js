import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import forge from 'node-forge';

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const LOGIN = 'katyaritm'; // ← впишите свой логин

// CORS: проверяющая система обычно обращается из браузера
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.set('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/login', (req, res) => {
  res.type('text/plain').send(LOGIN);
});

// Поле может прийти и как файл, и как обычный текст
function getField(req, name) {
  const file = (req.files || []).find(f => f.fieldname === name);
  if (file) return file.buffer;
  if (req.body && req.body[name] !== undefined) return Buffer.from(req.body[name]);
  return null;
}

function decrypt(keyPem, data) {
  // 1) RSA-OAEP (по умолчанию в Node)
  try {
    return crypto.privateDecrypt(
      { key: keyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
      data
    ).toString('utf8');
  } catch (_) {}
  // 2) PKCS#1 v1.5 через node-forge (в новых Node этот режим заблокирован в crypto)
  const pk = forge.pki.privateKeyFromPem(keyPem);
  return pk.decrypt(data.toString('binary'), 'RSAES-PKCS1-V1_5');
}

app.post('/decypher', upload.any(), (req, res) => {
  try {
    const key = getField(req, 'key');
    const secret = getField(req, 'secret');
    if (!key || !secret) return res.status(400).type('text/plain').send('need key and secret');

    const keyPem = key.toString('utf8');
    const secretText = secret.toString('utf8').trim();

    // Зашифрованное содержимое обычно приходит в base64; если нет — берём байты как есть
    const isBase64 = /^[A-Za-z0-9+/=\s]+$/.test(secretText);
    const data = isBase64 ? Buffer.from(secretText, 'base64') : secret;

    res.type('text/plain').send(decrypt(keyPem, data));
  } catch (e) {
    res.status(500).type('text/plain').send('decrypt error: ' + e.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log('Listening on ' + PORT));