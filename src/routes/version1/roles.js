const router = require("express").Router();
const { bearerToken } = require("../../authentication/auth");
const roleController = require("../../controllers/version1/roles");

router.get("/", roleController.getRoles);
router.get("/:id", roleController.getRoleById);

router.use(bearerToken);

router.post("/", roleController.create);
router.patch("/", roleController.update);
router.delete("/:id/:actionBy", roleController.delete);

module.exports = router;
