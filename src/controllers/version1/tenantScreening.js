const mongoose = require('mongoose');

// MODELS
const Tenant = require("../../models/tenants");
const PropertyUnit = require("../../models/propertyUnits");
const PropertyOwner = require("../../models/propertyOwners");
const TenantApplication = require("../../models/tenantApplications");
const TenantScreening = require("../../models/tenantScreening");

// UTILITIES
const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/activitylog_utility");
const { sendEmail } = require("../../utilities/emailer");
const EmailLog = require("../../models/EmailLog");

const moduleName = `Screening`;
const modulename = `Application`;

module.exports = {

    getTenantScreenings: async (req, res) => {
        try {

            // Define status labels
            const statusLabels = {
                0: "In Complete",
                1: "In Review",
                2: "Accepted",
                3: "Rejected",
                4: "Requires Update",
            };

            // Count total Requests for pagination
            const totalRequests = await TenantScreening.countDocuments();

            // Return a "No Data" response if no request exist
            if (totalRequests === 0) {
                return Response.customResponse(res, res.statusCode, ResponseMessage.NO_DATA);
            }

            // Get pagination parameters
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalRequests
            );

            // Ensure the requested page is within range
            if (pagination.page > pagination.pages) {
                return Response.customResponse(res, res.statusCode, ResponseMessage.OUTOF_DATA);
            }

            // Fetch requests with pagination
            const propertyUnits = await TenantScreening.find()
                .populate([
                    // { path: "property", select: "code description yearBuilt status address" },
                    { path: "property", select: "code description image status" },
                    { path: "unit", select: "id code name" },
                    { path: "customer", select: "code name email avatar phone address" },
                ])
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            // Map the results with property, category, and propertyStatus details
            pagination.data = propertyUnits.map((item) => ({
                ...item.toJSON(),
                screeningStatusLabel: statusLabels[item.screeningStatus] || "Unknown",
                property: item.property ? item.property : null,
                unit: item.unit ? item.unit : null,
                customer: item.customer ? item.customer : null,
            }));

            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            return Response.errorResponse(res, 500, err.message || err);
        }
    },

    getTenantScreeningsByOwner: async (req, res) => {
        try {
            // Fetch the tenant by code
            const owner = await PropertyOwner.findOne({ code: req.params.code });
            // console.log("OWNER:", owner);

            if (!owner) {
                return Response.customResponse(res, 404, ResponseMessage.NO_OWNER_RECORD);
            }

            // Use the owner CODE for filtering
            const code = owner.code;

            // Define status labels
            const statusLabels = {
                0: "In Complete",
                1: "In Review",
                2: "Accepted",
                3: "Rejected",
                4: "Requires Update",
            };

            // Count total Requests for pagination
            const totalRequests = await TenantScreening.countDocuments({ ownerCode: code });
            // console.log("totalRequests:", totalRequests);

            // Return a "No Data" response if no request exist
            if (totalRequests === 0) {
                return Response.customResponse(res, res.statusCode, ResponseMessage.NO_DATA);
            }

            // Get pagination parameters
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalRequests
            );

            // Ensure the requested page is within range
            if (pagination.page > pagination.pages) {
                return Response.customResponse(res, res.statusCode, ResponseMessage.OUTOF_DATA);
            }

            // Fetch requests with pagination
            const propertyUnits = await TenantScreening.find({ ownerCode: code })
                .populate([
                    // { path: "property", select: "code description yearBuilt status address" },
                    { path: "property", select: "code description image status" },
                    { path: "unit", select: "id code name" },
                    { path: "customer", select: "code name email avatar phone address" },
                ])
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            // Map the results with property, category, and propertyStatus details
            pagination.data = propertyUnits.map((item) => ({
                ...item.toJSON(),
                screeningStatusLabel: statusLabels[item.screeningStatus] || "Unknown",
                property: item.property ? item.property : null,
                unit: item.unit ? item.unit : null,
                customer: item.customer ? item.customer : null,
            }));

            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            return Response.errorResponse(res, 500, err.message || err);
        }
    },

    getTenantScreeningsByTenant: async (req, res) => {
        try {
            // Fetch the tenant by code
            const tenant = await Tenant.findById(req.params.tenantId);
            // console.log("TENANT:", tenant);

            if (!tenant) {
                return Response.customResponse(res, 404, ResponseMessage.NO_TENANT_RECORD);
            }

            // Use the tenant ID for filtering
            const tenantId = tenant._id;

            // Define status labels
            const statusLabels = {
                0: "In Complete",
                1: "In Review",
                2: "Accepted",
                3: "Rejected",
                4: "Requires Update",
            };

            // Count total Requests for pagination
            const totalRequests = await TenantScreening.countDocuments({ tenantId: tenantId });

            // Return a "No Data" response if no request exist
            if (totalRequests === 0) {
                return Response.customResponse(res, res.statusCode, ResponseMessage.NO_DATA);
            }

            // Get pagination parameters
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalRequests
            );

            // Ensure the requested page is within range
            if (pagination.page > pagination.pages) {
                return Response.customResponse(res, res.statusCode, ResponseMessage.OUTOF_DATA);
            }

            // Fetch requests with pagination
            const requests = await TenantScreening.find({ tenantId: tenantId })
                .populate([
                    // { path: "property", select: "code description yearBuilt status address" },
                    { path: "property", select: "code description image status" },
                    { path: "unit", select: "id code name" },
                    { path: "customer", select: "code name email avatar phone address" },
                ])
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            // Map the results with property, tenant, and owner details
            pagination.data = requests.map((item) => ({
                ...item.toJSON(),
                screeningStatusLabel: statusLabels[item.screeningStatus] || "Unknown",
                property: item.property ? item.property : null,
                unit: item.unit ? item.unit : null,
                customer: item.customer ? item.customer : null,
            }));

            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            return Response.errorResponse(res, 500, err.message || err);
        }
    },

    getByTenantScreeningStatus: async (req, res) => {
        try {
            let { screeningStatus } = req.params;

            // Define status labels
            const statusLabels = {
                0: "In Complete",
                1: "In Review",
                2: "Accepted",
                3: "Rejected",
                4: "Requires Update",
            };

            // Validate and parse applicationStatus
            if (screeningStatus !== undefined) {
                screeningStatus = parseInt(screeningStatus);
                if (isNaN(screeningStatus)) {
                    return Response.customResponse(res, 400, "Invalid screeningStatus value.");
                }
            }

            // Define query object (If applicationStatus is not provided, fetch all)
            const query = screeningStatus !== undefined ? { screeningStatus } : {};

            const totalRequests = await TenantScreening.countDocuments(query);

            const { pagination, skip } = await PaginationUtility.paginationParams(req, totalRequests);

            if (totalRequests === 0) {
                return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
            }

            if (pagination.page > pagination.pages) {
                return Response.customResponse(res, 200, ResponseMessage.OUTOF_DATA);
            }

            // Fetch requests with the correct filtering
            const requests = await TenantScreening.find(query)
                .sort({ updatedOn: -1 })
                .skip(skip)
                .limit(pagination.pageSize)
                .populate([
                    // { path: "property", select: "code description yearBuilt status address" },
                    { path: "property", select: "code description image status" },
                    { path: "unit", select: "id code name" },
                    { path: "customer", select: "code name email avatar phone address" },
                ]);

            // Map the results with property, tenant, and owner details
            pagination.data = requests.map((item) => ({
                ...item.toJSON(),
                screeningStatusLabel: statusLabels[item.screeningStatus] || "Unknown",
                property: item.property ? item.property : null,
                unit: item.unit ? item.unit : null,
                customer: item.customer ? item.customer : null,
            }));

            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            return Response.customResponse(res, 500, err);
        }
    },

    getByTenantScreening: async (req, res) => {
        try {
            const statusLabels = {
                0: "In Complete",
                1: "In Review",
                2: "Accepted",
                3: "Rejected",
                4: "Requires Update",
            };

            const application = await TenantScreening.findById(req.params.id)
                .populate([
                    { path: "property", select: "code description image status" },
                    { path: "unit", select: "id code name" },
                    { path: "customer", select: "code name email avatar phone address" },
                ]);

            if (!application) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            // Add statusLabel to application object
            const screeningWithLabel = {
                ...application.toObject(),
                screeningStatusLabel: statusLabels[application.screeningStatus] || "Unknown",
            };

            return Response.successResponse(res, res.statusCode, screeningWithLabel);
        } catch (error) {
            return Response.errorResponse(res, 500, error);
        }
    },

    deleteTenantScreening: async (req, res) => {
        try {
            const { applicationId, code } = req.params;

            // Find the application by ID and tenantId
            const application = await TenantScreening.findOne({ applicationId: applicationId });

            if (!application) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            // Ensure applicationStatus is 0 before deletion
            if (application.screeningStatus !== 0) {
                return Response.customResponse(res, 403, "Application cannot be deleted unless it is In-Complete.");
            }

            // Delete the screening
            const deletedScreening = await TenantScreening.findOneAndDelete({ applicationId: applicationId });

            if (!deletedScreening) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            // Log the screening deletion action
            const action = `Delete ${moduleName} - ${application.code}`;
            await createActivityLog(moduleName, action, code);

            // Attempt to delete the application
            const deletedApplication = await TenantApplication.findOneAndDelete({ _id: applicationId, applicationStatus: 0 });

            // Log the application deletion action
            const action2 = `Delete ${modulename} - ${application.code}`;
            await createActivityLog(moduleName, action2, code);

            if (deletedApplication) {
                // Both TenantScreening and TenantApplication deleted
                return Response.successResponse(res, 200, {
                    message: "Screening and Application deleted successfully."
                });
            } else {
                // TenantScreening deleted, but TenantApplication not found or not deleted
                return Response.successResponse(res, 200, {
                    message: "Screening deleted successfully, but Application not found or could not be deleted."
                });
            }
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    acceptApplicationAndUpdateStatus: async (req, res) => {
        try {
            const { applicationId } = req.params;
            const { description } = req.body; // Used in email body
            // console.log(JSON.stringify({ params: req.params, body: req.body }));

            // Step 1: Check if screening exists
            const existingScreening = await TenantScreening.findOne({ applicationId: applicationId });
            if (!existingScreening) {
                return Response.customResponse(res, 400, ResponseMessage.NO_RECORD);
            }
            // console.log(existingScreening);

            // Step 2: Screening status validations
            if (existingScreening.screeningStatus === 0) {
                return Response.customResponse(res, 403, "Application cannot be Accepted while in In-Complete Status.");
            }
            // if (existingScreening.screeningStatus === 2) {
            //     return Response.customResponse(res, 403, "This Application has already been Accepted.");
            // }
            if (existingScreening.screeningStatus === 3) {
                return Response.customResponse(res, 403, "Application cannot be Accepted once it's been Rejected.");
            }
            if (existingScreening.screeningStatus === 4) {
                return Response.customResponse(res, 403, "Application cannot be Accepted while in Requires-Update Status.");
            }

            // Step 3: Update screening status
            const updatedScreening = await TenantScreening.findOneAndUpdate(
                { applicationId: applicationId },
                {
                    screeningStatus: 2,
                    reason: req.body.description
                },
                { new: true }
            );

            if (!updatedScreening) {
                return Response.customResponse(res, 400, ResponseMessage.NO_RECORD);
            }

            // Step 4: Update tenant application status
            const updatedApplication = await TenantApplication.findOneAndUpdate(
                { _id: applicationId },
                { applicationStatus: 2 },
                { new: true }
            );

            if (!updatedApplication) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            // Step 5: Fetch tenant and propertyUnit details
            const tenant = await Tenant.findById(updatedApplication.tenantId);
            const propertyUnit = await PropertyUnit.findById(updatedApplication.propertyUnitId);
            const owner = await PropertyOwner.findOne({ code: updatedApplication.ownerCode });

            if (!tenant || !propertyUnit || !owner) {
                return Response.customResponse(res, 404, "Associated data (tenant, owner, or unit) missing.");
            }

            // Step 6: Log activity
            const action1 = `${moduleName} - ${updatedScreening.code}`;
            const person = updatedScreening.ownerCode;
            await createActivityLog(moduleName, action1, person);

            // Step 7: Send email to tenant
            const receiverEmail = tenant.email;
            const receiverName = tenant.name;
            const senderName = owner.name;
            const emailSubject = `🎉 Application Accepted - ${propertyUnit.name}`;
            const emailText = `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <p>Dear ${receiverName},</p>

                <p>We are pleased to inform you that your application for the unit <strong>${propertyUnit.name} - ${propertyUnit.code}</strong> has been <strong>accepted</strong>.</p>

                <h3 style="color: #444; margin-top: 25px;">💬 Owner's Message</h3>
                <blockquote style="background-color: #f9f9f9; border-left: 4px solid #ccc; padding: 10px 15px; margin: 20px 0;">
                    ${description || "No additional comments were provided."}
                </blockquote>

                <p>You can now proceed with the next steps as guided on your dashboard.</p>

                <br>
                <p style="font-weight: bold;">Best Regards,<br>${senderName}</p>

                <br>
                <div style="border-top: 1px solid #ddd; padding-top: 15px;">
                    <a href="https://rentrack.org" target="_blank">
                        <img src="https://quickbooking.org/quickbooking-logo-wide.png" alt="QuickBooking Logo" style="width: 150px; height: auto;">
                    </a><br>
                    <span style="font-size: 12px; color: #999;">&copy; ${new Date().getFullYear()} Rentrack. All rights reserved.</span>
                </div>
            </div>
        `;

            try {
                await sendEmail(receiverEmail, emailSubject, emailText, res);
            } catch (emailErr) {
                console.error("Email Error: ", emailErr.message);
                await EmailLog.create({
                    to: receiverEmail,
                    subject: emailSubject,
                    message: emailText,
                    status: "failed",
                    error: emailErr.message,
                    createdOn: DateUtil.currentDate()
                });
            }

            // Step 8: Send final response
            return res.status(200).json({
                message: ResponseMessage.SUCCESS_MESSAGE,
                data: updatedScreening
            });

        } catch (err) {
            return Response.errorResponse(res, 500, err.message || err);
        }
    },

    rejectApplicationAndUpdateStatus: async (req, res) => {
        try {
            const { applicationId } = req.params;
            const { description } = req.body;

            // Step 1: Find the existing screening record
            const existingScreening = await TenantScreening.findOne({ applicationId: applicationId });
            if (!existingScreening) {
                return Response.customResponse(res, 400, ResponseMessage.NO_RECORD);
            }

            // Step 2: Check screening status rules
            if (existingScreening.screeningStatus === 2) {
                return Response.customResponse(res, 403, "Application cannot be Rejected once it's Accepted.");
            }

            // if (existingScreening.screeningStatus === 3) {
            //     return Response.customResponse(res, 403, "This Application has already been Rejected.");
            // }

            // Step 3: Update screening status to Rejected (3)
            const updatedScreening = await TenantScreening.findOneAndUpdate(
                { applicationId: applicationId },
                {
                    screeningStatus: 3,
                    reason: description
                },
                { new: true }
            );

            if (!updatedScreening) {
                return Response.customResponse(res, 400, ResponseMessage.NO_RECORD);
            }

            // Step 4: Update TenantApplication status to Rejected (3)
            const updatedApplication = await TenantApplication.findOneAndUpdate(
                { _id: applicationId },
                { applicationStatus: 3 },
                { new: true }
            );

            if (!updatedApplication) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            // Step 5: Fetch tenant, unit, and owner info
            const tenant = await Tenant.findById(updatedApplication.tenantId);
            const propertyUnit = await PropertyUnit.findById(updatedApplication.propertyUnitId);
            const owner = await PropertyOwner.findOne({ code: updatedApplication.ownerCode });

            if (!tenant || !propertyUnit || !owner) {
                return Response.customResponse(res, 404, "Related tenant, unit, or owner record not found.");
            }

            // Step 6: Log screening & application actions
            const action = `${moduleName} - ${updatedScreening.code}`;
            const action2 = `${modulename} - ${updatedScreening.code}`;
            await createActivityLog(moduleName, action, updatedScreening.ownerCode);
            await createActivityLog(modulename, action2, updatedScreening.ownerCode);

            // Step 7: Prepare and send rejection email
            const receiverEmail = tenant.email;
            const receiverName = tenant.name;
            const senderName = owner.name;
            const emailSubject = `❌ Application Rejected - ${propertyUnit.name}`;
            const emailText = `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <p>Dear ${receiverName},</p>

                <p>We regret to inform you that your application for the unit <strong>${propertyUnit.name} - ${propertyUnit.code}</strong> has been <strong>rejected</strong>.</p>

                <h3 style="color: #a00; margin-top: 25px;">📋 Owner's Comments</h3>
                <blockquote style="background-color: #fcecec; border-left: 4px solid #e00; padding: 10px 15px; margin: 20px 0;">
                    ${description || "No additional comments were provided."}
                </blockquote>

                <p>You may review the reason above or contact the property owner for further details.</p>

                <br>
                <p style="font-weight: bold;">Best Regards,<br>${senderName}</p>

                <br>
                <div style="border-top: 1px solid #ddd; padding-top: 15px;">
                    <a href="https://rentrack.org" target="_blank">
                        <img src="https://quickbooking.org/quickbooking-logo-wide.png" alt="QuickBooking Logo" style="width: 150px; height: auto;">
                    </a><br>
                    <span style="font-size: 12px; color: #999;">&copy; ${new Date().getFullYear()} Rentrack. All rights reserved.</span>
                </div>
            </div>
        `;

            try {
                await sendEmail(receiverEmail, emailSubject, emailText, res);
            } catch (emailErr) {
                console.error("Email Error: ", emailErr.message);
                await EmailLog.create({
                    to: receiverEmail,
                    subject: emailSubject,
                    message: emailText,
                    status: "failed",
                    error: emailErr.message,
                    createdOn: DateUtil.currentDate()
                });
            }

            // Step 8: Return response
            return res.status(200).json({
                updatedScreening,
                updatedApplication
            });

        } catch (err) {
            return Response.errorResponse(res, 500, err.message || err);
        }
    },

    requestChangeAndUpdateStatus: async (req, res) => {
        try {
            const { applicationId } = req.params;
            const { description } = req.body;

            // Step 1: Find the record first
            const existingScreening = await TenantScreening.findOne({ applicationId: applicationId });

            if (!existingScreening) {
                return Response.customResponse(res, 400, ResponseMessage.NO_RECORD);
            }

            // Step 2: Ensure screeningStatus allows update
            if (existingScreening.screeningStatus === 2) {
                return Response.customResponse(res, 403, "Cannot Request Update once Application is Accepted.");
            }

            // Step 3: Update screeningStatus to "Requires Update" (4)
            const updatedScreening = await TenantScreening.findOneAndUpdate(
                { applicationId: applicationId },
                {
                    screeningStatus: 4,
                    reason: description
                },
                { new: true }
            );

            if (!updatedScreening) {
                return Response.customResponse(res, 400, ResponseMessage.NO_RECORD);
            }

            // Step 4: Update TenantApplication status to 4 (requires update)
            const updatedApplication = await TenantApplication.findOneAndUpdate(
                { _id: applicationId },
                { applicationStatus: 4 },
                { new: true }
            );

            if (!updatedApplication) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            // Step 5: Log activity
            const action = `${moduleName} - ${updatedScreening.code}`;
            const action2 = `${modulename} - ${updatedScreening.code}`;
            await createActivityLog(moduleName, action, updatedScreening.ownerCode);
            await createActivityLog(modulename, action2, updatedScreening.ownerCode);

            // Step 6: Fetch tenant, unit, and owner details
            const tenant = await Tenant.findById(updatedApplication.tenantId);
            const propertyUnit = await PropertyUnit.findById(updatedApplication.propertyUnitId);
            const owner = await PropertyOwner.findOne({ code: updatedApplication.ownerCode });

            if (!tenant || !propertyUnit || !owner) {
                return Response.customResponse(res, 404, "Related tenant, unit, or owner record not found.");
            }

            // Step 7: Prepare and send the update request email
            const receiverEmail = tenant.email;
            const receiverName = tenant.name;
            const senderName = owner.name;
            const emailSubject = `📌 Action Required: Update Your Application for ${propertyUnit.name} - ${propertyUnit.code}`;
            const emailText = `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <p>Dear ${receiverName},</p>

                <p>Your application for <strong>${propertyUnit.name}</strong> requires updates or additional information before it can proceed.</p>

                <h3 style="color: #d58512; margin-top: 25px;">📝 Owner's Comments</h3>
                <blockquote style="background-color: #fff8e1; border-left: 4px solid #e6b800; padding: 10px 15px; margin: 20px 0;">
                    ${description || "Please update the missing or incorrect information in your application."}
                </blockquote>

                <p>Kindly log in to the Rentrack portal to make the necessary updates as soon as possible.</p>

                <br>
                <p style="font-weight: bold;">Best Regards,<br>${senderName}</p>

                <br>
                <div style="border-top: 1px solid #ddd; padding-top: 15px;">
                    <a href="https://rentrack.org" target="_blank">
                        <img src="https://quickbooking.org/quickbooking-logo-wide.png" alt="QuickBooking Logo" style="width: 150px; height: auto;">
                    </a><br>
                    <span style="font-size: 12px; color: #999;">&copy; ${new Date().getFullYear()} Rentrack. All rights reserved.</span>
                </div>
            </div>
        `;

            try {
                await sendEmail(receiverEmail, emailSubject, emailText, res);
            } catch (emailErr) {
                console.error("Email Error: ", emailErr.message);
                await EmailLog.create({
                    to: receiverEmail,
                    subject: emailSubject,
                    message: emailText,
                    status: "failed",
                    error: emailErr.message,
                    createdOn: DateUtil.currentDate()
                });
            }

            // Step 8: Send final response
            return res.status(200).json({
                updatedScreening,
                updatedApplication
            });

        } catch (err) {
            return Response.errorResponse(res, 500, err.message || err);
        }
    }

};
