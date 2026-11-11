const hotelbeds = require("../../../services/hotels/hotelbeds.service");
const Booking = require("../../../models/HotelsBookings"); // <-- adjust path to your model file

const MAX_NIGHTS = 30;
const MAX_HOTEL_CODES = 100; // adjust to your needs / Hotelbeds limits

// ============================================================
// Generic helpers
// ============================================================

function createError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  error.statusCode = status;
  return error;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readNumber(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const number = Number(value);
  return Number.isInteger(number) ? number : NaN;
}

function readBoolean(value) {
  return value === true || String(value).toLowerCase() === "true";
}

// Strict boolean parser: returns true / false, or null if invalid
function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  const v = String(value).toLowerCase();
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

function parseChildAges(value) {
  if (value === undefined || value === null || value === "") {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map(Number);
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map(Number);
      }
      if (typeof parsed === "number") {
        return [parsed];
      }
    } catch (_) {
      return value.split(",").map((age) => Number(age.trim()));
    }
  }
  throw createError("childAges must be an array of ages.");
}

// Accepts: "1067,1070" | ["1067","1070"] | [1067, 1070] | 1067
function extractHotelCodes(req) {
  const raw =
    req.params?.hotelCodes ?? req.body?.hotelCodes ?? req.query?.hotelCodes;

  const list = Array.isArray(raw) ? raw : [raw];

  return [
    ...new Set(
      list
        .flatMap((value) => String(value ?? "").split(","))
        .map((code) => code.trim())
        .filter(Boolean),
    ),
  ];
}

// ============================================================
// Booking DB helpers
// ============================================================

const cut = (value, max) =>
  value === undefined || value === null ? value : String(value).slice(0, max);

const toJson = (value) => {
  try {
    return JSON.stringify(value);
  } catch (_) {
    return null;
  }
};

const toNum = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

function mapStatus(status) {
  switch (String(status).toUpperCase()) {
    case "CONFIRMED":
      return "confirmed";
    case "CANCELLED":
      return "cancelled";
    default:
      return "pending";
  }
}

