/**
 * notification — send_notification.
 *
 * Also the only way to end the editor freeze: halt: "end" must be sent exactly
 * once, when the whole task is finished, not after each command.
 */

export async function send_notification(ctx, args) {
  const { merchantId, projectId, domain, title, description, palette, pageId, halt } = args;

  if (halt) {
    // An explicit halt is authoritative — it sets or clears the freeze state
    // and fires the matching event.
    await ctx.halt.setHalt({ merchantId, projectId, domain }, halt);
    return { halt, domain, note: halt === 'end' ? 'Editor unfrozen.' : 'Editor frozen.' };
  }

  const event = {
    type: 'notification',
    title,
    ...(description ? { description } : {}),
    ...(palette ? { palette } : {}),
    ...(pageId ? { pageId } : {}),
  };

  const result = await ctx.notify({ merchantId, projectId, domain }, event);
  return { sent: result.sent, event };
}
