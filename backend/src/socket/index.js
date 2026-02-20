import { Server } from "socket.io";
import http from "http";
import express from "express";
import { socketAuthMiddleware } from "../middlewares/socketMiddleware.js";
import { getUserConversationsForSocketIO } from "../controllers/conversationController.js";
import { markPendingDirectMessagesAsDelivered } from "../utils/messageStatusHelper.js";

const app = express();

const server = http.createServer(app);

const allowedOrigins = [process.env.CLIENT_URL, "http://localhost:5173"].filter(
  Boolean,
);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

io.use(socketAuthMiddleware);

const onlineUsers = new Map(); // {userId: { sockets: Set<socketId>, visible: boolean }}

const emitOnlineUsers = () => {
  const visibleOnlineUserIds = [];

  onlineUsers.forEach((entry, userId) => {
    if ((entry?.sockets?.size ?? 0) > 0 && entry.visible) {
      visibleOnlineUserIds.push(userId);
    }
  });

  io.emit("online-users", visibleOnlineUserIds);
};

const addOnlineSocket = (userId, socketId, visible = true) => {
  const uid = userId.toString();
  const existing =
    onlineUsers.get(uid) ?? {
      sockets: new Set(),
      visible: !!visible,
    };

  existing.sockets.add(socketId);
  existing.visible = !!visible;
  onlineUsers.set(uid, existing);
};

const removeOnlineSocket = (userId, socketId) => {
  const uid = userId.toString();
  const existing = onlineUsers.get(uid);

  if (!existing) return;

  existing.sockets.delete(socketId);

  if (existing.sockets.size === 0) {
    onlineUsers.delete(uid);
    return;
  }

  onlineUsers.set(uid, existing);
};

const isUserOnline = (userId) => {
  const uid = userId?.toString();
  if (!uid) return false;
  const entry = onlineUsers.get(uid);
  return ((entry?.sockets?.size ?? 0) > 0) && !!entry?.visible;
};

const setUserOnlineVisibility = (userId, visible) => {
  const uid = userId?.toString();
  if (!uid) return;

  const existing = onlineUsers.get(uid);
  if (!existing) return;

  existing.visible = !!visible;
  onlineUsers.set(uid, existing);
  emitOnlineUsers();
};

io.on("connection", async (socket) => {
  const user = socket.user;

  // console.log(`${user.displayName} online với socket ${socket.id}`);

  addOnlineSocket(user._id, socket.id, user.showOnlineStatus !== false);
  emitOnlineUsers();

  const conversationIds = await getUserConversationsForSocketIO(user._id);
  conversationIds.forEach((id) => {
    socket.join(id);
  });

  socket.on("join-conversation", (conversationId) => {
    socket.join(conversationId);
  });

  socket.on("call:offer", ({ toUserId, conversationId, offer, callType = "audio" }) => {
    if (!toUserId || !offer) return;
    io.to(toUserId.toString()).emit("call:incoming", {
      fromUserId: user._id.toString(),
      conversationId: conversationId?.toString?.() || null,
      callType,
      offer,
      caller: {
        _id: user._id.toString(),
        displayName: user.displayName,
        avatarUrl: user.avatarUrl ?? null,
      },
    });
  });

  socket.on("call:answer", ({ toUserId, answer }) => {
    if (!toUserId || !answer) return;
    io.to(toUserId.toString()).emit("call:answered", {
      fromUserId: user._id.toString(),
      answer,
    });
  });

  socket.on("call:ice", ({ toUserId, candidate }) => {
    if (!toUserId || !candidate) return;
    io.to(toUserId.toString()).emit("call:ice", {
      fromUserId: user._id.toString(),
      candidate,
    });
  });

  socket.on("call:reject", ({ toUserId }) => {
    if (!toUserId) return;
    io.to(toUserId.toString()).emit("call:rejected", {
      fromUserId: user._id.toString(),
    });
  });

  socket.on("call:end", ({ toUserId }) => {
    if (!toUserId) return;
    io.to(toUserId.toString()).emit("call:ended", {
      fromUserId: user._id.toString(),
    });
  });

  socket.join(user._id.toString());
  await markPendingDirectMessagesAsDelivered(user._id.toString(), io);

  socket.on("disconnect", () => {
    removeOnlineSocket(user._id, socket.id);
    emitOnlineUsers();
    /* console.log(`socket disconnected: ${socket.id}`); */
  });
});

export { io, app, server, isUserOnline, setUserOnlineVisibility };
