const {
  searchHotelAvailability,
} = require("../../../services/hotelbedsAvailabilityService");

function isValidDate(value) {
  if (typeof value !== "string") return false;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function formatRate(rate, room) {
  const net = Number(rate.net);
  const sellingRate = Number(rate.sellingRate);

  return {
    rateKey: rate.rateKey || null,
    rateClass: rate.rateClass || null,
    rateType: rate.rateType || null,

    roomCode: room.code || null,
    roomName: room.name || rate.roomName || null,
    boardCode: rate.boardCode || null,
    boardName: rate.boardName || null,

    // Customer-facing price when supplied by Hotelbeds.
    totalPrice: Number.isFinite(sellingRate)
      ? sellingRate
      : Number.isFinite(net)
        ? net
        : null,

    net: Number.isFinite(net) ? net : null,

    sellingRate: Number.isFinite(sellingRate) ? sellingRate : null,

    currency: rate.currency || null,
    paymentType: rate.paymentType || null,
    allotment: rate.allotment ?? null,
    cancellationPolicies: rate.cancellationPolicies || [],
    taxes: rate.taxes || null,
    offers: rate.offers || [],
    rooms: rate.rooms ?? null,
    adults: rate.adults ?? null,
    children: rate.children ?? null,
    rateComments: rate.rateComments || null,
    packaging: rate.packaging ?? null,
  };
}

function formatHotels(data) {
  const hotels = data?.hotels?.hotels || [];

  return hotels.map((hotel) => {
    const rooms = (hotel.rooms || []).map((room) => ({
      code: room.code || null,
      name: room.name || null,
      rates: (room.rates || []).map((rate) => formatRate(rate, room)),
    }));

    return {
      code: hotel.code,
      name: hotel.name || null,
      categoryCode: hotel.categoryCode || null,
      categoryName: hotel.categoryName || null,
      destinationCode: hotel.destinationCode || null,
      destinationName: hotel.destinationName || null,
      zoneCode: hotel.zoneCode || null,
      zoneName: hotel.zoneName || null,
      latitude: hotel.latitude ?? null,
      longitude: hotel.longitude ?? null,
      currency: hotel.currency || null,
      minRate: hotel.minRate ?? null,
      maxRate: hotel.maxRate ?? null,
      rooms,
    };
  });
}

async function getHotelAvailability(req, res) {
  try {
    const {
      checkIn,
      checkOut,
      hotels,
      occupancies,
      dailyRate = false,
      language = "ENG",
      sourceMarket,
      shiftDays,
      allowOnlyShift,
      boards,
      rooms,
      keywords,
      review,
      accommodations,
      inclusions,
      geolocation,
      filter,
    } = req.body || {};

    console.log("Received request body:", req.body);
    // Validate dates.
    if (!isValidDate(checkIn) || !isValidDate(checkOut)) {
      return res.status(400).json({
        success: false,
        message: "checkIn and checkOut must use YYYY-MM-DD format",
      });
    }

    if (checkOut <= checkIn) {
      return res.status(400).json({
        success: false,
        message: "checkOut must be later than checkIn",
      });
    }

    // Validate hotel codes.
    if (
      !Array.isArray(hotels) ||
      hotels.length === 0 ||
      hotels.length > 2000 ||
      hotels.some((code) => !Number.isInteger(Number(code)) || Number(code) < 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "hotels must be a non-empty array of valid hotel codes",
      });
    }

    // Validate occupancy groups.
    if (!Array.isArray(occupancies) || occupancies.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one occupancy is required",
      });
    }

    for (const occupancy of occupancies) {
      const {
        rooms: roomCount,
        adults,
        children = 0,
        childAges = [],
      } = occupancy;

      if (
        !Number.isInteger(roomCount) ||
        roomCount < 1 ||
        !Number.isInteger(adults) ||
        adults < 1 ||
        !Number.isInteger(children) ||
        children < 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Each occupancy requires valid rooms, adults and children",
        });
      }

      if (
        !Array.isArray(childAges) ||
        childAges.length !== children ||
        childAges.some((age) => !Number.isInteger(age) || age < 0 || age > 17)
      ) {
        return res.status(400).json({
          success: false,
          message: "Provide one valid child age (0–17) per child",
        });
      }
    }

    if (
      shiftDays !== undefined &&
      (!Number.isInteger(shiftDays) || shiftDays < 1 || shiftDays > 5)
    ) {
      return res.status(400).json({
        success: false,
        message: "shiftDays must be an integer from 1 to 5",
      });
    }

    // Convert the application request into the Hotelbeds schema.
    const payload = {
      stay: {
        checkIn,
        checkOut,
        ...(shiftDays !== undefined ? { shiftDays } : {}),
        ...(allowOnlyShift !== undefined
          ? { allowOnlyShift: Boolean(allowOnlyShift) }
          : {}),
      },

      occupancies: occupancies.map((occupancy) => ({
        rooms: occupancy.rooms,
        adults: occupancy.adults,
        children: occupancy.children || 0,

        paxes: [
          ...Array.from({ length: occupancy.adults }, () => ({ type: "AD" })),
          ...(occupancy.childAges || []).map((age) => ({
            type: "CH",
            age,
          })),
        ],
      })),

      hotels: {
        hotel: hotels.map(Number),
      },

      dailyRate: Boolean(dailyRate),
      language,
    };

    // Add optional filters only when provided.
    if (sourceMarket) payload.sourceMarket = sourceMarket;
    if (boards) payload.boards = boards;
    if (rooms) payload.rooms = rooms;
    if (keywords) payload.keywords = keywords;
    if (review) payload.review = review;
    if (accommodations) payload.accommodations = accommodations;
    if (inclusions) payload.inclusions = inclusions;
    if (geolocation) payload.geolocation = geolocation;
    if (filter) payload.filter = filter;

    const rawResponse = await searchHotelAvailability(payload);
    const formattedHotels = formatHotels(rawResponse);

    return res.status(200).json({
      success: true,
      message: "Hotel availability retrieved successfully",
      search: {
        checkIn,
        checkOut,
        nights:
          (new Date(`${checkOut}T00:00:00Z`) -
            new Date(`${checkIn}T00:00:00Z`)) /
          86400000,
        hotelsRequested: hotels.length,
        occupancies,
      },
      totalHotels: formattedHotels.length,
      hotels: formattedHotels,
      // Retain the full supplier response for fields not mapped above.
      raw: rawResponse,
    });
  } catch (error) {
    console.error(
      "Hotelbeds availability error:",
      error.response?.data || error.details || error.message,
    );

    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Unable to search hotel availability",
      ...(error.details ? { details: error.details } : {}),
    });
  }
}

module.exports = {
  getHotelAvailability,
};
