const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = __dirname;
const port = Number(process.env.PORT || 3000);
const rateLimitSecret = isConfiguredSecret(process.env.RATE_LIMIT_SECRET) ? process.env.RATE_LIMIT_SECRET : crypto.randomBytes(32).toString('hex');
const databaseUrl = process.env.DATABASE_URL || '';
let pgPool;
let db;

if (process.env.NODE_ENV === 'production' && !databaseUrl) {
  throw new Error('DATABASE_URL must be set in production so site data is stored persistently.');
}

if (process.env.NODE_ENV === 'production' && !isConfiguredSecret(process.env.RATE_LIMIT_SECRET)) {
  throw new Error('RATE_LIMIT_SECRET must be set to a secret of at least 32 characters in production.');
}

if (process.env.NODE_ENV === 'production' && !isConfiguredSecret(process.env.ADMIN_API_TOKEN)) {
  throw new Error('ADMIN_API_TOKEN must be set to a secret of at least 32 characters in production.');
}

if (databaseUrl) {
  const { Pool } = require('pg');
  const isNetlify = Boolean(process.env.NETLIFY);
  pgPool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: true },
    max: isNetlify ? 1 : 5,
    idleTimeoutMillis: isNetlify ? 5000 : 30000,
    keepAlive: true,
    allowExitOnIdle: isNetlify
  });
  pgPool.on('error', (error) => console.error(`Idle Postgres connection error: ${error.message}`));
  db = {
    exec: (sql) => pgPool.query(sql),
    prepare(sql) {
      let parameterIndex = 0;
      const query = sql.replace(/\?/g, () => `$${++parameterIndex}`);
      return {
        all: (...values) => pgPool.query(query, values).then((result) => result.rows),
        get: (...values) => pgPool.query(query, values).then((result) => result.rows[0]),
        run: (...values) => {
          const insert = /^\s*INSERT\b/i.test(query) && !/\bRETURNING\b/i.test(query);
          return pgPool.query(insert ? `${query} RETURNING id` : query, values).then((result) => ({
            changes: result.rowCount,
            lastInsertRowid: result.rows[0] ? Number(result.rows[0].id) : undefined
          }));
        }
      };
    },
    close: () => pgPool.end()
  };
} else {
  const { DatabaseSync } = require('node:sqlite');
  const databaseDir = path.join(root, 'data');
  fs.mkdirSync(databaseDir, { recursive: true });
  db = new DatabaseSync(path.join(databaseDir, 'goodcut.sqlite'));
}

