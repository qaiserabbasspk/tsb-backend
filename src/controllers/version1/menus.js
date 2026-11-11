// MODELS
const Menu = require("../../models/menus");
const Role = require("../../models/roles");
const Permission = require("../../models/permissions");

// VALIDATIONS
const { menuValidation } = require("../../validations/menus");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const { status } = require("../../utilities/status_change_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/activitylog_utility");

const moduleName = `Menu`;

module.exports = {
  create: async (req, res) => {
    try {
      const menuData = req.body;

      const { error } = menuValidation(menuData);

      if (error) {
        return Response.errorResponse(res, 400, error);
      }

      const existingMenu = await Menu.findOne({
        $or: [{ name: menuData.name }, { order: menuData.order }],
      });

      if (existingMenu) {
        return Response.customResponse(res, 409, ResponseMessage.NAME_ORDER);
      }

      const menu = Menu({
        parent: menuData.parent ? menuData.parent : "0",
        url: menuData.url,
        name: menuData.name,
        status: menuData.status,
        order: menuData.order,
        createdOn: DateUtil.currentDate(),
      });

      const newMenu = await menu.save();

      if (newMenu.parent !== "0") {
        const priviledge = new Permission({
          module: newMenu.name,
          claims: [
            `create_${newMenu.name}`,
            `edit_${newMenu.name}`,
            `access_${newMenu.name}`,
            `delete_${newMenu.name}`,
          ],
          createdOn: DateUtil.currentDate(),
        });

        await priviledge.save();

        await createActivityLog(
          "Permission",
          `New Permission - ${newMenu.name}`,
          menuData.actionBy
        );
      } else {
        const priviledge = new Permission({
          module: newMenu.name,
          claims: [`access_${newMenu.name}`],
          createdOn: DateUtil.currentDate(),
        });

        const permission = await priviledge.save();

        await createActivityLog(
          "Permission",
          `New Permission - ${permission.module}`,
          menuData.actionBy
        );
      }

      const action = `New ${moduleName} - ${newMenu.name}`;
      const person = menuData.actionBy;
      await createActivityLog(moduleName, action, person);

      return Response.successResponse(res, res.statusCode, newMenu);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getSideMenus: async (req, res) => {
    try {
      const roleId = req.params.id;
      const role = await Role.findById({ _id: roleId });

      const claims = role.claims;

      const menu = claims
        .filter((c) => c.includes("access"))
        .map((permission) => {
          const parts = permission.split("_");
          return parts.slice(1).join("_"); // Join the parts starting from index 1 with underscores
        });

      const menuItems = await Menu.find();

      const validMenuItems = menu.map((itemName) => {
        const foundItem = menuItems.find((item) => item.name === itemName);
        return foundItem
          ? { ...foundItem.toObject(), name: itemName }
          : { name: itemName, parent: "0" };
      });

      validMenuItems.sort((a, b) => a.order - b.order); // Sort validMenuItems by order property

      const modules = [];

      validMenuItems.forEach((item) => {
        if (item.parent === "0") {
          modules.push({ parent: item.name, menus: [] });
        } else {
          const parentModule = validMenuItems.find(
            (parent) => parent.id === item.parent
          );
          if (parentModule) {
            const moduleIndex = modules.findIndex(
              (module) => module.parent === parentModule.name
            );
            if (moduleIndex !== -1) {
              modules[moduleIndex].menus.push(item.name);
            } else {
              modules.push({ parent: parentModule.name, menus: [item.name] });
            }
          }
        }
      });

      return Response.successResponse(res, res.statusCode, modules);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getActiveMenus: async (req, res) => {
    try {
      const totalMenus = await Menu.countDocuments({ status: 1 });
      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalMenus
      );

      if (totalMenus == 0) {
        return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
      }

      if (pagination.page > pagination.pages) {
        return Response.customResponse(res, 200, ResponseMessage.OUTOF_DATA);
      }

      pagination.data = await Menu.find({ status: 1 })
        .sort({ _id: -1 })
        .skip(skip)
        .limit(pagination.pageSize);

      // pagination.data = pagination.data.map((item) => ({
      //   ...item.toJSON(),
      //   module: item.module ? item.module.name : null,
      // }));

      if (pagination.data.length === 0) {
        return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
      }

      return Response.paginationResponse(res, 200, pagination);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getMenus: async (req, res) => {
    try {
      const totalMenus = await Menu.countDocuments();
      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalMenus
      );

      if (totalMenus == 0) {
        return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
      }

      if (pagination.page > pagination.pages) {
        return Response.customResponse(res, 200, ResponseMessage.OUTOF_DATA);
      }

      pagination.data = await Menu.find()
        .sort({ _id: -1 })
        .skip(skip)
        .limit(pagination.pageSize);

      if (pagination.data.length === 0) {
        return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
      }

      return Response.paginationResponse(res, 200, pagination);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getMenu: async (req, res) => {
    try {
      const id = req.params.id;

      const foundMenu = await Menu.findById(id);

      if (!foundMenu) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      return Response.successResponse(res, res.statusCode, foundMenu);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getMenuByParent: async (req, res) => {
    try {
      const id = req.params.id;
      const totalMenus = await Menu.countDocuments({ parent: id, status: 1 });
      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalMenus
      );

      if (totalMenus == 0) {
        return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
      }

      if (pagination.page > pagination.pages) {
        return Response.customResponse(res, 200, ResponseMessage.OUTOF_DATA);
      }

      pagination.data = await Menu.find({ parent: id, status: 1 })
        .sort({ _id: -1 })
        .skip(skip)
        .limit(pagination.pageSize);

      if (pagination.data.length === 0) {
        return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
      }

      return Response.paginationResponse(res, res.statusCode, pagination);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  update: async (req, res) => {
    try {
      const body = req.body;
      if (!body.actionBy) {
        return Response.customResponse(
          res,
          400,
          ResponseMessage.ACTIONBY_REQUIRED
        );
      }

      const foundMenu = await Menu.findById(body.id);

      if (!foundMenu) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      foundMenu.moduleId = body.moduleId || foundMenu.moduleId;
      foundMenu.name = body.name || foundMenu.name;
      // foundMenu.status = body.status || foundMenu.status;
      foundMenu.updatedOn = DateUtil.currentDate();

      const update = await foundMenu.save();

      if (body.name) {
        const foundPermission = await Permission.findOne({ menuId: body.id });

        if (foundPermission) {
          foundPermission.claims = [
            `create_${update.name}`,
            `edit_${update.name}`,
            `access_${update.name}`,
            `delete_${update.name}`,
          ];

          foundPermission.updatedOn = DateUtil.currentDate();

          await foundPermission.save();

          await createActivityLog(
            "Permission",
            `Updated Permission -${foundPermission.name}`,
            body.actionBy
          );
        }
      }

      const action = `Updated ${moduleName} - ${foundMenu.name}`;
      const person = body.actionBy;

      await createActivityLog(moduleName, action, person);

      return Response.successResponse(res, res.statusCode, update);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  deActivateAndActivate: async (req, res) => {
    await status(req, res, Menu, moduleName);
  },
};