function buildBookingDoc({ requestBody, hotelbedsData, meta = {} }) {
  // Handles both `{ booking: {...} }` and `{ data: { booking: {...} } }`
  const hb = hotelbedsData?.booking ?? hotelbedsData?.data?.booking ?? {};
  const hotel = hb.hotel ?? {};
  const holder = requestBody.holder;

  const allPaxes = (requestBody.rooms || []).flatMap((r) => r.paxes || []);
  const adults = allPaxes.filter((p) => p.type === "AD").length;
  const children = allPaxes.filter((p) => p.type === "CH");

  const checkin = hotel.checkIn ?? meta.checkin ?? null;
  const checkout = hotel.checkOut ?? meta.checkout ?? null;
  const nights =
    checkin && checkout
      ? Math.round((Date.parse(checkout) - Date.parse(checkin)) / 86400000)
      : null;

  const priceOriginal = toNum(hb.totalNet ?? hotel.totalNet ?? 0);

  const locationFromHotel = [hotel.zoneName, hotel.destinationName]
    .filter(Boolean)
    .join(", ");

  return {
    booking_ref_no: cut(hb.reference, 17) ?? null,
    booking_date: hb.creationDate ? new Date(hb.creationDate) : new Date(),
    booking_status: mapStatus(hb.status),

    price_original: priceOriginal,
    price_markup: meta.price_markup ?? null,
    vat: String(meta.vat ?? "0"),
    tax: String(meta.tax ?? "0"),
    gst: toNum(meta.gst),

    first_name: cut(holder.name, 50),
    last_name: cut(holder.surname, 50),
    email: cut(meta.email ?? holder.email ?? "N/A", 50),
    address: cut(meta.address ?? "N/A", 250),
    phone_country_code: toNum(meta.phone_country_code),
    phone: toNum(meta.phone),
    country: cut(meta.country ?? "N/A", 50),

    stars: cut(
      meta.stars ?? hotel.categoryName ?? hotel.categoryCode ?? "N/A",
      5,
    ),
    hotel_id: toNum(hotel.code ?? meta.hotel_id),
    hotel_name: cut(hotel.name ?? meta.hotel_name ?? "N/A", 100),
    hotel_phone: toNum(meta.hotel_phone),
    hotel_email: cut(meta.hotel_email ?? "N/A", 50),
    hotel_website: cut(meta.hotel_website ?? "N/A", 50),
    hotel_address: cut(meta.hotel_address ?? "N/A", 500),
    room_data: cut(
      toJson(
        (hotel.rooms || []).map((r) => ({
          code: r.code,
          name: r.name,
          status: r.status,
        })),
      ) ?? "[]",
      500,
    ),
    location: cut(meta.location || locationFromHotel || "N/A", 250),
    location_cords: cut(
      hotel.latitude && hotel.longitude
        ? `${hotel.latitude},${hotel.longitude}`
        : (meta.location_cords ?? "N/A"),
      250,
    ),
    hotel_img: meta.hotel_img ?? "N/A",

    checkin,
    checkout,
    booking_nights: nights,
    adults: adults || 1,
    childs: children.length,
    child_ages: cut(toJson(children.map((c) => c.age)) ?? "[]", 200),

    currency_original: cut(hb.currency ?? hotel.currency ?? "N/A", 50),
    currency_markup: meta.currency_markup ?? null,

    payment_status: meta.payment_status ?? "unpaid",
    payment_gateway: meta.payment_gateway ?? null,
    transaction_id: meta.transaction_id ?? null,

    supplier: "hotelbeds",
    user_id: meta.user_id ? String(meta.user_id) : null,
    user_data: toJson({ holder, clientReference: requestBody.clientReference }),
    guest: toJson(allPaxes),
    nationality: meta.nationality ?? null,
    module_type: "hotels",
    pnr: hb.reference ?? null,
    booking_data: toJson(requestBody),
    booking_response: toJson(hotelbedsData),

    agent_markup_price: meta.agent_markup_price ?? null,
    agent_net_profit: meta.agent_net_profit ?? null,
    agent_markup_percent: meta.agent_markup_percent ?? null,
    agent_markup: meta.agent_markup ?? null,
  };
}

// ============================================================
// Validators
// ============================================================

