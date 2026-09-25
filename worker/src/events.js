// Analytics events. The game sends each one to POST /api/event, and the Worker writes one row to the
// Analytics Engine dataset "newsworthy_events". The event table and queries are in DEPLOYMENT.md, "Analytics".
// Columns never change meaning, so old rows and saved queries stay valid:
// index1 = run id (or the page session outside a round), blob1 = type, blob2 = label, blob3 = detail,
// blob4 = player id, blob5 = page session, blob6 = run id, double1 = value.

// Only these types are accepted from the game; anything else is refused, so junk can't reach the data.
export const EVENT_TYPES = new Set([
  'page_opened', 'link_clicked',
  'command_sent', 'command_ack', 'model_error', 'incident_clicked', 'first_video_frame', 'closed',
  'photo_captured', 'photo_result', 'photo_failed',
]);

// Demand for live slots. Only the Worker records these, so the game can't fake them.
export const SERVER_EVENT_TYPES = new Set(['slot_opened', 'line_joined', 'turned_away']);

const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');
const ID = /^[a-zA-Z0-9-]{1,80}$/;

// Returns the Analytics Engine data point for an event, or null if the event isn't valid.
export function toDataPoint(event, player, types = EVENT_TYPES) {
  if (!event || !types.has(event.type) || !ID.test(event.session ?? '')) return null;
  const run = ID.test(event.run ?? '') ? event.run : '';
  const value = Number(event.value);
  return {
    indexes: [run || event.session],
    blobs: [event.type, text(event.label, 64), text(event.detail, 200), player, event.session, run],
    doubles: [Number.isFinite(value) ? value : 0],
  };
}

// A player id for counting unique players: HMAC-SHA256 of the IP, keyed with PLAYER_SALT so the IP
// can't be recovered by hashing every address. Without the secret, no id is recorded.
export async function playerId(salt, ip) {
  if (!salt || !ip) return '';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(salt), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip)));
  return [...mac.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
