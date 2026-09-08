import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import { signToken } from '../middleware/auth.js';
import { conflict, unauthorized } from '../utils/ApiError.js';

const publicUser = (row) => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name,
  phone: row.phone,
  role: row.role,
  settings: row.settings,
  createdAt: row.created_at,
});

export async function register(req, res) {
  const { email, password, displayName, phone } = req.body;

  const existing = await query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [email]);
  if (existing.rowCount > 0) throw conflict('An account with that email already exists');

  const passwordHash = await bcrypt.hash(password, 12);
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, display_name, phone)
     VALUES (lower($1), $2, $3, $4)
     RETURNING *`,
    [email, passwordHash, displayName, phone ?? null],
  );

  res.status(201).json({ token: signToken(rows[0]), user: publicUser(rows[0]) });
}

export async function login(req, res) {
  const { email, password } = req.body;
  const { rows } = await query('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
  const user = rows[0];

  // Same message and roughly the same work either way — do not leak which
  // emails are registered.
  const ok = user ? await bcrypt.compare(password, user.password_hash) : false;
  if (!ok) throw unauthorized('Invalid email or password');

  res.json({ token: signToken(user), user: publicUser(user) });
}

export async function me(req, res) {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  res.json({ user: publicUser(rows[0]) });
}

export async function updateSettings(req, res) {
  const { rows } = await query(
    `UPDATE users SET settings = settings || $2::jsonb WHERE id = $1 RETURNING *`,
    [req.user.id, JSON.stringify(req.body)],
  );
  res.json({ user: publicUser(rows[0]) });
}

/**
 * Statelessness means logout is a client-side token discard. Exposed anyway so
 * the frontend has one obvious call, and so audit logging has a hook later.
 */
export async function logout(_req, res) {
  res.json({ message: 'Token discarded client-side. Delete it from storage.' });
}

export async function deleteAccount(req, res) {
  // ON DELETE CASCADE removes journeys, contacts, locations and SOS records.
  await query('DELETE FROM users WHERE id = $1', [req.user.id]);
  res.json({ message: 'Account and associated personal data deleted' });
}
