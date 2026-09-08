import * as service from '../services/journey/journeyService.js';
import { emitJourneyUpdate } from '../websocket/index.js';

export async function create(req, res) {
  const journey = await service.startJourney({ userId: req.user.id, ...req.body });
  res.status(201).json({
    journey,
    shareUrl: journey.shareToken ? `/shared/${journey.shareToken}` : null,
  });
}

export async function list(req, res) {
  res.json({ journeys: await service.listJourneys(req.user.id) });
}

export async function detail(req, res) {
  res.json({ journey: await service.getJourneyDetail({ userId: req.user.id, journeyId: req.params.id }) });
}

export async function pushLocation(req, res) {
  const result = await service.pushLocation({
    userId: req.user.id,
    journeyId: req.params.id,
    ...req.body,
  });

  emitJourneyUpdate(req.params.id, 'journey:location', result);
  for (const event of result.events) {
    emitJourneyUpdate(req.params.id, `journey:${event.kind}`, event);
  }

  res.json(result);
}

export async function checkIn(req, res) {
  const journey = await service.checkIn({
    userId: req.user.id,
    journeyId: req.params.id,
    extendMinutes: req.body.extendMinutes,
  });
  emitJourneyUpdate(req.params.id, 'journey:checked_in', journey);
  res.json({ journey });
}

export async function end(req, res) {
  const journey = await service.endJourney({
    userId: req.user.id,
    journeyId: req.params.id,
    status: req.body.status,
  });
  emitJourneyUpdate(req.params.id, 'journey:ended', journey);
  res.json({ journey });
}

/** Public: a trusted contact opening a share link. No auth, token-scoped. */
export async function shared(req, res) {
  res.json({ journey: await service.getSharedJourney(req.params.token) });
}