function isValidDateString(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function validateStay(stay) {
  if (!isPlainObject(stay)) {
    throw createError("stay with checkIn and checkOut is required.");
  }

  const { checkIn, checkOut, shiftDays, allowOnlyShift } = stay;

  if (!isValidDateString(checkIn) || !isValidDateString(checkOut)) {
    throw createError(
      "checkIn and checkOut are required in YYYY-MM-DD format.",
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  if (checkIn < today) {
    throw createError("checkIn cannot be in the past.");
  }

  if (checkOut <= checkIn) {
    throw createError("checkOut must be after checkIn.");
  }

  const nights = Math.round(
    (Date.parse(checkOut) - Date.parse(checkIn)) / 86400000,
  );

  if (nights > MAX_NIGHTS) {
    throw createError(
      `The stay is ${nights} nights, but the maximum is ${MAX_NIGHTS} nights. Please change your dates.`,
    );
  }

  const result = { checkIn, checkOut };

  if (shiftDays !== undefined) {
    if (!Number.isInteger(shiftDays) || shiftDays < 0) {
      throw createError("shiftDays must be a non-negative whole number.");
    }
    result.shiftDays = shiftDays;
  }

  if (allowOnlyShift !== undefined) {
    if (typeof allowOnlyShift !== "boolean") {
      throw createError("allowOnlyShift must be true or false.");
    }
    result.allowOnlyShift = allowOnlyShift;
  }

  return result;
}

function validateOccupancies(occupancies) {
  if (!Array.isArray(occupancies) || occupancies.length === 0) {
    throw createError("occupancies must be a non-empty array.");
  }

  occupancies.forEach((room, index) => {
    const label = `occupancies[${index}]`;

    if (!isPlainObject(room)) {
      throw createError(`${label} must be an object.`);
    }

    if (!Number.isInteger(room.rooms) || room.rooms < 1) {
      throw createError(`${label}.rooms must be a whole number of at least 1.`);
    }

    if (!Number.isInteger(room.adults) || room.adults < 1) {
      throw createError(
        `${label}.adults must be a whole number of at least 1.`,
      );
    }

    const children = room.children ?? 0;

    if (!Number.isInteger(children) || children < 0) {
      throw createError(
        `${label}.children must be a whole number of 0 or more.`,
      );
    }

    if (room.paxes !== undefined && !Array.isArray(room.paxes)) {
      throw createError(`${label}.paxes must be an array.`);
    }

    if (children > 0) {
      const childPaxes = (room.paxes ?? []).filter((p) => p && p.type === "CH");

      if (childPaxes.length !== children) {
        throw createError(
          `${label}.paxes must contain one CH entry with an age for each child.`,
        );
      }

      if (
        childPaxes.some(
          (p) => !Number.isInteger(p.age) || p.age < 0 || p.age > 17,
        )
      ) {
        throw createError(
          `${label}: child ages must be whole numbers from 0 to 17.`,
        );
      }
    }
  });
}

function validateGeolocation({ latitude, longitude, radius, unit }) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  const rad = Number(radius);
  const normalizedUnit = String(unit).toLowerCase();

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw createError("latitude must be a number between -90 and 90.");
  }

  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw createError("longitude must be a number between -180 and 180.");
  }

  if (!Number.isFinite(rad) || rad <= 0) {
    throw createError("radius must be a number greater than 0.");
  }

  if (!["km", "mi"].includes(normalizedUnit)) {
    throw createError('unit must be "km" or "mi".');
  }

  return {
    latitude: lat,
    longitude: lng,
    radius: rad,
    unit: normalizedUnit,
  };
}

// ============================================================
// Occupancy builder
// ============================================================

function buildOccupancies(body) {
  if (Array.isArray(body.occupancies)) {
    validateOccupancies(body.occupancies);
    return body.occupancies.map((room) => ({
      rooms: room.rooms,
      adults: room.adults,
      children: room.children ?? 0,
      paxes: room.paxes ?? [],
    }));
  }

  const adults = readNumber(body.adults, 1);
  const children = readNumber(body.children, 0);
  const rooms = readNumber(body.rooms, 1);
  const childAges = parseChildAges(body.childAges);

  if (
    !Number.isInteger(adults) ||
    adults < 1 ||
    !Number.isInteger(children) ||
    children < 0 ||
    !Number.isInteger(rooms) ||
    rooms < 1
  ) {
    throw createError(
      "adults, children and rooms must be valid whole numbers.",
    );
  }

  if (adults < rooms) {
    throw createError("Please provide at least one adult for each room.");
  }

  if (childAges.length !== children) {
    throw createError("Provide one child age for every child using childAges.");
  }

  if (childAges.some((age) => !Number.isInteger(age) || age < 0 || age > 17)) {
    throw createError("Each child age must be a whole number from 0 to 17.");
  }

  const occupancies = [];
  let remainingAdults = adults;
  const remainingChildren = [...childAges];

  for (let i = 0; i < rooms; i++) {
    const roomsLeft = rooms - i;
    const adultsInRoom = Math.ceil(remainingAdults / roomsLeft);
    const childrenInRoom = Math.ceil(remainingChildren.length / roomsLeft);
    const roomChildAges = remainingChildren.splice(0, childrenInRoom);

    occupancies.push({
      rooms: 1,
      adults: adultsInRoom,
      children: roomChildAges.length,
      paxes: roomChildAges.map((age) => ({ type: "CH", age })),
    });

    remainingAdults -= adultsInRoom;
  }

  return occupancies;
}

// ============================================================
// Search hotels
// POST /api/v1/hotels/availability
// ============================================================

