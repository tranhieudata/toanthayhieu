function replyChatId(config) {
  return String(config.replyChatId || config.chatId);
}

function conversationChatId(config) {
  if (replyChatId(config) === String(config.groupChatId)) {
    return `${replyChatId(config)}:${config.replyThreadId || 0}:${config.telegramUserId}:${config.groupConnectionId || config.groupChatId}`;
  }
  return String(config.chatId);
}

function withReplyContext(config, chatId, threadId) {
  return { ...(config.toObject ? config.toObject() : config), replyChatId: String(chatId), replyThreadId: threadId || null };
}

function updateContext(config, update) {
  const message = update.callback_query?.message || update.message;
  return withReplyContext(config, message?.chat?.id || config.chatId, message?.message_thread_id);
}

function contextRouting(config) {
  const group = replyChatId(config) === String(config.groupChatId);
  return {
    interactive: true, requestedBy: String(config.telegramUserId),
    target: group ? 'group' : 'private', targetChatId: replyChatId(config),
    targetThreadId: config.replyThreadId || null,
    ...(group ? { groupConnectionId: config.groupConnectionId || config.groupChatId } : {}),
  };
}

function deliveryContext(config, delivery) {
  return withReplyContext(config, delivery.target === 'group' ? delivery.targetChatId : config.chatId, delivery.target === 'group' ? delivery.targetThreadId : null);
}

module.exports = { replyChatId, conversationChatId, withReplyContext, updateContext, contextRouting, deliveryContext };
