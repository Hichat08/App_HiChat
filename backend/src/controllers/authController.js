// @ts-nocheck
import bcrypt from "bcrypt";
import User from "../models/User.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import Session from "../models/Session.js";

const ACCESS_TOKEN_TTL = "30m"; // thuờng là dưới 15m
const REFRESH_TOKEN_TTL = 14 * 24 * 60 * 60 * 1000; // 14 ngày
const normalizeDisplayName = (value = "") =>
  value
    .toString()
    .trim()
    .replace(/\s+/g, " ");
const escapeRegex = (value = "") => value.toString().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const signUp = async (req, res) => {
  try {
    const { username, password, email, firstName, lastName, phone, birthday } = req.body;

    if (!username || !password || !firstName || !lastName || !birthday) {
      return res.status(400).json({
        message: "Không thể thiếu username, password, firstName, lastName và birthday",
      });
    }

    const normalizePhone = (value) => value.toString().replace(/\D/g, "");
    const normalizedUsername = username.toString().trim().toLowerCase();
    const normalizedEmail = (email || "").toString().trim().toLowerCase();
    const normalizedPhone = normalizePhone(phone || "");
    const normalizedFirstName = firstName.toString().trim();
    const normalizedLastName = lastName.toString().trim();

    if (!normalizedUsername || !normalizedFirstName || !normalizedLastName) {
      return res.status(400).json({
        message: "Không thể thiếu username, password, firstName, lastName và birthday",
      });
    }

    const parsedBirthday = new Date(birthday);
    if (Number.isNaN(parsedBirthday.getTime())) {
      return res.status(400).json({ message: "Ngày tháng năm sinh không hợp lệ" });
    }
    if (parsedBirthday > new Date()) {
      return res.status(400).json({ message: "Ngày tháng năm sinh không được lớn hơn hôm nay" });
    }

    if (!normalizedEmail && !normalizedPhone) {
      return res
        .status(400)
        .json({ message: "Vui lòng cung cấp email hoặc số điện thoại để đăng ký" });
    }

    if (normalizedEmail) {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(normalizedEmail)) {
        return res.status(400).json({ message: "Email không hợp lệ" });
      }
    }

    if (normalizedPhone && normalizedPhone.length < 9) {
      return res.status(400).json({ message: "Số điện thoại không hợp lệ" });
    }

    const displayName = normalizeDisplayName(`${normalizedLastName} ${normalizedFirstName}`);
    if (!displayName) {
      return res.status(400).json({ message: "Tên hiển thị không hợp lệ" });
    }

    if (await User.exists({ username: normalizedUsername })) {
      return res.status(409).json({ message: "Tên đăng nhập đã tồn tại" });
    }

    if (normalizedEmail && (await User.exists({ email: normalizedEmail }))) {
      return res.status(409).json({ message: "Email đã tồn tại" });
    }

    if (normalizedPhone && (await User.exists({ phone: normalizedPhone }))) {
      return res.status(409).json({ message: "Số điện thoại đã tồn tại" });
    }

    if (
      await User.exists({
        displayName: { $regex: `^${escapeRegex(displayName)}$`, $options: "i" },
      })
    ) {
      return res.status(409).json({ message: "Tên hiển thị đã tồn tại" });
    }

    // mã hoá password
    const hashedPassword = await bcrypt.hash(password, 10); // salt = 10

    // tạo user mới
    await User.create({
      username: normalizedUsername,
      hashedPassword,
      ...(normalizedEmail ? { email: normalizedEmail } : {}),
      displayName,
      ...(normalizedPhone ? { phone: normalizedPhone } : {}),
      birthday: parsedBirthday,
    });

    // return
    return res.sendStatus(204);
  } catch (error) {
    if (error?.code === 11000) {
      const duplicatedField = Object.keys(error?.keyPattern || {})[0];
      const fieldMessageMap = {
        username: "Tên đăng nhập đã tồn tại",
        email: "Email đã tồn tại",
        phone: "Số điện thoại đã tồn tại",
        displayName: "Tên hiển thị đã tồn tại",
      };
      return res.status(409).json({
        message: fieldMessageMap[duplicatedField] || "Thông tin đăng ký đã tồn tại",
      });
    }
    console.error("Lỗi khi gọi signUp", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const signIn = async (req, res) => {
  try {
    // lấy inputs
    const { username, password } = req.body;
    const normalizedUsername = username?.toString?.().trim?.().toLowerCase?.();

    if (!normalizedUsername || !password) {
      return res.status(400).json({ message: "Thiếu username hoặc password." });
    }

    // lấy hashedPassword trong db để so với password input
    const user = await User.findOne({ username: normalizedUsername });

    if (!user) {
      return res
        .status(401)
        .json({ message: "username hoặc password không chính xác" });
    }

    // kiểm tra password
    const passwordCorrect = await bcrypt.compare(password, user.hashedPassword);

    if (!passwordCorrect) {
      return res
        .status(401)
        .json({ message: "username hoặc password không chính xác" });
    }

    // nếu khớp, tạo accessToken với JWT
    const accessToken = jwt.sign(
      { userId: user._id },
      // @ts-ignore
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: ACCESS_TOKEN_TTL }
    );

    // tạo refresh token
    const refreshToken = crypto.randomBytes(64).toString("hex");

    // tạo session mới để lưu refresh token
    await Session.create({
      userId: user._id,
      refreshToken,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL),
    });

    // trả refresh token về trong cookie
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "none", //backend, frontend deploy riêng
      maxAge: REFRESH_TOKEN_TTL,
    });

    // trả access token về trong res
    return res
      .status(200)
      .json({ message: `User ${user.displayName} đã logged in!`, accessToken });
  } catch (error) {
    console.error("Lỗi khi gọi signIn", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const signOut = async (req, res) => {
  try {
    // lấy refresh token từ cookie
    const token = req.cookies?.refreshToken;

    if (token) {
      // xoá refresh token trong Session
      await Session.deleteOne({ refreshToken: token });

      // xoá cookie
      res.clearCookie("refreshToken");
    }

    return res.sendStatus(204);
  } catch (error) {
    console.error("Lỗi khi gọi signOut", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// tạo access token mới từ refresh token
export const refreshToken = async (req, res) => {
  try {
    // lấy refresh token từ cookie
    const token = req.cookies?.refreshToken;
    if (!token) {
      return res.status(401).json({ message: "Token không tồn tại." });
    }

    // so với refresh token trong db
    const session = await Session.findOne({ refreshToken: token });

    if (!session) {
      return res.status(403).json({ message: "Token không hợp lệ hoặc đã hết hạn" });
    }

    // kiểm tra hết hạn chưa
    if (session.expiresAt < new Date()) {
      return res.status(403).json({ message: "Token đã hết hạn." });
    }

    // tạo access token mới
    const accessToken = jwt.sign(
      {
        userId: session.userId,
      },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: ACCESS_TOKEN_TTL }
    );

    // return
    return res.status(200).json({ accessToken });
  } catch (error) {
    console.error("Lỗi khi gọi refreshToken", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};
