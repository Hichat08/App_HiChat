export const updateConversationAfterCreateMessage = (
  conversation,
  message,
  senderId
) => {
  const previewContent =
    message.content?.trim() ||
    (message.audioUrl ? "Đã gửi âm thanh" : "") ||
    (message.videoUrl ? "Đã gửi video" : "") ||
    (message.imgUrl ? "Đã gửi hình ảnh" : "");

  conversation.set({
    seenBy: [],
    lastMessageAt: message.createdAt,
    lastMessage: {
      _id: message._id,
      content: previewContent,
      senderId,
      createdAt: message.createdAt,
    },
  });

  conversation.participants.forEach((p) => {
    const memberId = p.userId.toString();
    const isSender = memberId === senderId.toString();
    const prevCount = conversation.unreadCounts.get(memberId) || 0;
    conversation.unreadCounts.set(memberId, isSender ? 0 : prevCount + 1);
  });
};

export const buildNewMessagePayload = (conversation, message) => ({
  message,
  conversation: {
    _id: conversation._id,
    lastMessage: conversation.lastMessage,
    lastMessageAt: conversation.lastMessageAt,
    directRequest: conversation.directRequest ?? undefined,
  },
  unreadCounts: conversation.unreadCounts,
});

export const emitNewMessage = (io, conversation, message) => {
  io.to(conversation._id.toString()).emit(
    "new-message",
    buildNewMessagePayload(conversation, message)
  );
};
