
const express = require('express');
const router = express.Router();
const controller = require('../../../controllers/version1/hotels/hotel.controller');



router.post('/availability', controller.search);
router.post('/checkrates', controller.checkRates);
router.post('/bookings', controller.createBooking);
router.get('/content', controller.hotelsContent);
router.get("/details", controller.hotelDetails);          // body or ?hotelCodes=
router.post("/details", controller.hotelDetails);         // body
router.get("/:hotelCodes/details", controller.hotelDetails); // path param

module.exports = router;
