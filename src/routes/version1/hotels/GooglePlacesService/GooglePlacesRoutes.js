
const express = require("express");
const GooglePlacesService = require("../../../../controllers/hotels/GooglePlacesService/GooglePlacesController");

const router = express.Router();

router.get("/autocomplete", GooglePlacesService.autocomplete);
// router.get("/search", GooglePlacesService.search);
// router.get("/details/:placeId", controller.details);
// router.post("/nearby", controller.nearby);

module.exports = router;