async function initializeDatabase() {
  if (databaseUrl) {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS barbers (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        shop_name TEXT NOT NULL DEFAULT '',
        city TEXT NOT NULL,
        price DOUBLE PRECISION NOT NULL DEFAULT 0,
        phone TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        specialties TEXT NOT NULL,
        bio TEXT NOT NULL DEFAULT '',
        image_url TEXT NOT NULL DEFAULT '',
        booking_url TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'approved' CHECK(status IN ('pending', 'approved', 'rejected')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS reviews (
        id BIGSERIAL PRIMARY KEY,
        barber_id BIGINT NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
        text TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS developer_feedback (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'reviewed')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS donations (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL DEFAULT 'Anonymous',
        amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 500),
        status TEXT NOT NULL DEFAULT 'pledged',
        stripe_session_id TEXT,
        payment_method TEXT NOT NULL DEFAULT 'legacy',
        currency TEXT NOT NULL DEFAULT 'GMD',
        wave_tracking_reference TEXT,
        wave_transaction_reference TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS donations_stripe_session ON donations(stripe_session_id) WHERE stripe_session_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS donations_wave_tracking_reference ON donations(wave_tracking_reference) WHERE wave_tracking_reference IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS donations_wave_transaction_reference ON donations(wave_transaction_reference) WHERE wave_transaction_reference IS NOT NULL;
      CREATE TABLE IF NOT EXISTS api_rate_limits (
        bucket_key TEXT PRIMARY KEY,
        window_start BIGINT NOT NULL,
        count INTEGER NOT NULL
      );
      ALTER TABLE barbers ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
      ALTER TABLE barbers ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved';
      ALTER TABLE donations ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'legacy';
      ALTER TABLE donations ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'GMD';
      ALTER TABLE donations ADD COLUMN IF NOT EXISTS wave_tracking_reference TEXT;
      ALTER TABLE donations ADD COLUMN IF NOT EXISTS wave_transaction_reference TEXT;
    `);
  } else {
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS barbers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        shop_name TEXT NOT NULL DEFAULT '',
        city TEXT NOT NULL,
        price REAL NOT NULL,
        phone TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        specialties TEXT NOT NULL,
        bio TEXT NOT NULL DEFAULT '',
        image_url TEXT NOT NULL DEFAULT '',
        booking_url TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'approved' CHECK(status IN ('pending', 'approved', 'rejected')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        barber_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
        text TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS developer_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'reviewed')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS donations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL DEFAULT 'Anonymous',
        amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 500),
        status TEXT NOT NULL DEFAULT 'pledged',
        stripe_session_id TEXT,
        payment_method TEXT NOT NULL DEFAULT 'legacy',
        currency TEXT NOT NULL DEFAULT 'GMD',
        wave_tracking_reference TEXT,
        wave_transaction_reference TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS donations_stripe_session ON donations(stripe_session_id) WHERE stripe_session_id IS NOT NULL;
      CREATE TABLE IF NOT EXISTS api_rate_limits (
        bucket_key TEXT PRIMARY KEY,
        window_start INTEGER NOT NULL,
        count INTEGER NOT NULL
      );
      DROP TABLE IF EXISTS barber_verification_challenges;
    `);
    const barberColumns = new Set(db.prepare('PRAGMA table_info(barbers)').all().map((column) => column.name));
    if (!barberColumns.has('email')) db.exec("ALTER TABLE barbers ADD COLUMN email TEXT NOT NULL DEFAULT ''");
    if (!barberColumns.has('status')) db.exec("ALTER TABLE barbers ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'");
    const donationColumns = new Set(db.prepare('PRAGMA table_info(donations)').all().map((column) => column.name));
    if (!donationColumns.has('payment_method')) db.exec("ALTER TABLE donations ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'legacy'");
    if (!donationColumns.has('currency')) db.exec("ALTER TABLE donations ADD COLUMN currency TEXT NOT NULL DEFAULT 'GMD'");
    if (!donationColumns.has('wave_tracking_reference')) db.exec('ALTER TABLE donations ADD COLUMN wave_tracking_reference TEXT');
    if (!donationColumns.has('wave_transaction_reference')) db.exec('ALTER TABLE donations ADD COLUMN wave_transaction_reference TEXT');
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS donations_wave_tracking_reference ON donations(wave_tracking_reference) WHERE wave_tracking_reference IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS donations_wave_transaction_reference ON donations(wave_transaction_reference) WHERE wave_transaction_reference IS NOT NULL;`);
  }
  await db.prepare("DELETE FROM barbers WHERE status = 'approved' AND phone = ''").run();
}

const mimeTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};
const contentSecurityPolicy = "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https: data: blob:; connect-src 'self'";
const sendJson = (response, status, data) => {
  response.writeHead(status, { ...securityHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
};

function readBody(request, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        reject(Object.assign(new Error('Request body is too large.'), { status: 413 }));
        request.destroy();
      }
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

async function readJson(request, maxBytes) {
  const raw = await readBody(request, maxBytes);
  try { return JSON.parse(raw || '{}'); }
  catch { throw Object.assign(new Error('Send valid JSON.'), { status: 400 }); }
}

function cleanString(value, maxLength, field, required = false) {
  if (typeof value !== 'string') value = value == null ? '' : String(value);
  const result = value.trim();
  if (required && !result) throw Object.assign(new Error(`${field} is required.`), { status: 400 });
  if (result.length > maxLength) throw Object.assign(new Error(`${field} must be ${maxLength} characters or fewer.`), { status: 400 });
  return result;
}

function safeUrl(value, field) {
  const result = cleanString(value, 500, field);
  if (!result) return '';
  try {
    const url = new URL(result);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    return result;
  } catch { throw Object.assign(new Error(`${field} must be a valid http or https URL.`), { status: 400 }); }
}

function normalizePhone(value) {
  const phone = cleanString(value, 20, 'Phone number', true).replace(/[\s().-]/g, '');
  if (!/^\+?[1-9]\d{6,14}$/.test(phone)) {
    throw Object.assign(new Error('Enter a valid phone number with 7 to 15 digits.'), { status: 400 });
  }
  return phone;
}

async function saveProfileImage(value) {
  if (!value) return '';
  const match = String(value).match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw Object.assign(new Error('Upload a JPEG, PNG, or WebP image.'), { status: 400 });
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 2 * 1024 * 1024 || buffer.toString('base64') !== match[2]) {
    throw Object.assign(new Error('Profile photos must be 2 MB or smaller.'), { status: 413 });
  }
  const type = match[1];
  const isJpeg = type === 'jpeg' && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = type === 'png' && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = type === 'webp' && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  if (!isJpeg && !isPng && !isWebp) throw Object.assign(new Error('The selected file is not a valid JPEG, PNG, or WebP image.'), { status: 400 });
  if (databaseUrl) return `data:image/${type};base64,${buffer.toString('base64')}`;
  const extension = type === 'jpeg' ? 'jpg' : type;
  const filename = `barber-${crypto.randomBytes(16).toString('hex')}.${extension}`;
  const uploadDirectory = path.join(root, 'uploads');
  await fs.promises.mkdir(uploadDirectory, { recursive: true });
  await fs.promises.writeFile(path.join(uploadDirectory, filename), buffer, { flag: 'wx' });
  return `/uploads/${filename}`;
}

function constantTimeTextEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function isConfiguredSecret(value) {
  return typeof value === 'string' && Buffer.byteLength(value) >= 32 && !value.toLowerCase().startsWith('replace-with-');
}

function requestIdentity(request) {
  const netlifyClientIp = request.headers['x-nf-client-connection-ip'];
  if (typeof netlifyClientIp === 'string' && netlifyClientIp) return netlifyClientIp;
  const forwardedFor = request.headers['x-forwarded-for'];
  if (process.env.TRUST_PROXY === 'true' && typeof forwardedFor === 'string') {
    const address = forwardedFor.split(',').at(-1).trim();
    if (address) return address;
  }
  return request.socket?.remoteAddress || 'unknown';
}

async function takeRateLimit(request, scope, identity, limit, windowMs) {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const bucketKey = crypto.createHmac('sha256', rateLimitSecret).update(`${scope}:${identity}`).digest('hex');
  await db.prepare('DELETE FROM api_rate_limits WHERE window_start < ?').run(now - 24 * 60 * 60 * 1000);
  const row = await db.prepare(`INSERT INTO api_rate_limits (bucket_key, window_start, count) VALUES (?, ?, 1)
    ON CONFLICT(bucket_key) DO UPDATE SET
      window_start = excluded.window_start,
      count = CASE WHEN api_rate_limits.window_start = excluded.window_start AND api_rate_limits.count < ?
        THEN api_rate_limits.count + 1
        WHEN api_rate_limits.window_start = excluded.window_start THEN api_rate_limits.count
        ELSE 1 END
    RETURNING count`).get(bucketKey, windowStart, limit + 1);
  if (row.count > limit) {
    const retryAfter = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));
    throw Object.assign(new Error('Too many requests. Please try again later.'), { status: 429, retryAfter });
  }
}

function requireAdmin(request) {
  const expected = process.env.ADMIN_API_TOKEN || '';
  if (!isConfiguredSecret(expected)) throw Object.assign(new Error('Admin review is not configured on this server.'), { status: 503 });
  const authorization = request.headers.authorization || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match || !constantTimeTextEqual(expected, match[1])) throw Object.assign(new Error('Admin authorization required.'), { status: 401 });
}

async function listBarbers() {
  const rows = await db.prepare(`SELECT b.*, COUNT(r.id) AS review_count, AVG(r.rating) AS average_rating
    FROM barbers b LEFT JOIN reviews r ON r.barber_id = b.id WHERE b.status = 'approved' GROUP BY b.id ORDER BY b.created_at DESC`).all();
  return rows.map((row) => ({
    id: Number(row.id), name: row.name, shopName: row.shop_name, city: row.city, phone: row.phone,
    specialties: JSON.parse(row.specialties), bio: row.bio, imageUrl: row.image_url, bookingUrl: row.booking_url,
    rating: row.average_rating ? Number(row.average_rating) : 0, reviewCount: Number(row.review_count),
  }));
}

async function donationSummary() {
  const rows = await db.prepare("SELECT currency, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM donations WHERE status = 'paid' GROUP BY currency").all();
  const totals = { GMD: 0, USD: 0 };
  let count = 0;
  for (const row of rows) {
    if (Object.hasOwn(totals, row.currency)) totals[row.currency] = Number(row.total);
    count += Number(row.count);
  }
  return { total: totals.GMD, totals, count };
}

async function startCheckout(donationId, amount, name, host, forwardedProtocol) {
  let publicUrl;
  const protocol = forwardedProtocol === 'https' ? 'https' : 'http';
  try { publicUrl = new URL(process.env.PUBLIC_URL || `${protocol}://${host}`); }
  catch { throw new Error('Set PUBLIC_URL to your public site URL before enabling Stripe.'); }
  const localHost = ['localhost', '127.0.0.1', '::5001'].includes(publicUrl.hostname);
  if (!['http:', 'https:'].includes(publicUrl.protocol) || (!localHost && publicUrl.protocol !== 'https:')) {
    throw new Error('PUBLIC_URL must use HTTPS outside local development.');
  }
  const successUrl = new URL('/payment.html?result=returned', publicUrl);
  const cancelUrl = new URL('/payment.html?result=cancelled', publicUrl);
  const form = new URLSearchParams({
    mode: 'payment',
    success_url: successUrl.toString(),
    cancel_url: cancelUrl.toString(),
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][product_data][name]': 'GoodCut community support',
    'line_items[0][price_data][unit_amount]': String(amount * 100),
    'line_items[0][quantity]': '1',
    'metadata[donation_id]': String(donationId),
    'metadata[donor_name]': name
  });
  const result = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form
  });
  const session = await result.json();
  if (!result.ok) throw new Error(session.error?.message || 'Payment setup failed. Please try again later.');
  await db.prepare("UPDATE donations SET status = 'pending', stripe_session_id = ? WHERE id = ? AND payment_method = 'stripe'").run(session.id, donationId);
  return session.url;
}

