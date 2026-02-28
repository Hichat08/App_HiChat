import mongoose from "mongoose";

const lessonAccuracySchema = new mongoose.Schema(
  {
    total: { type: Number, default: 0, min: 0 },
    correct: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const examAttemptSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    username: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    displayName: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    subjectId: {
      type: String,
      trim: true,
      default: "tin",
      index: true,
    },
    subjectName: {
      type: String,
      trim: true,
      default: "Tin học",
    },
    mode: {
      type: String,
      enum: [
        "normal",
        "mediumHard",
        "hard",
        "wrongOnly",
        "custom",
        "sprint15",
        "lesson",
        "python45",
      ],
      default: "normal",
      index: true,
    },
    score: {
      type: Number,
      required: true,
      min: 0,
      max: 10,
    },
    total: { type: Number, required: true, min: 1 },
    correct: { type: Number, required: true, min: 0 },
    incorrect: { type: Number, required: true, min: 0 },
    blank: { type: Number, required: true, min: 0 },
    durationMinutes: { type: Number, default: 0, min: 0 },
    lessonAccuracy: {
      type: Map,
      of: lessonAccuracySchema,
      default: {},
    },
  },
  { timestamps: true },
);

examAttemptSchema.index({ createdAt: -1 });
examAttemptSchema.index({ subjectId: 1, mode: 1, createdAt: -1 });

const ExamAttempt = mongoose.model("ExamAttempt", examAttemptSchema);
export default ExamAttempt;

