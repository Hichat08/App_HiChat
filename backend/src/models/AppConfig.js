import mongoose from "mongoose";

const appConfigSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, index: true, required: true },
    bannerUrl: { type: String, default: "" },
    bannerId: { type: String, default: "" },
  },
  { timestamps: true },
);

const AppConfig = mongoose.model("AppConfig", appConfigSchema);

export default AppConfig;
