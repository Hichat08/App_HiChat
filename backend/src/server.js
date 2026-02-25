import express from "express";
import dotenv from "dotenv";
import { connectDB } from "./libs/db.js";
import authRoute from "./routes/authRoute.js";
import userRoute from "./routes/userRoute.js";
import supportRoute from "./routes/supportRoute.js";
import friendRoute from "./routes/friendRoute.js";
import messageRoute from "./routes/messageRoute.js";
import conversationRoute from "./routes/conversationRoute.js";
import postRoute from "./routes/postRoute.js";
import archiveRoute from "./routes/archiveRoute.js";
import cookieParser from "cookie-parser";
import { protectedRoute } from "./middlewares/authMiddleware.js";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import fs from "fs";
import { app, server } from "./socket/index.js";
import { v2 as cloudinary } from "cloudinary";

dotenv.config();

// const app = express();
const PORT = process.env.PORT || 5004;
const LOCAL_MEDIA_URL_REGEX =
  /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(\/uploads\/[^\s"'`]+)/i;

const isPlainObject = (value) =>
  Object.prototype.toString.call(value) === "[object Object]";

const getPublicBaseUrlFromRequest = (req) => {
  const forwardedProtoRaw = req.headers["x-forwarded-proto"];
  const forwardedProto = Array.isArray(forwardedProtoRaw)
    ? forwardedProtoRaw[0]
    : forwardedProtoRaw?.toString().split(",")[0]?.trim();
  const protocol = forwardedProto || req.protocol || "https";
  const host = req.get("host");
  return host ? `${protocol}://${host}` : "";
};

const normalizeLocalMediaUrls = (payload, publicBaseUrl) => {
  if (typeof payload === "string") {
    if (payload.startsWith("/uploads/")) {
      return publicBaseUrl ? `${publicBaseUrl}${payload}` : payload;
    }

    const match = payload.match(LOCAL_MEDIA_URL_REGEX);
    if (!match) return payload;
    return publicBaseUrl ? `${publicBaseUrl}${match[1]}` : match[1];
  }

  if (Array.isArray(payload)) {
    return payload.map((item) => normalizeLocalMediaUrls(item, publicBaseUrl));
  }

  if (isPlainObject(payload)) {
    const normalized = {};
    for (const [key, value] of Object.entries(payload)) {
      normalized[key] = normalizeLocalMediaUrls(value, publicBaseUrl);
    }
    return normalized;
  }

  return payload;
};

// middlewares
app.set("trust proxy", 1);
app.use(express.json());
app.use(cookieParser());
app.use("/uploads", express.static("uploads"));

// CORS: allow developer ports and production domains
const allowedOrigins = [
  process.env.CLIENT_URL,
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "https://app-hichat-frontend.vercel.app",
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // allow non-browser clients like Postman (no origin)
      if (!origin) return callback(null, true);

      // check if origin is in whitelist
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // allow any vercel.app domain
      if (origin && origin.includes("vercel.app")) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use((req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = (payload) => {
    const configuredPublicBase = process.env.SERVER_PUBLIC_URL?.trim();
    const publicBaseUrl = configuredPublicBase || getPublicBaseUrlFromRequest(req);
    const normalizedPayload = normalizeLocalMediaUrls(payload, publicBaseUrl);
    return originalJson(normalizedPayload);
  };

  next();
});

// CLOUDINARY Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME?.trim(),
  api_key: process.env.CLOUDINARY_API_KEY?.trim(),
  api_secret: process.env.CLOUDINARY_API_SECRET?.trim(),
});

// swagger
const swaggerDocument = JSON.parse(
  fs.readFileSync("./src/swagger.json", "utf8"),
);

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// public routes
app.use("/api/auth", authRoute);
app.use("/api/users/support", supportRoute);

// private routes
app.use(protectedRoute);
app.use("/api/users", userRoute);
app.use("/api/friends", friendRoute);
app.use("/api/messages", messageRoute);
app.use("/api/conversations", conversationRoute);
app.use("/api/posts", postRoute);
app.use("/api/archives", archiveRoute);

// start server after DB connection
connectDB()
  .then(() => {
    // handle listen errors (eg. port already in use)
    server.on("error", (err) => {
      if (err && err.code === "EADDRINUSE") {
        console.error(`Port ${PORT} is already in use. Exiting.`);
        process.exit(1);
      }
      console.error("Server error:", err);
    });

    if (!server.listening) {
      server.listen(PORT, () => {
        console.log(`server bắt đầu trên cổng ${PORT}`);
      });
    } else {
      console.log(`Server already listening on port ${PORT}`);
    }
  })
  .catch((err) => {
    console.error("Failed to start server due to DB error:", err);
    process.exit(1);
  });

// graceful shutdown
const shutdown = () => {
  console.log("Shutting down server...");
  server.close(() => {
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
