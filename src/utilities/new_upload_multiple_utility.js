// const multer = require("multer");
// const path = require("path");
const fs = require("fs");
const Upload = require("../models/upload");
const ResponseMessage = require("../utilities/messages_utility");
const Response = require("../utilities/response_utility");
const { console } = require("inspector");

/////
const path = require("path");
const multer = require("multer");

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/bills");
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9) + ext;
    cb(null, uniqueName);
  },
});

// File filter (optional)
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "application/pdf",
    "application/msword", // .doc
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document" // .docx
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Unsupported file type"), false);
  }
};

// Initialize multer
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
});

// Controllers
const uploadSingleFile = (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  return res.status(200).json({
    message: "File uploaded successfully",
    file: req.file,
  });
};

const uploadMultipleFiles = (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ message: "No files uploaded" });
  }

  return res.status(200).json({
    message: "Files uploaded successfully",
    files: req.files,
  });
};

const getFile = (req, res) => {
  const fileName = req.params.name;
  const filePath = path.join(__dirname, "../uploads/bills", fileName);

  console.log(filePath);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: "File not found" });
  }

  res.download(filePath); // or use res.sendFile(filePath) for inline view
};

module.exports = {
  upload,
  uploadSingleFile,
  uploadMultipleFiles,
  getFile
};

