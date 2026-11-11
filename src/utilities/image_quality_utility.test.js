const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { checkImageQuality } = require("./image_quality_utility");

const TMP_DIR = path.join(__dirname, "__quality_test_tmp__");

function checkerboardBuffer(width, height) {
  const buf = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      const v = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? 255 : 0;
      buf[idx] = v;
      buf[idx + 1] = v;
      buf[idx + 2] = v;
    }
  }
  return buf;
}

beforeAll(() => {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR);
});

afterAll(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

test("rejects a corrupt/unreadable file with a specific reason instead of throwing", async () => {
  const filePath = path.join(TMP_DIR, "corrupt.jpg");
  fs.writeFileSync(filePath, "not a real image, just text pretending to be one");

  const result = await checkImageQuality(filePath);

  expect(result.ok).toBe(false);
  expect(result.reason).toBe("File is not a valid or readable image");
});

test("rejects an image smaller than the minimum dimensions, independent of quality", async () => {
  const filePath = path.join(TMP_DIR, "too-small.jpg");
  await sharp(checkerboardBuffer(160, 120), {
    raw: { width: 160, height: 120, channels: 3 },
  })
    .jpeg({ quality: 90 })
    .toFile(filePath);

  const result = await checkImageQuality(filePath);

  expect(result.ok).toBe(false);
  expect(result.reason).toMatch(/Resolution too low/);
});

test("AND logic: a heavily compressed but genuinely sharp image is accepted, while the same content blurred is rejected", async () => {
  const width = 1200;
  const height = 900;
  const raw = checkerboardBuffer(width, height);

  const sharpButCompressedPath = path.join(TMP_DIR, "sharp-compressed.jpg");
  await sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 8 })
    .toFile(sharpButCompressedPath);

  const blurryAndCompressedPath = path.join(TMP_DIR, "blurry-compressed.jpg");
  await sharp(raw, { raw: { width, height, channels: 3 } })
    .blur(20)
    .jpeg({ quality: 8 })
    .toFile(blurryAndCompressedPath);

  // Sanity check both files actually landed under the bytes-per-pixel floor,
  // so this test is exercising the AND branch and not short-circuiting on bpp alone.
  const sharpBpp = fs.statSync(sharpButCompressedPath).size / (width * height);
  const blurryBpp = fs.statSync(blurryAndCompressedPath).size / (width * height);
  expect(sharpBpp).toBeLessThan(0.07);
  expect(blurryBpp).toBeLessThan(0.07);

  const sharpResult = await checkImageQuality(sharpButCompressedPath);
  const blurryResult = await checkImageQuality(blurryAndCompressedPath);

  expect(sharpResult.ok).toBe(true);
  expect(blurryResult.ok).toBe(false);
  expect(blurryResult.reason).toMatch(/blurry and over-compressed/);
});
