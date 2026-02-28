import mongoose from "mongoose";

const examUserStateSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    subjectId: {
      type: String,
      trim: true,
      default: "tin",
      index: true,
    },
    wrongQuestionSet: {
      type: [String],
      default: [],
    },
    noteMap: {
      type: Map,
      of: String,
      default: {},
    },
  },
  { timestamps: true },
);

examUserStateSchema.index({ userId: 1, subjectId: 1 }, { unique: true });

const ExamUserState = mongoose.model("ExamUserState", examUserStateSchema);
export default ExamUserState;

