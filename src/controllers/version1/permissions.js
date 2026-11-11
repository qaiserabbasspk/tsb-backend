const { createActivityLog } = require("../../utilities/activitylog_utility");
const Permission = require('../../models/permissions'); // Ensure the correct path to the Permission model
const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const DateUtil = require("../../utilities/date_utility");

module.exports = {
    create: async (req, res) => {
        try {
            const permissions = req.body;

            // Validate request body format
            if (!Array.isArray(permissions)) {
                return Response.customResponse(res, 400, "Invalid request body format. Expected an array.");
            }

            const savedPermissions = [];

            for (let i = 0; i < permissions.length; i++) {
                const { module, claims } = permissions[i];

                // Validate module and claims presence
                if (!module || !claims || !Array.isArray(claims)) {
                    return Response.customResponse(res, 400, `Invalid format for permission object at index ${i}.`);
                }

                // Check if permission already exists
                let existingPermission = await Permission.findOne({ module });

                if (existingPermission) {
                    // Update existing permission with new actions
                    existingPermission.claims = [
                        ...existingPermission.claims,
                        ...claims.filter(
                            (newClaim) => !existingPermission.claims.includes(newClaim)
                        ),
                    ];
                    existingPermission.updatedOn = DateUtil.currentDate();
                    existingPermission = await existingPermission.save();
                    savedPermissions.push(existingPermission);
                } else {
                    // Create a new permission if it doesn't exist
                    const newPermission = new Permission({
                        module,
                        claims,
                        createdOn: DateUtil.currentDate(),
                    });

                    const savedPermission = await newPermission.save();
                    savedPermissions.push(savedPermission);
                }
            }

            return Response.customResponse(res, 201, savedPermissions);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    getAll: async (req, res) => {
      try {
          const totalPermissions = await Permission.countDocuments();
          const { pagination, skip } = await PaginationUtility.paginationParams(req, totalPermissions);
  
          if (pagination.page > pagination.pages) {
              return Response.customResponse(res, 200, ResponseMessage.OUTOF_DATA);
          }
  
          const permissions = await Permission.find()
              .sort({ _id: -1 })
              .skip(skip)
              .limit(pagination.pageSize);
  
          const permissionData = permissions.map((permission) => ({
              module: permission.module,
              claims: permission.claims,
              createdOn: permission.createdOn,
              updatedOn: permission.updatedOn,
              id: permission._id,
          }));
  
          if (permissionData.length === 0) {
              return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
          }
  
          const response = {
              page: pagination.page,
              pages: pagination.pages,
              pageSize: pagination.pageSize,
              rows: totalPermissions,
              data: permissionData,
          };
  
          return Response.paginationResponse(res, 200, response);
      } catch (err) {
          return Response.errorResponse(res, 500, err);
      }
  },
  

    getPermissionByMenuId: async (req, res) => {
        try {
            const permission = await Permission.findById(req.params.id);

            if (!permission) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            return Response.customResponse(res, 200, permission);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    updateById: async (req, res) => {
      try {
          const { id, userId } = req.params;
          const { module, claims } = req.body;
  
          // Validate module and claims presence
          if (!module || !claims || !Array.isArray(claims)) {
              return Response.customResponse(res, 400, "Invalid format for permission object.");
          }
  
          // Check for an existing permission with the same module name, excluding the current document
          const existingPermission = await Permission.findOne({ module, _id: { $ne: id } });
          if (existingPermission) {
              return Response.customResponse(res, 400, "Duplicate module name. A permission with this module already exists.");
          }
  
          const updatedPermission = await Permission.findByIdAndUpdate(
              id,
              {
                  module,
                  claims,
                  updatedOn: DateUtil.currentDate()
              },
              { new: true, runValidators: true }
          );
  
          if (!updatedPermission) {
              return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
          }
  
          // Logging the action of updating a permission
          const action = `Updated ${module} - ${updatedPermission._id}`;
          await createActivityLog(module, action, userId);
  
          return Response.customResponse(res, 200, updatedPermission);
      } catch (err) {
          return Response.errorResponse(res, 500, err);
      }
  },

  delete: async (req, res) => {
    try {
        const { id, userCode } = req.params;
        const permission = await Permission.findById(id);

        if (!permission) {
            return Response.customResponse(res, 404, ResponseMessage.NO_DATA);
        }

        await permission.deleteOne();

        const moduleName = "Permission";
        const action = `Deleted ${moduleName} - ${permission.id}`;
        const person = userCode;
        await createActivityLog(moduleName, action, person);

        return Response.customResponse(
            res,
            200,
            ResponseMessage.SUCCESS_MESSAGE
        );
    } catch (err) {
        return Response.errorResponse(res, 500, err);
    }
},

  
  
};
