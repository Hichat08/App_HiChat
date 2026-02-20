import mongoose from "mongoose";
import User from "../models/User.js";

export const connectDB = async () => {
  try {
    // @ts-ignore
    await mongoose.connect(process.env.MONGODB_CONNECTIONSTRING);

    // Ensure contact indexes support optional email/phone sign-up.
    // Old deployments may still have non-sparse unique indexes.
    const indexes = await User.collection.indexes();
    const emailIndex = indexes.find((idx) => idx.name === "email_1");
    const phoneIndex = indexes.find((idx) => idx.name === "phone_1");

    if (emailIndex && emailIndex.sparse !== true) {
      await User.collection.dropIndex("email_1");
      await User.collection.createIndex(
        { email: 1 },
        { unique: true, sparse: true, name: "email_1" },
      );
    }

    if (phoneIndex && phoneIndex.sparse !== true) {
      await User.collection.dropIndex("phone_1");
      await User.collection.createIndex(
        { phone: 1 },
        { unique: true, sparse: true, name: "phone_1" },
      );
    }

    console.log("Liên kết CSDL thành công!");
  } catch (error) {
    console.log("Lỗi khi kết nối CSDL:", error);
    console.log(
      "Gợi ý: nếu bạn dùng MongoDB Atlas (mongodb+srv://...), kiểm tra kết nối mạng/DNS or try replacing '+srv' with 'mongodb' in the connection string for debugging.",
    );
    console.log("Kiểm tra biến môi trường MONGODB_CONNECTIONSTRING trong .env");
    process.exit(1);
  }
};
