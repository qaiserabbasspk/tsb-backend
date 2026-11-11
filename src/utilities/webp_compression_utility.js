const sharp = require("sharp");
const fs = require("fs");

/**
 * Compress an image to WebP using binary search over quality levels so the
 * result lands as close to targetKB as possible without exceeding it.
 *
 * If the source is already below skipBelowKB the image is only converted to
 * WebP at qualityStart — no quality search is run.
 *
 * Binary search guarantees the highest quality that still fits the target is
 * chosen, keeping images as close to targetKB as the quality floor allows.
 *
 * @param {string} inputPath   Absolute path to source image
 * @param {string} outputPath  Absolute path for output WebP
 * @param {object} opts
 * @param {number} opts.maxWidth      Max width in px (never enlarges)
 * @param {number} opts.targetKB      Maximum output size in KB
 * @param {number} opts.skipBelowKB  Skip quality search if source < this KB
 * @param {number} opts.qualityStart  Best quality to start from (e.g. 82)
 * @param {number} opts.qualityMin    Quality floor — never goes below this
 */
async function compressToWebP(inputPath, outputPath, opts) {
  const { maxWidth, targetKB, skipBelowKB, qualityStart, qualityMin } = opts;
  const targetBytes = targetKB * 1024;
  const sourceBytes = fs.statSync(inputPath).size;

  // When input and output are the same file (already .webp upload),
  // write to a temp path first then rename to avoid read/write collision.
  const sameFile = inputPath === outputPath;
  const writePath = sameFile ? outputPath + ".tmp" : outputPath;

  const pipeline = () =>
    sharp(inputPath).resize({ width: maxWidth, withoutEnlargement: true });

  const writeBuffer = async (buf) => {
    await fs.promises.writeFile(writePath, buf);
    if (sameFile) {
      fs.unlinkSync(inputPath);
      fs.renameSync(writePath, outputPath);
    }
  };

  // Source already small enough — convert format only, no quality reduction
  if (sourceBytes < skipBelowKB * 1024) {
    const buf = await pipeline().webp({ quality: qualityStart }).toBuffer();
    await writeBuffer(buf);
    return;
  }

  // First attempt at best quality — most images pass here
  let buf = await pipeline().webp({ quality: qualityStart }).toBuffer();
  if (buf.length <= targetBytes) {
    await writeBuffer(buf);
    return;
  }

  // Binary search: find highest quality whose output fits within target
  let lo = qualityMin;
  let hi = qualityStart - 1;
  let bestBuf = null;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    buf = await pipeline().webp({ quality: mid }).toBuffer();

    if (buf.length <= targetBytes) {
      bestBuf = buf;  // fits — try a higher quality
      lo = mid + 1;
    } else {
      hi = mid - 1;   // still over — try lower
    }
  }

  // Nothing fit within the quality range — use the floor quality as a last resort
  if (!bestBuf) {
    bestBuf = await pipeline().webp({ quality: qualityMin }).toBuffer();
  }

  await writeBuffer(bestBuf);
}

/**
 * Return compression options derived from maxWidth.
 * Keeps route files clean — they only need to pass maxWidth.
 */
function getCompressionOpts(maxWidth) {
  if (maxWidth <= 400) {
    return {
      maxWidth,
      targetKB: 60,
      skipBelowKB: 20,
      qualityStart: 85,
      qualityMin: 65,
    };
  }
  return {
    maxWidth,
    targetKB: 150,
    skipBelowKB: 80,
    qualityStart: 82,
    qualityMin: 60,
  };
}

module.exports = { compressToWebP, getCompressionOpts };
