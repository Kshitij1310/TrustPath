import { query } from '../../config/db.js';
import { notFound } from '../../utils/ApiError.js';
import { toPointWkt } from '../../utils/geo.js';

/**
 * SOS orchestration.
 *
 * Zero-budget rule: the server does NOT claim to have sent anything. It
 * records the event, assembles everything the device needs (contacts, tel:
 * and sms: links, a location URL) and returns it. The device performs the
 * actual call/SMS/share, then reports back what really happened via
 * `confirmDelivery`. Status stays "prepared" until then.
 */

const mapsUrl = (lat, lng) =>
  lat === null || lng === null
    ? null
    : `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;

function buildMessage({ userName, lat, lng, notes }) {
  const parts = [`${userName} triggered an SOS on TrustRoute.`];
  if (notes) parts.push(notes);
  const url = mapsUrl(lat, lng);
  if (url) parts.push(`Last known location: ${url}`);
  else parts.push('Location was unavailable on the device.');
  return parts.join(' ');
}

export async function triggerSos({ userId, lat = null, lng = null, journeyId = null, trigger, notes, clientRef }) {
  // Offline replays arrive with the same clientRef; do not create duplicates.
  if (clientRef) {
    const { rows } = await query(
      `SELECT id FROM sos_incidents WHERE client_ref = $1 AND user_id = $2`,
      [clientRef, userId],
    );
    if (rows.length > 0) {
      return { ...(await getSosDetail({ userId, sosId: rows[0].id })), duplicate: true };
    }
  }

  const { rows } = await query(
    `INSERT INTO sos_incidents (user_id, journey_id, geom, trigger, notes, client_ref)
     VALUES ($1, $2,
             CASE WHEN $3::text IS NULL THEN NULL ELSE ST_GeogFromText($3) END,
             $4, $5, $6)
     RETURNING id, created_at, status`,
    [
      userId,
      journeyId,
      lat === null || lng === null ? null : toPointWkt([lat, lng]),
      trigger,
      notes ?? null,
      clientRef ?? null,
    ],
  );
  const sos = rows[0];

  if (journeyId) {
    await query(`UPDATE journeys SET status = 'sos' WHERE id = $1 AND user_id = $2`, [journeyId, userId]);
    await query(`INSERT INTO journey_events (journey_id, kind, payload) VALUES ($1, 'sos', $2::jsonb)`, [
      journeyId,
      JSON.stringify({ sosId: sos.id, trigger }),
    ]);
  }

  const [{ rows: contacts }, { rows: userRows }, { rows: nearby }] = await Promise.all([
    query(
      `SELECT id, name, phone, relation FROM emergency_contacts
       WHERE user_id = $1 ORDER BY priority ASC, created_at ASC`,
      [userId],
    ),
    query('SELECT display_name FROM users WHERE id = $1', [userId]),
    lat === null || lng === null
      ? Promise.resolve({ rows: [] })
      : query(
          `SELECT name, kind, phone, ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng,
                  ST_Distance(geom, ST_GeogFromText($1)) AS distance_m
           FROM emergency_locations
           WHERE ST_DWithin(geom, ST_GeogFromText($1), 10000)
           ORDER BY distance_m ASC LIMIT 5`,
          [toPointWkt([lat, lng])],
        ),
  ]);

  const message = buildMessage({ userName: userRows[0]?.display_name ?? 'A TrustRoute user', lat, lng, notes });

  return {
    sos: { id: sos.id, status: sos.status, createdAt: sos.created_at, trigger },
    // Explicit: nothing has been delivered yet.
    delivery: {
      state: 'prepared',
      note: 'The server has not sent any message. Perform these actions on the device, then POST /api/emergency/sos/:id/confirm with the result.',
    },
    location: lat === null ? null : { lat, lng, mapsUrl: mapsUrl(lat, lng) },
    message,
    contacts: contacts.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      relation: c.relation,
      callUrl: `tel:${c.phone}`,
      smsUrl: `sms:${c.phone}?body=${encodeURIComponent(message)}`,
      whatsappUrl: `https://wa.me/${c.phone.replace(/[^\d]/g, '')}?text=${encodeURIComponent(message)}`,
    })),
    publicServices: [
      { name: 'Emergency (India)', phone: '112', callUrl: 'tel:112' },
      { name: 'Women Helpline (India)', phone: '1091', callUrl: 'tel:1091' },
    ],
    nearestFacilities: nearby.map((f) => ({
      name: f.name,
      kind: f.kind,
      phone: f.phone,
      lat: Number(f.lat),
      lng: Number(f.lng),
      distanceM: Math.round(Number(f.distance_m)),
    })),
  };
}

/** The device tells us what it actually managed to do. */
export async function confirmDelivery({ userId, sosId, attempts }) {
  const { rows } = await query(
    `UPDATE sos_incidents
     SET notified = notified || $3::jsonb
     WHERE id = $1 AND user_id = $2
     RETURNING id, notified`,
    [sosId, userId, JSON.stringify(attempts)],
  );
  if (rows.length === 0) throw notFound('SOS incident not found');
  const anySucceeded = attempts.some((a) => a.result === 'sent');
  return {
    sosId: rows[0].id,
    notified: rows[0].notified,
    delivery: { state: anySucceeded ? 'confirmed_by_device' : 'not_delivered' },
  };
}

export async function resolveSos({ userId, sosId, status }) {
  const { rows } = await query(
    `UPDATE sos_incidents
     SET status = $3, resolved_at = now()
     WHERE id = $1 AND user_id = $2
     RETURNING id, status, resolved_at`,
    [sosId, userId, status],
  );
  if (rows.length === 0) throw notFound('SOS incident not found');
  return rows[0];
}

export async function getSosDetail({ userId, sosId }) {
  const { rows } = await query(
    `SELECT id, journey_id, trigger, status, notes, notified, created_at, resolved_at,
            ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng
     FROM sos_incidents WHERE id = $1 AND user_id = $2`,
    [sosId, userId],
  );
  if (rows.length === 0) throw notFound('SOS incident not found');
  const row = rows[0];
  return {
    sos: {
      id: row.id,
      journeyId: row.journey_id,
      trigger: row.trigger,
      status: row.status,
      notes: row.notes,
      notified: row.notified,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
      location: row.lat === null ? null : { lat: Number(row.lat), lng: Number(row.lng) },
    },
  };
}

export async function listSos(userId) {
  const { rows } = await query(
    `SELECT id, trigger, status, created_at, resolved_at FROM sos_incidents
     WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [userId],
  );
  return rows;
}
