const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const USERS_FILE = path.join(ROOT, 'data', 'users.json');
const PORT = process.env.PORT || 3000;
const sessions = new Map();

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach((entry) => {
    const [name, value] = entry.split('=').map((part) => part.trim());
    if (name && value) cookies[name] = decodeURIComponent(value);
  });
  return cookies;
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 310000, 32, 'sha256').toString('hex');
}

function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function readUsers() {
  try {
    const contents = await fs.readFile(USERS_FILE, 'utf8');
    return JSON.parse(contents);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function saveUsers(users) {
  await fs.mkdir(path.dirname(USERS_FILE), { recursive: true });
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function sendJson(res, data, status = 200, headers = {}) {
  const responseHeaders = Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, headers);
  res.writeHead(status, responseHeaders);
  res.end(JSON.stringify(data));
}

function sendError(res, message, status = 400) {
  sendJson(res, { ok: false, message }, status);
}

async function getRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        if (!body) return resolve({});
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = url.pathname;
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.join(ROOT, pathname);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    console.error(error);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Server error');
  }
}

async function handleApi(req, res) {
  if (req.url === '/api/login' && req.method === 'POST') {
    const body = await getRequestBody(req);
    const username = (body.username || '').toString().trim();
    const password = (body.password || '').toString();

    if (!username || !password) {
      return sendError(res, 'Username and password are required.', 400);
    }

    const users = await readUsers();
    const user = users.find((entry) => entry.username.toLowerCase() === username.toLowerCase());
    if (!user) {
      return sendError(res, 'Invalid username or password.', 401);
    }

    const hash = hashPassword(password, user.salt);
    if (hash !== user.passwordHash) {
      return sendError(res, 'Invalid username or password.', 401);
    }

    const token = generateToken();
    sessions.set(token, { username: user.username, createdAt: Date.now() });
    sendJson(res, { ok: true, message: 'Login successful.', user: { username: user.username } }, 200, {
      'Set-Cookie': `authToken=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24}`,
    });
    return;
  }

  if (req.url === '/api/register' && req.method === 'POST') {
    const body = await getRequestBody(req);
    const username = (body.username || '').toString().trim();
    const password = (body.password || '').toString();

    if (!username || !password) {
      return sendError(res, 'Username and password are required.', 400);
    }
    if (password.length < 8) {
      return sendError(res, 'Password must be at least 8 characters.', 400);
    }

    const users = await readUsers();
    if (users.some((entry) => entry.username.toLowerCase() === username.toLowerCase())) {
      return sendError(res, 'A user with that username already exists.', 409);
    }

    const salt = generateSalt();
    const passwordHash = hashPassword(password, salt);
    users.push({ username, salt, passwordHash, createdAt: new Date().toISOString() });
    await saveUsers(users);

    sendJson(res, { ok: true, message: 'Account created successfully. Please log in.' });
    return;
  }

  if (req.url === '/api/session' && req.method === 'GET') {
    const cookies = parseCookies(req.headers.cookie);
    const session = sessions.get(cookies.authToken);
    if (!session) {
      return sendJson(res, { authenticated: false });
    }
    return sendJson(res, { authenticated: true, user: { username: session.username } });
  }

  if (req.url === '/api/logout' && req.method === 'POST') {
    const cookies = parseCookies(req.headers.cookie);
    if (cookies.authToken) {
      sessions.delete(cookies.authToken);
    }
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': 'authToken=deleted; HttpOnly; Path=/; SameSite=Lax; Max-Age=0',
    });
    return res.end(JSON.stringify({ ok: true }));
  }

  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: false, message: 'API route not found.' }));
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/')) {
      await handleApi(req, res);
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    console.error(error);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Server error');
  }
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
