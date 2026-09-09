/**
 * Editor SSE notifications.
 *
 * Two channels, easily confused. Most editor refreshes are NOT sent from here:
 * sb-api emits block:created / block:updated / block:deleted on its own when it
 * sees x-actor-caller: mcp. This endpoint is for what the API cannot infer —
 * the halt lifecycle, explicit site:reload, and user-facing toasts. Duplicating
 * block CRUD events here would double-refresh the editor.
 */

export function createNotifier(http) {
  /**
   * Swallows its own errors by design: a failed notification must never fail a
   * tool. The freeze protocol relies on this.
   */
  return async function notify(target, events) {
    const list = Array.isArray(events) ? events : [events];
    if (list.length === 0) return { sent: false };
    const { merchantId, projectId, domain } = target;
    try {
      await http.api(
        `/merchant/${merchantId}/project/${projectId}/landing/${domain}/notifications/notify`,
        {
          method: 'POST',
          body: JSON.stringify({ merchantId, projectId, domain, events: list }),
          label: `notify ${list.map((e) => e.type).join(',')}`,
        }
      );
      return { sent: true };
    } catch (error) {
      process.stderr.write(`warning: notification failed (${error.message})\n`);
      return { sent: false, error: error.message };
    }
  };
}

export const reloadSite = () => ({ type: 'site:reload' });
