import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";

const MAX_IMAGE_SIZE_MB = 50;
const MAX_IMAGE_SIZE_BYTES = 1024 * 1024 * MAX_IMAGE_SIZE_MB;
const MAX_POST_MEDIA_FILES = 10;
const ALLOWED_IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".avif",
  ".bmp",
  ".tif",
  ".tiff",
  ".jfif",
  ".heic",
  ".heif",
]);
const ALLOWED_VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".mov",
  ".webm",
  ".mkv",
  ".avi",
  ".m4v",
  ".3gp",
]);
const ALLOWED_AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".ogg",
  ".m4a",
  ".aac",
  ".flac",
  ".opus",
  ".webm",
]);

const MIME_EXTENSION_MAP = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
  "image/bmp": ".bmp",
  "image/tiff": ".tiff",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "image/svg+xml": ".svg",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "video/x-matroska": ".mkv",
  "video/x-msvideo": ".avi",
  "video/3gpp": ".3gp",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/ogg": ".ogg",
  "audio/mp4": ".m4a",
  "audio/aac": ".aac",
  "audio/flac": ".flac",
  "audio/webm": ".webm",
};

const normalizeMime = (mimetype = "") => mimetype.toString().split(";")[0].trim().toLowerCase();

const ensureDir = async (folderPath) => {
  await fs.mkdir(folderPath, { recursive: true });
};

const saveBufferToLocal = async ({ buffer, mimetype, folder }) => {
  const normalizedMime = normalizeMime(mimetype);
  const extension = MIME_EXTENSION_MAP[normalizedMime] || ".bin";
  const filename = `${Date.now()}-${crypto.randomUUID()}${extension}`;
  const relativeFolder = path.join("uploads", folder);
  const absoluteFolder = path.join(process.cwd(), relativeFolder);
  await ensureDir(absoluteFolder);
  const absolutePath = path.join(absoluteFolder, filename);
  await fs.writeFile(absolutePath, buffer);
  const publicPath = `/${relativeFolder.replace(/\\/g, "/")}/${filename}`;
  const port = process.env.PORT || 5004;
  const publicBaseUrl =
    process.env.SERVER_PUBLIC_URL?.trim() || `http://localhost:${port}`;
  return {
    secure_url: `${publicBaseUrl}${publicPath}`,
    public_id: `${folder}/${filename}`,
  };
};

const getFileExt = (file) =>
  path.extname((file?.originalname || "").toLowerCase());

const isImageFile = (file) => {
  const mime = normalizeMime(file?.mimetype || "");
  if (mime.startsWith("image/")) return true;
  return ALLOWED_IMAGE_EXTENSIONS.has(getFileExt(file));
};

const isVideoFile = (file) => {
  const mime = normalizeMime(file?.mimetype || "");
  if (mime.startsWith("video/")) return true;
  return ALLOWED_VIDEO_EXTENSIONS.has(getFileExt(file));
};

const isAudioFile = (file) => {
  const mime = normalizeMime(file?.mimetype || "");
  if (mime.startsWith("audio/")) return true;
  return ALLOWED_AUDIO_EXTENSIONS.has(getFileExt(file));
};

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_SIZE_BYTES,
  },
  fileFilter: (req, file, cb) => {
    if (!isImageFile(file)) {
      return cb(new Error("Chỉ hỗ trợ file ảnh"));
    }

    cb(null, true);
  },
});

export const uploadSingleImage = (field = "file") => {
  return (req, res, next) => {
    upload.single(field)(req, res, (err) => {
      if (!err) {
        return next();
      }

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            message: `Ảnh vượt quá ${MAX_IMAGE_SIZE_MB}MB. Vui lòng chọn ảnh nhỏ hơn.`,
          });
        }

        return res.status(400).json({ message: "File upload không hợp lệ" });
      }

      return res.status(400).json({
        message: err.message || "Không thể tải ảnh lên",
      });
    });
  };
};

export const uploadImageFromBuffer = (buffer, options, mimetype = "image/jpeg") => {
  return new Promise((resolve) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "hichat/avatars",
        resource_type: "auto",
        ...options,
      },
      async (error, result) => {
        if (!error && result) {
          return resolve(result);
        }

        console.error("Cloudinary avatar upload lỗi, fallback local:", error?.message);
        const localResult = await saveBufferToLocal({
          buffer,
          mimetype,
          folder: "avatars",
        });
        resolve(localResult);
      }
    );

    uploadStream.end(buffer);
  });
};

const postMediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_SIZE_BYTES,
    files: MAX_POST_MEDIA_FILES,
  },
  fileFilter: (req, file, cb) => {
    if (isImageFile(file) || isVideoFile(file)) {
      return cb(null, true);
    }
    return cb(new Error("Chỉ hỗ trợ ảnh hoặc video"));
  },
});

export const uploadPostMedia = (field = "media") => {
  return (req, res, next) => {
    postMediaUpload.array(field, MAX_POST_MEDIA_FILES)(req, res, (err) => {
      if (!err) return next();

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            message: `File vượt quá ${MAX_IMAGE_SIZE_MB}MB. Vui lòng chọn file nhỏ hơn.`,
          });
        }
        return res.status(400).json({ message: "File upload không hợp lệ" });
      }

      return res.status(400).json({
        message: err.message || "Không thể tải media lên",
      });
    });
  };
};

export const uploadMediaFromBuffer = (buffer, mimetype, options) => {
  return new Promise((resolve) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "hichat/posts",
        resource_type: "auto",
        ...options,
      },
      async (error, result) => {
        if (!error && result) {
          return resolve(result);
        }

        console.error("Cloudinary post upload lỗi, fallback local:", error?.message);
        const localResult = await saveBufferToLocal({
          buffer,
          mimetype,
          folder: "posts",
        });
        resolve(localResult);
      }
    );

    uploadStream.end(buffer);
  });
};

const chatMediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_SIZE_BYTES,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    if (isImageFile(file) || isAudioFile(file) || isVideoFile(file)) {
      return cb(null, true);
    }
    return cb(new Error("Chỉ hỗ trợ ảnh, video hoặc âm thanh"));
  },
});

export const uploadChatMediaSingle = (field = "file") => {
  return (req, res, next) => {
    chatMediaUpload.single(field)(req, res, (err) => {
      if (!err) return next();

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            message: `File vượt quá ${MAX_IMAGE_SIZE_MB}MB. Vui lòng chọn file nhỏ hơn.`,
          });
        }
        return res.status(400).json({ message: "File upload không hợp lệ" });
      }

      return res.status(400).json({
        message: err.message || "Không thể tải media lên",
      });
    });
  };
};