async function search(req, res, next) {
  try {
    const body = {
      ...(req.query || {}),
      ...(req.body || {}),
    };

    const stayInput = body.stay || {
      checkIn: body.checkIn ?? body.checkInDate ?? body.arrivalDate,
      checkOut: body.checkOut ?? body.checkOutDate ?? body.departureDate,
      shiftDays:
        body.shiftDays !== undefined ? readNumber(body.shiftDays) : undefined,
      allowOnlyShift:
        body.allowOnlyShift !== undefined
          ? readBoolean(body.allowOnlyShift)
          : undefined,
    };

    const stay = validateStay(stayInput);
    const occupancies = buildOccupancies(body);

    const payload = { stay, occupancies };

    const latitude = body.latitude ?? body.geolocation?.latitude;
    const longitude = body.longitude ?? body.geolocation?.longitude;

    if (
      latitude !== undefined &&
      longitude !== undefined &&
      latitude !== "" &&
      longitude !== ""
    ) {
      payload.geolocation = validateGeolocation({
        latitude,
        longitude,
        radius: body.radius ?? body.geolocation?.radius ?? 20,
        unit: body.unit ?? body.geolocation?.unit ?? "km",
      });
    }

    if (body.hotels !== undefined) {
      if (!isPlainObject(body.hotels)) {
        throw createError("hotels must be an object.");
      }
      payload.hotels = body.hotels;
    }

    const data = await hotelbeds.searchHotels(payload);

    console.log("Hotelbeds service payload:", JSON.stringify(payload, null, 2));

    return res.status(200).json({
      success: true,
      message: "Hotel search completed successfully.",
      searchParams: {
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        adults: body.adults ?? null,
        children: body.children ?? null,
        rooms: body.rooms ?? null,
        destination: body.destination ?? null,
      },
      data,
    });
  } catch (error) {
    return next(error);
  }
}

// ============================================================
// Check rates
// POST /api/v1/hotels/checkrates
// ============================================================

async function checkRates(req, res, next) {
  try {
    const { rooms } = req.body || {};

    if (
      !Array.isArray(rooms) ||
      rooms.length === 0 ||
      rooms.some(
        (room) =>
          !isPlainObject(room) ||
          typeof room.rateKey !== "string" ||
          !room.rateKey.trim(),
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid rateKey is required for each room.",
      });
    }

    const data = await hotelbeds.checkRates({ rooms });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

// ============================================================
// Create booking
// POST /api/v1/hotels/bookings
// ============================================================

async function createBooking(req, res, next) {
  try {
    const { holder, clientReference, rooms } = req.body || {};

    if (
      !isPlainObject(holder) ||
      typeof holder.name !== "string" ||
      !holder.name.trim() ||
      typeof holder.surname !== "string" ||
      !holder.surname.trim() ||
      typeof clientReference !== "string" ||
      !clientReference.trim() ||
      !Array.isArray(rooms) ||
      rooms.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Holder name, surname, clientReference and rooms are required.",
      });
    }

    for (let i = 0; i < rooms.length; i++) {
      const room = rooms[i];

      if (
        !isPlainObject(room) ||
        typeof room.rateKey !== "string" ||
        !room.rateKey.trim() ||
        !Array.isArray(room.paxes) ||
        room.paxes.length === 0
      ) {
        return res.status(400).json({
          success: false,
          message: `Room ${i + 1} needs a rateKey and guest details.`,
        });
      }

      for (let j = 0; j < room.paxes.length; j++) {
        const pax = room.paxes[j];

        if (
          !isPlainObject(pax) ||
          typeof pax.name !== "string" ||
          !pax.name.trim() ||
          typeof pax.surname !== "string" ||
          !pax.surname.trim() ||
          !["AD", "CH"].includes(pax.type)
        ) {
          return res.status(400).json({
            success: false,
            message: `Guest ${j + 1} in room ${i + 1} needs a name, surname and type AD or CH.`,
          });
        }
      }
    }

    // Only valid Hotelbeds fields go to the supplier (bookingMeta stays local)
    const bookingPayload = {
      holder: {
        ...holder,
        name: holder.name.trim(),
        surname: holder.surname.trim(),
      },
      clientReference: clientReference.trim(),
      rooms,
    };

    // 1) Create the reservation at Hotelbeds
    const data = await hotelbeds.createBooking(bookingPayload);

    // 2) Save it locally. A DB failure must NOT make the API look like the
    //    booking failed, because the reservation already exists at Hotelbeds.
    let savedBooking = null;
    let dbWarning = null;

    try {
      const doc = buildBookingDoc({
        requestBody: bookingPayload,
        hotelbedsData: data,
        meta: req.body.bookingMeta || {},
      });

      // avoid duplicates if the client retries
      savedBooking = doc.booking_ref_no
        ? await Booking.findOneAndUpdate(
            { booking_ref_no: doc.booking_ref_no, supplier: "hotelbeds" },
            { $setOnInsert: doc },
            { upsert: true, new: true, runValidators: true },
          )
        : await Booking.create(doc);
    } catch (dbError) {
      console.error("Hotelbeds booking created but DB save failed:", {
        clientReference: bookingPayload.clientReference,
        error: dbError.message,
        hotelbedsResponse: data,
      });
      dbWarning =
        "Booking was created at the supplier but could not be saved locally.";
    }

    return res.status(200).json({
      success: true,
      message: "Booking request processed successfully.",
      localBookingId: savedBooking?._id ?? null,
      ...(dbWarning && { warning: dbWarning }),
      data,
    });
  } catch (error) {
    return next(error);
  }
}

