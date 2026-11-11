const router = require("express").Router();
const { bearerToken } = require("../../authentication/auth");
const ownerController = require("../../controllers/version1/owners");
const uploadUtility = require("../../utilities/upload_utility");
const { authLimiter } = require("../../middleware/rateLimiter");

let destination = `uploads/owners/`;
let destinations = `uploads/ownerDocuments/`;

// router.post("/login", ownerController.login);
router.patch("/forgot/password", authLimiter, ownerController.resetPassword);
//
router.get("/image/owner/:code/:avatar", uploadUtility.getImage(destination));
router.post("/upload/avatar/:code", uploadUtility.uploadAvatar(destination), uploadUtility.uploadImage);
//
router.get("/document/owner/:code/:avatar", uploadUtility.getImage(destinations));
router.post("/upload/document/:code", uploadUtility.uploadAvatar(destinations), uploadUtility.uploadImage);

router.use(bearerToken);

router.post("/", ownerController.create);
router.get("/:id", ownerController.get);
router.get("/", ownerController.getOwners);
router.patch("/", ownerController.update);
router.delete("/:id/:userId", ownerController.delete);
router.get("/role/:id", ownerController.getOwnersByRole);
router.patch("/change/password", ownerController.changePassword);
router.patch("/activate", ownerController.activateAccount);

module.exports = router;
