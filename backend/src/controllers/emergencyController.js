import { query } from '../config/db.js';
import * as sos from '../services/emergency/sosService.js';
import { notFound } from '../utils/ApiError.js';

// ---- trusted contacts --------------------------------------------------

export async function listContacts(req, res) {
  const { rows } = await query(
    `SELECT id, name, phone, relation, priority, created_at
     FROM emergency_contacts WHERE user_id = $1
     ORDER BY priority ASC, created_at ASC`,
    [req.user.id],
  );
  res.json({ contacts: rows });
}

export async function addContact(req, res) {
  const { name, phone, relation, priority } = req.body;
  const { rows } = await query(
    `INSERT INTO emergency_contacts (user_id, name, phone, relation, priority)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, phone, relation, priority, created_at`,
    [req.user.id, name, phone, relation ?? null, priority],
  );
  res.status(201).json({ contact: rows[0] });
}

export async function deleteContact(req, res) {
  const { rowCount } = await query('DELETE FROM emergency_contacts WHERE id = $1 AND user_id = $2', [
    req.params.id,
    req.user.id,
  ]);
  if (rowCount === 0) throw notFound('Contact not found');
  res.json({ message: 'Contact deleted' });
}

// ---- SOS ---------------------------------------------------------------

export async function triggerSos(req, res) {
  const result = await sos.triggerSos({ userId: req.user.id, ...req.body });
  res.status(result.duplicate ? 200 : 201).json(result);
}

export async function confirmSos(req, res) {
  res.json(await sos.confirmDelivery({ userId: req.user.id, sosId: req.params.id, attempts: req.body.attempts }));
}

export async function resolveSos(req, res) {
  res.json({ sos: await sos.resolveSos({ userId: req.user.id, sosId: req.params.id, status: req.body.status }) });
}

export async function sosDetail(req, res) {
  res.json(await sos.getSosDetail({ userId: req.user.id, sosId: req.params.id }));
}

export async function listSos(req, res) {
  res.json({ incidents: await sos.listSos(req.user.id) });
}

// ---- nearby emergency infrastructure -----------------------------------

export async function nearbyFacilities(req, res) {
  const { lat, lng, radius, kind } = req.query;
  const { rows } = await query(
    `SELECT name, kind, phone, address,
            ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng,
            ST_Distance(geom, ST_MakePoint($2, $1)::geography) AS distance_m
     FROM emergency_locations
     WHERE ST_DWithin(geom, ST_MakePoint($2, $1)::geography, $3)
       AND ($4::text IS NULL OR kind = $4)
     ORDER BY distance_m ASC
     LIMIT 50`,
    [lat, lng, radius, kind ?? null],
  );
  res.json({
    facilities: rows.map((r) => ({
      name: r.name,
      kind: r.kind,
      phone: r.phone,
      address: r.address,
      lat: Number(r.lat),
      lng: Number(r.lng),
      distanceM: Math.round(Number(r.distance_m)),
    })),
  });
}