// ============================================================
// Get hotel content
// GET /api/v1/hotels/content
// ============================================================

async function hotelsContent(req, res, next) {
  try {
    const params = {};

    for (const key of ["codes", "language", "fields", "from", "to"]) {
      if (req.query[key] !== undefined) {
        params[key] = req.query[key];
      }
    }

    console.log(
      "Hotel content request params:",
      JSON.stringify(params, null, 2),
    );

    const data = await hotelbeds.getHotelsContent(params);

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

// ============================================================
// Get hotel details
// GET  /api/v1/hotels/:hotelCodes/details?language=ENG&useSecondaryLanguage=true
// GET  /api/v1/hotels/details            (JSON body or ?hotelCodes=1067,1070)
// POST /api/v1/hotels/details            (JSON body)
// ============================================================

async function hotelDetails(req, res, next) {
  try {
    const hotelCodes = extractHotelCodes(req);

    if (hotelCodes.length === 0) {
      return res.status(400).json({
        success: false,
        message: "hotelCodes is required. Example: 1067,1070",
      });
    }

    if (!hotelCodes.every((code) => /^\d+$/.test(code))) {
      return res.status(400).json({
        success: false,
        message:
          "hotelCodes must be comma-separated numbers. Example: 1067,1070",
      });
    }

    if (hotelCodes.length > MAX_HOTEL_CODES) {
      return res.status(400).json({
        success: false,
        message: `A maximum of ${MAX_HOTEL_CODES} hotel codes is allowed per request.`,
      });
    }

    const language = String(
      req.body?.language ?? req.query?.language ?? "ENG",
    ).toUpperCase();

    if (!/^[A-Z]{3}$/.test(language)) {
      return res.status(400).json({
        success: false,
        message: "language must be a 3-letter code, e.g. ENG.",
      });
    }

    const params = { language };

    const rawSecondary =
      req.body?.useSecondaryLanguage ?? req.query?.useSecondaryLanguage;

    if (rawSecondary !== undefined) {
      const value = parseBoolean(rawSecondary);

      if (value === null) {
        return res.status(400).json({
          success: false,
          message: "useSecondaryLanguage must be true or false.",
        });
      }

      params.useSecondaryLanguage = value;
    }

    const data = await hotelbeds.getHotelDetails(hotelCodes.join(","), params);

    return res.status(200).json({
      success: true,
      message: "Hotel details retrieved successfully.",
      data,
    });
  } catch (error) {
    return next(error);
  }
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  search,
  checkRates,
  createBooking,
  hotelsContent,
  hotelDetails,
};