function verifyStripeSignature(rawBody, signatureHeader) {
  if (!process.env.STRIPE_WEBHOOK_SECRET || !signatureHeader) return false;
  const fields = Object.fromEntries(signatureHeader.split(',').map((part) => part.split('=')));
  if (!fields.t || !fields.v1 || Math.abs(Date.now() / 1000 - Number(fields.t)) > 300) return false;
  const expected = crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(`${fields.t}.${rawBody}`).digest();
  const provided = Buffer.from(fields.v1, 'hex');
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

async function handleApi(request, response, url) {
  const route = url.pathname;
  if (request.method === 'GET' && route === '/api/admin/feedback') {
    requireAdmin(request);
    const submissions = await db.prepare(`SELECT id, name, email, message, status, created_at AS "createdAt"
      FROM developer_feedback ORDER BY created_at DESC, id DESC`).all();
    submissions.forEach((submission) => { submission.id = Number(submission.id); });
    return sendJson(response, 200, { submissions });
  }
  const feedbackDecisionMatch = route.match(/^\/api\/admin\/feedback\/(\d+)\/decision$/);
  if (request.method === 'POST' && feedbackDecisionMatch) {
    requireAdmin(request);
    const body = await readJson(request);
    if (!['new', 'reviewed'].includes(body.status)) throw Object.assign(new Error('Feedback status must be new or reviewed.'), { status: 400 });
    const result = await db.prepare('UPDATE developer_feedback SET status = ? WHERE id = ?').run(body.status, Number(feedbackDecisionMatch[1]));
    if (!result.changes) throw Object.assign(new Error('Feedback submission not found.'), { status: 404 });
    return sendJson(response, 200, { status: body.status });
  }
  if (request.method === 'POST' && route === '/api/feedback') {
    const body = await readJson(request, 8 * 1024);
    if (cleanString(body.website, 200, 'Website')) throw Object.assign(new Error('Unable to submit this feedback.'), { status: 400 });
    await takeRateLimit(request, 'developer-feedback-ip', requestIdentity(request), 5, 60 * 60 * 1000);
    const name = cleanString(body.name, 80, 'Name');
    const email = cleanString(body.email, 254, 'Email');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error('Enter a valid email address or leave it blank.'), { status: 400 });
    const message = cleanString(body.message, 3000, 'Feedback', true);
    if (message.length < 5) throw Object.assign(new Error('Feedback must be at least 5 characters.'), { status: 400 });
    const result = await db.prepare('INSERT INTO developer_feedback (name, email, message) VALUES (?, ?, ?)').run(name, email, message);
    return sendJson(response, 201, { submitted: true, id: Number(result.lastInsertRowid), message: 'Thank you. Your feedback was sent to the developer review queue.' });
  }
  if (request.method === 'GET' && route === '/api/admin/barbers/pending') {
    requireAdmin(request);
    const rows = await db.prepare(`SELECT id, name, shop_name AS "shopName", city, phone, specialties, bio, image_url AS "imageUrl", created_at AS "createdAt"
      FROM barbers WHERE status = 'pending' ORDER BY created_at ASC`).all();
    const barbers = rows.map((barber) => ({ ...barber, id: Number(barber.id), specialties: JSON.parse(barber.specialties) }));
    return sendJson(response, 200, { barbers });
  }
  const moderationMatch = route.match(/^\/api\/admin\/barbers\/(\d+)\/decision$/);
  if (request.method === 'POST' && moderationMatch) {
    requireAdmin(request);
    const body = await readJson(request);
    if (!['approved', 'rejected'].includes(body.status)) throw Object.assign(new Error('Decision must be approved or rejected.'), { status: 400 });
    const result = await db.prepare("UPDATE barbers SET status = ? WHERE id = ? AND status = 'pending'").run(body.status, Number(moderationMatch[1]));
    if (!result.changes) throw Object.assign(new Error('Pending barber profile not found.'), { status: 404 });
    return sendJson(response, 200, { status: body.status });
  }
  if (request.method === 'GET' && route === '/api/admin/donations/pending') {
    requireAdmin(request);
    const donations = await db.prepare(`SELECT id, name, amount, currency, wave_tracking_reference AS "trackingReference",
      wave_transaction_reference AS "transactionReference", created_at AS "createdAt"
      FROM donations WHERE payment_method = 'wave' AND status = 'review' ORDER BY created_at ASC`).all();
    donations.forEach((donation) => { donation.id = Number(donation.id); donation.amount = Number(donation.amount); });
    return sendJson(response, 200, { donations });
  }
  const donationDecisionMatch = route.match(/^\/api\/admin\/donations\/(\d+)\/decision$/);
  if (request.method === 'POST' && donationDecisionMatch) {
    requireAdmin(request);
    const body = await readJson(request);
    if (!['paid', 'rejected'].includes(body.status)) throw Object.assign(new Error('Decision must be paid or rejected.'), { status: 400 });
    const result = await db.prepare("UPDATE donations SET status = ? WHERE id = ? AND payment_method = 'wave' AND status = 'review'")
      .run(body.status, Number(donationDecisionMatch[1]));
    if (!result.changes) throw Object.assign(new Error('Wave payment review not found.'), { status: 404 });
    return sendJson(response, 200, { status: body.status });
  }
  if (request.method === 'GET' && route === '/api/barbers') return sendJson(response, 200, { barbers: await listBarbers() });
  if (request.method === 'POST' && route === '/api/barbers') {
    const body = await readJson(request, 3 * 1024 * 1024);
    if (cleanString(body.website, 200, 'Website')) throw Object.assign(new Error('Unable to submit this profile.'), { status: 400 });
    await takeRateLimit(request, 'barber-profile-ip', requestIdentity(request), 5, 60 * 60 * 1000);
    const name = cleanString(body.name, 80, 'Name', true);
    const shopName = cleanString(body.shopName, 100, 'Shop name', true);
    const city = cleanString(body.city, 100, 'City or neighborhood', true);
    if (!Array.isArray(body.specialties) || body.specialties.length === 0 || body.specialties.length > 10) throw Object.assign(new Error('Add between 1 and 10 specialties.'), { status: 400 });
    const specialties = [...new Set(body.specialties.map((item) => cleanString(item, 35, 'Specialty', true)))];
    const bio = cleanString(body.bio, 600, 'Bio');
    const phone = normalizePhone(body.phone);
    const bookingUrl = safeUrl(body.bookingUrl, 'Booking URL');
    const imageData = cleanString(body.imageData, 3 * 1024 * 1024, 'Profile photo');
    const imageUrl = await saveProfileImage(imageData);
    try {
      const result = await db.prepare(`INSERT INTO barbers (name, shop_name, city, price, specialties, phone, bio, image_url, booking_url, status)
        VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, 'pending')`).run(name, shopName, city, JSON.stringify(specialties), phone, bio, imageUrl, bookingUrl);
      return sendJson(response, 202, { submitted: true, status: 'pending', barberId: Number(result.lastInsertRowid), message: 'Your profile was submitted for review.' });
    } catch (error) {
      if (imageUrl.startsWith('/uploads/')) await fs.promises.unlink(path.join(root, 'uploads', path.basename(imageUrl))).catch(() => {});
      throw error;
    }
  }
  if (request.method === 'GET' && route === '/api/reviews') {
    const barberId = Number(url.searchParams.get('barberId'));
    if (!Number.isInteger(barberId) || barberId < 1) throw Object.assign(new Error('A valid barberId is required.'), { status: 400 });
    return sendJson(response, 200, { reviews: (await db.prepare('SELECT id, barber_id AS "barberId", name, rating, text, created_at AS "createdAt" FROM reviews WHERE barber_id = ? ORDER BY created_at DESC').all(barberId)).map((review) => ({ ...review, id: Number(review.id), barberId: Number(review.barberId) })) });
  }
  if (request.method === 'POST' && route === '/api/reviews') {
    const body = await readJson(request);
    await takeRateLimit(request, 'review-ip', requestIdentity(request), 20, 60 * 60 * 1000);
    const barberId = Number(body.barberId);
    const rating = Number(body.rating);
    if (!Number.isInteger(barberId) || !await db.prepare('SELECT id FROM barbers WHERE id = ?').get(barberId)) throw Object.assign(new Error('That barber could not be found.'), { status: 404 });
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw Object.assign(new Error('Rating must be between 1 and 5 stars.'), { status: 400 });
    const name = cleanString(body.name || 'Neighbor', 60, 'Name');
    const text = cleanString(body.text, 800, 'Review');
    await db.prepare('INSERT INTO reviews (barber_id, name, rating, text) VALUES (?, ?, ?, ?)').run(barberId, name || 'Neighbor', rating, text);
    const barber = (await listBarbers()).find((item) => item.id === barberId);
    return sendJson(response, 201, { message: 'Review added.', barber });
  }
  if (request.method === 'GET' && route === '/api/payment-options') {
    const accountName = process.env.WAVE_GAMBIA_ACCOUNT_NAME || '';
    const phone = process.env.WAVE_GAMBIA_PHONE || '';
    return sendJson(response, 200, {
      wave: { enabled: Boolean(accountName && phone), accountName, phone },
      internationalCard: { enabled: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET) }
    });
  }
  if (request.method === 'GET' && route === '/api/donations/summary') return sendJson(response, 200, await donationSummary());
  if (request.method === 'POST' && route === '/api/donations/wave') {
    const body = await readJson(request);
    await takeRateLimit(request, 'donation-ip', requestIdentity(request), 10, 60 * 60 * 1000);
    if (!process.env.WAVE_GAMBIA_ACCOUNT_NAME || !process.env.WAVE_GAMBIA_PHONE) {
      throw Object.assign(new Error('Wave transfer details are not configured on this server.'), { status: 503 });
    }
    const amount = Number(body.amount);
    if (!Number.isInteger(amount) || amount < 1 || amount > 500) throw Object.assign(new Error('Choose an amount from D1 to D500.'), { status: 400 });
    const name = cleanString(body.name, 60, 'Name') || 'Anonymous';
    const trackingReference = `GC-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    const result = await db.prepare(`INSERT INTO donations (name, amount, status, payment_method, currency, wave_tracking_reference)
      VALUES (?, ?, 'pending', 'wave', 'GMD', ?)`).run(name, amount, trackingReference);
    return sendJson(response, 201, {
      donationId: Number(result.lastInsertRowid), trackingReference,
      accountName: process.env.WAVE_GAMBIA_ACCOUNT_NAME, phone: process.env.WAVE_GAMBIA_PHONE,
      amount, currency: 'GMD'
    });
  }
  if (request.method === 'POST' && route === '/api/donations/wave/confirm') {
    const body = await readJson(request);
    await takeRateLimit(request, 'wave-confirm-ip', requestIdentity(request), 10, 60 * 60 * 1000);
    const donationId = Number(body.donationId);
    const reference = cleanString(body.transactionReference, 80, 'Wave transaction reference', true);
    if (!Number.isInteger(donationId) || donationId < 1 || !/^[A-Za-z0-9-]{6,80}$/.test(reference)) {
      throw Object.assign(new Error('Enter a valid Wave transaction reference.'), { status: 400 });
    }
    if (await db.prepare('SELECT id FROM donations WHERE wave_transaction_reference = ?').get(reference)) {
      throw Object.assign(new Error('That Wave transaction reference has already been submitted.'), { status: 409 });
    }
    try {
      const result = await db.prepare(`UPDATE donations SET wave_transaction_reference = ?, status = 'review'
        WHERE id = ? AND payment_method = 'wave' AND status = 'pending' AND wave_transaction_reference IS NULL`).run(reference, donationId);
      if (!result.changes) throw Object.assign(new Error('Wave donation was not found or has already been submitted.'), { status: 404 });
    } catch (error) {
      if (error.status) throw error;
      if (error.code === 'ERR_SQLITE_ERROR' || error.code === '23505') throw Object.assign(new Error('That Wave transaction reference has already been submitted.'), { status: 409 });
      throw error;
    }
    return sendJson(response, 202, { submitted: true, status: 'review', message: 'Your transfer details were sent for confirmation.' });
  }
  if (request.method === 'POST' && route === '/api/donations/stripe') {
    const body = await readJson(request);
    await takeRateLimit(request, 'donation-ip', requestIdentity(request), 10, 60 * 60 * 1000);
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
      throw Object.assign(new Error('International card checkout and payment confirmation are not fully configured.'), { status: 503 });
    }
    const amount = Number(body.amount);
    if (!Number.isInteger(amount) || amount < 1 || amount > 500) throw Object.assign(new Error('Choose an amount from $1 to $500.'), { status: 400 });
    const name = cleanString(body.name, 60, 'Name') || 'Anonymous';
    const result = await db.prepare(`INSERT INTO donations (name, amount, status, payment_method, currency)
      VALUES (?, ?, 'pending', 'stripe', 'USD')`).run(name, amount);
    try {
      const forwardedProtocol = String(request.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
      const checkoutUrl = await startCheckout(Number(result.lastInsertRowid), amount, name, request.headers.host || `localhost:${port}`, forwardedProtocol);
      return sendJson(response, 201, { checkoutUrl });
    } catch (error) {
      await db.prepare('DELETE FROM donations WHERE id = ?').run(Number(result.lastInsertRowid));
      throw error;
    }
  }
  if (request.method === 'POST' && route === '/api/donations') {
    return sendJson(response, 410, { error: 'Choose a payment method on the payment page.' });
  }
  if (request.method === 'GET' && route === '/api/webhooks/stripe') {
    const raw = await readBody(request);
    if (!verifyStripeSignature(raw, request.headers['stripe-signature'])) return sendJson(response, 400, { error: 'Invalid Stripe webhook signature.' });
    const event = JSON.parse(raw);
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      if (session.payment_status === 'paid' && session.currency === 'usd') {
        await db.prepare(`UPDATE donations SET status = 'paid' WHERE stripe_session_id = ? AND payment_method = 'stripe'
          AND currency = 'USD' AND amount * 100 = ?`).run(session.id, session.amount_total);
      }
    }
    return sendJson(response, 200, { received: true });
  }
  return sendJson(response, 404, { error: 'API route not found.' });
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (request.method === 'POST' && url.pathname.startsWith('/api/') && url.pathname !== '/api/webhooks/stripe' && request.headers.origin) {
      let originHost = '';
      try { originHost = new URL(request.headers.origin).host.toLowerCase(); } catch {}
      if (originHost !== String(request.headers.host || '').toLowerCase()) return sendJson(response, 403, { error: 'Cross-origin request blocked.' });
    }
    if (url.pathname.startsWith('/api/')) return await handleApi(request, response, url);
    if (request.method !== 'GET' && request.method !== 'HEAD') return sendJson(response, 405, { error: 'Method not allowed.' });
    const requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const filePath = path.resolve(root, `.${requested}`);
    if (!filePath.startsWith(`${root}${path.sep}`) && filePath !== path.join(root, 'index.html')) return sendJson(response, 403, { error: 'Forbidden.' });
    let contents;
    try { contents = await fs.promises.readFile(filePath); }
    catch { return sendJson(response, 404, { error: 'Page not found.' }); }
    response.writeHead(200, { ...securityHeaders, 'Content-Security-Policy': contentSecurityPolicy, 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' });
    response.end(request.method === 'HEAD' ? undefined : contents);
  } catch (error) {
    console.error(error.message);
    if (error.retryAfter) response.setHeader('Retry-After', String(error.retryAfter));
    if (!response.headersSent) sendJson(response, error.status || 500, { error: error.status ? error.message : 'Something went wrong on the server.' });
  }
});

function listenOnAvailablePort(candidate, attempts = 0) {
  const onError = (error) => {
    server.removeListener('listening', onListening);
    if (error.code === 'EADDRINUSE' && attempts < 20 && candidate < 65535) {
      console.warn(`Port ${candidate} is already in use; trying ${candidate + 1}.`);
      listenOnAvailablePort(candidate + 1, attempts + 1);
      return;
    }
    console.error(`Could not start GoodCut on port ${candidate}: ${error.message}`);
    void db.close();
    process.exitCode = 1;
  };
  const onListening = () => {
    server.removeListener('error', onError);
    const address = server.address();
    console.log(`GoodCut is listening on port ${address.port}`);
  };
  server.once('error', onError);
  server.once('listening', onListening);
  server.listen(candidate);
}

const ready = initializeDatabase();

if (require.main === module) {
  ready.then(() => {
    listenOnAvailablePort(port);
  }).catch((error) => {
    console.error(`Could not initialize the GoodCut database: ${error.message}`);
    process.exitCode = 1;
    return db.close();
  }).catch((error) => {
    console.error(`Could not close the database cleanly: ${error.message}`);
    process.exitCode = 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => {
    Promise.resolve(db.close()).then(() => process.exit(0)).catch((error) => {
      console.error(`Could not close the database cleanly: ${error.message}`);
      process.exitCode = 1;
    });
  }));
}

module.exports = { server, ready };