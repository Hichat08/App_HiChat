import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";

export const markPendingDirectMessagesAsDelivered = async (userId, io) => {
  const uid = userId.toString();
  const now = new Date();

  const conversations = await Conversation.find({
    type: "direct",
    "participants.userId": uid,
  })
    .select("_id")
    .lean();

  for (const convo of conversations) {
    const pending = await Message.find({
      conversationId: convo._id,
      senderId: { $ne: uid },
      deliveredAt: null,
    })
      .select("_id")
      .lean();

    if (!pending.length) {
      continue;
    }

    const messageIds = pending.map((m) => m._id.toString());

    await Message.updateMany(
      { _id: { $in: messageIds } },
      {
        $set: { deliveredAt: now },
      },
    );

    io.to(convo._id.toString()).emit("messages-delivered", {
      conversationId: convo._id.toString(),
      messageIds,
      deliveredAt: now.toISOString(),
    });
  }
};
