import UserArchiveItem from "../models/UserArchiveItem.js";

export const getMyArchiveItems = async (req, res) => {
  try {
    const userId = req.user._id;
    const items = await UserArchiveItem.find({ userId }).sort({ createdAt: -1 });
    return res.status(200).json({ items });
  } catch (error) {
    console.error("Lỗi lấy kho lưu trữ", error);
    return res.status(500).json({ message: "Không thể tải kho lưu trữ" });
  }
};

export const createArchiveItem = async (req, res) => {
  try {
    const userId = req.user._id;
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";

    if (!title) {
      return res.status(400).json({ message: "Tiêu đề là bắt buộc" });
    }

    const item = await UserArchiveItem.create({
      userId,
      title,
      content,
    });

    return res.status(201).json({ message: "Đã thêm vào kho lưu trữ", item });
  } catch (error) {
    console.error("Lỗi tạo item kho lưu trữ", error);
    return res.status(500).json({ message: "Không thể tạo mục lưu trữ" });
  }
};

export const updateArchiveItem = async (req, res) => {
  try {
    const userId = req.user._id;
    const { itemId } = req.params;
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : undefined;
    const content = typeof req.body?.content === "string" ? req.body.content.trim() : undefined;

    if (typeof title === "string" && !title) {
      return res.status(400).json({ message: "Tiêu đề là bắt buộc" });
    }

    const updatePayload = {};
    if (typeof title === "string") updatePayload.title = title;
    if (typeof content === "string") updatePayload.content = content;

    const item = await UserArchiveItem.findOneAndUpdate(
      { _id: itemId, userId },
      { $set: updatePayload },
      { new: true }
    );

    if (!item) {
      return res.status(404).json({ message: "Không tìm thấy mục lưu trữ" });
    }

    return res.status(200).json({ message: "Đã cập nhật mục lưu trữ", item });
  } catch (error) {
    console.error("Lỗi cập nhật item kho lưu trữ", error);
    return res.status(500).json({ message: "Không thể cập nhật mục lưu trữ" });
  }
};

export const deleteArchiveItem = async (req, res) => {
  try {
    const userId = req.user._id;
    const { itemId } = req.params;

    const item = await UserArchiveItem.findOneAndDelete({ _id: itemId, userId });
    if (!item) {
      return res.status(404).json({ message: "Không tìm thấy mục lưu trữ" });
    }

    return res.status(200).json({ message: "Đã xoá mục lưu trữ" });
  } catch (error) {
    console.error("Lỗi xoá item kho lưu trữ", error);
    return res.status(500).json({ message: "Không thể xoá mục lưu trữ" });
  }
};
