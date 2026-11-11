const router = require('express').Router();

const version = process.env.API_VERSION || "1";

// Version 1 Routes
const GooglePlacesRoutes = require("./version1/hotels/GooglePlacesService/GooglePlacesRoutes");
const authRoutes = require("./version1/authRoutes");
const bookingRoutes = require("./version1/bookingRoutes");
const hotelsRoutes = require('./version1/hotels/hotelbeds');
const menuRouter = require("./version1/menus");
const roleRouter = require("./version1/roles");
const ownerRouter = require("./version1/owners");


router.use(`/v${version}/menus`, menuRouter);
router.use(`/v${version}/roles`, roleRouter);
// router.use(`/v${version}/users`, userRouter);
router.use(`/v${version}/owners`, ownerRouter);

// Places
router.use(`/v${version}/places`, GooglePlacesRoutes);

// Authentication
router.use(`/v${version}/auth`, authRoutes);


router.use(`/v${version}/hotels`, hotelsRoutes);

// Bookings
router.use(`/v${version}/bookings`, bookingRoutes);





module.exports = router;
