const fs = require("fs");
const path = require("path");
const hotelbedsContentService = require("../../../services/hotelbedsContentService");


/* ------------------------------------------------------------------ */
/* EXISTING: GET /hotels                                               */
/* ------------------------------------------------------------------ */
exports.getHotels = async (req, res) => {
  try {
    const {
      destinationCode,
      countryCode,
      codes,
      includeHotels,
      fields,
      language,
      from,
      to,
      useSecondaryLanguage,
      lastUpdateTime,
      PMSRoomCode,
    } = req.query;
    const filters = {
      destinationCode,
      countryCode,
      includeHotels,
      fields,
      language,
      from,
      to,
      useSecondaryLanguage,
      lastUpdateTime,
      PMSRoomCode,
    };

    if (codes !== undefined) {
      filters.codes = Array.isArray(codes) ? codes : String(codes).split(",");
    }

    const data = await hotelbedsContentService.getHotels(filters);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Get hotels controller error:", error.message);

    return res.status(error.status || 500).json({
      success: false,
      message: error.message,
      details: error.details || undefined,
    });
  }
};












/* ------------------------------------------------------------------ */
/* NEW: GET /hotels/details?codes=1067,1070&language=ENG               */
/* ------------------------------------------------------------------ */
exports.getHotelDetails = async (req, res) => {
  try {
    const { codes, language } = req.query;

    if (!codes) {
      return res.status(400).json({
        success: false,
        message: "codes query parameter is required (e.g. codes=1067,1070)",
      });
    }

    const list = Array.isArray(codes) ? codes : String(codes).split(",");

    const data = await hotelbedsContentService.getHotelDetails(list, {
      language,
    });

    return res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error("Get hotel details controller error:", error.message);

    return res.status(error.status || 500).json({
      success: false,
      message: error.message,
      details: error.details || undefined,
    });
  }
};

/* ------------------------------------------------------------------ */
/* NEW: POST /hotels/sync  -> codes -> details, runs in background     */
/* GET  /hotels/sync/status -> progress                                */
/* ------------------------------------------------------------------ */
const syncState = {
  running: false,
  phase: "idle", // idle | codes | details | done | error
  codesFetched: 0,
  codesTotal: 0,
  detailsDone: 0,
  detailsTotal: 0,
  error: null,
  startedAt: null,
  finishedAt: null,
};

const OUTPUT_FILE = path.join(process.cwd(), "hotel_details.jsonl");

// TODO: replace with your DB upsert, e.g. await Hotel.bulkWrite(...)
async function saveHotels(hotels) {
  const lines = hotels.map((h) => JSON.stringify(h)).join("\n") + "\n";
  await fs.promises.appendFile(OUTPUT_FILE, lines, "utf8");
}

async function runSync({ filters, language }) {
  try {
    syncState.phase = "codes";
    const codes = await hotelbedsContentService.getAllHotelCodes(filters, {
      onPage: ({ fetched, total }) => {
        syncState.codesFetched = fetched;
        syncState.codesTotal = total;
      },
    });

    syncState.phase = "details";
    syncState.detailsTotal = codes.length;

    await hotelbedsContentService.getAllHotelDetails(codes, {
      language,
      onBatch: async (hotels, { done }) => {
        await saveHotels(hotels);
        syncState.detailsDone = done;
      },
    });

    syncState.phase = "done";
  } catch (error) {
    console.error("Hotel sync failed:", error.message);
    syncState.phase = "error";
    syncState.error = error.message;
  } finally {
    syncState.running = false;
    syncState.finishedAt = new Date().toISOString();
  }
}

exports.syncHotels = async (req, res) => {
  if (syncState.running) {
    return res.status(409).json({
      success: false,
      message: "A sync is already running",
      status: syncState,
    });
  }

  // Optional narrowing: body or query { countryCode, destinationCode, language }
  const { countryCode, destinationCode, language } = {
    ...req.query,
    ...req.body,
  };

  const filters = {};
  if (countryCode) filters.countryCode = countryCode;
  if (destinationCode) filters.destinationCode = destinationCode;

  Object.assign(syncState, {
    running: true,
    phase: "codes",
    codesFetched: 0,
    codesTotal: 0,
    detailsDone: 0,
    detailsTotal: 0,
    error: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  });

  // Fire and forget: do NOT await, the job can take a long time
  runSync({ filters, language });

  return res.status(202).json({
    success: true,
    message: "Sync started",
    status: syncState,
  });
};

exports.getSyncStatus = (req, res) => {
  return res.status(200).json({ success: true, status: syncState });
};