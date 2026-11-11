const router = require("express").Router();
const { bearerToken } = require("../../authentication/auth");
// const menuController = require("../../controllers/version1/menus");
const menuController = require("../../controllers/version1/menus");

router.use(bearerToken);
router.post("/", menuController.create);
router.patch("/", menuController.update);
router.get("/", menuController.getMenus);
router.get("/active", menuController.getActiveMenus);
router.get("/:id", menuController.getMenu);
router.get("/module/:id", menuController.getMenuByParent);
router.get("/sidebar/:id", menuController.getSideMenus);
router.patch(
  "/status/id/:id/actionBy/:actionBy",
  menuController.deActivateAndActivate
);

module.exports = router;
