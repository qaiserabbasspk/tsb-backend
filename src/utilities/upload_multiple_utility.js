const multer = require("multer");
const fs = require("fs");
const path = require("path");
const Upload = require("../models/upload");
const ResponseMessage = require("../utilities/messages_utility");
const Response = require("../utilities/response_utility");
const { compressToWebP, getCompressionOpts } = require("../utilities/webp_compression_utility");
const { checkImageQuality } = require("../utilities/image_quality_utility");

const createFolder = (folderPath) => {
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
};

const getStorage = (destination) => {
  return multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, destination);
    },
    filename: function (req, file, cb) {
      cb(null, file.originalname.replace(/\s+/g, ""));
    },
  });
};

const upload = (destination) => {
  createFolder(destination);
  const storage = getStorage(destination);
  return multer({
    storage,
    fileFilter: (req, file, cb) => {
      const originalName = file.originalname.replace(/\s+/g, "");
      const ext = path.extname(originalName).toLowerCase();

      // Check for the .webp version that will exist after conversion
      const checkName =
        ext === ".webp"
          ? originalName
          : `${path.parse(originalName).name}.webp`;

      fs.access(`${destination}/${checkName}`, (err) => {
        if (!err) {
          const error = new Error("Duplicate file upload is not allowed");
          error.statusCode = 409;
          return cb(error);
        }
        cb(null, true);
      });
    },
  });
};

// maxWidth defaults to 1440 for all gallery images
const uploadGallery = (folderpath, maxWidth = 1440, maxCount = 5) => {
  return async (req, res, next) => {
    req.destination = `${folderpath}${req.params.code}`;
    req.webpMaxWidth = maxWidth;
    upload(req.destination).array("gallery", maxCount)(req, res, next);
  };
};

const uploadImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return Response.errorResponse(res, 400, ResponseMessage.FILE_UPLOAD_ERROR);
    }

    const maxWidth = req.webpMaxWidth || 1440;
    const absDestination = path.resolve(__dirname, "..", req.destination);
    const opts = getCompressionOpts(maxWidth);

    // Quality gate — runs on each original upload before compression, so a
    // rejected file never burns the (much slower) compression step. All or
    // nothing: if any file in the batch fails, none of them are saved.
    const qualityChecks = await Promise.all(
      req.files.map(async (file) => {
        const originalPath = path.join(
          absDestination,
          file.filename.replace(/\s+/g, "")
        );
        const result = await checkImageQuality(originalPath);
        return { file, originalPath, ...result };
      })
    );
    const failed = qualityChecks.filter((c) => !c.ok);
    if (failed.length > 0) {
      for (const { originalPath } of qualityChecks) {
        if (fs.existsSync(originalPath)) fs.unlinkSync(originalPath);
      }
      const message = failed
        .map((f) => `${f.file.originalname}: ${f.reason}`)
        .join("; ");
      return Response.errorResponse(res, 400, message);
    }

    const webpFilenames = await Promise.all(
      req.files.map(async (file) => {
        const originalFilename = file.filename.replace(/\s+/g, "");
        const originalPath = path.join(absDestination, originalFilename);
        const webpFilename = `${path.parse(originalFilename).name}.webp`;
        const webpPath = path.join(absDestination, webpFilename);

        await compressToWebP(originalPath, webpPath, opts);

        // Remove the original if it was a different format (jpg/png)
        if (originalPath !== webpPath && fs.existsSync(originalPath)) {
          fs.unlinkSync(originalPath);
        }

        return webpFilename;
      })
    );

    const images = webpFilenames.map((name) => new Upload({ name }));
    const newImages = await Upload.insertMany(images);

    return Response.successResponse(res, res.statusCode, {
      gallery: newImages.map((img) => img.name),
    });
  } catch (err) {
    if (err.code === 11000) {
      return Response.errorResponse(res, 409, err);
    }
    return Response.errorResponse(res, 500, err);
  }
};

const getImages = (folderpath) => {
  return async (req, res) => {
    try {
      const folderCode = req.params.code;
      const imageName = req.params.name;
      const imagePath = path.join(
        __dirname,
        `../${folderpath}${folderCode}`,
        imageName
      );

      // Prefer .webp version when serving older format filenames
      const ext = path.extname(imageName).toLowerCase();
      if (ext !== ".webp") {
        const webpPath = imagePath.replace(/\.(jpg|jpeg|png)$/i, ".webp");
        if (fs.existsSync(webpPath)) {
          res.setHeader("Content-Type", "image/webp");
          return fs.createReadStream(webpPath).pipe(res);
        }
      }

      if (!fs.existsSync(imagePath)) {
        return Response.customResponse(res, 404, ResponseMessage.NO_IMAGE);
      }

      let contentType = "application/octet-stream";
      switch (ext) {
        case ".jpg":
        case ".jpeg":
          contentType = "image/jpeg";
          break;
        case ".png":
          contentType = "image/png";
          break;
        case ".webp":
          contentType = "image/webp";
          break;
      }

      res.setHeader("Content-Type", contentType);
      fs.createReadStream(imagePath).pipe(res);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  };
};

module.exports = { uploadGallery, uploadImages, getImages };
