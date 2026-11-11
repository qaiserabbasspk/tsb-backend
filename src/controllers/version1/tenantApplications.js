const mongoose = require('mongoose');

// MODELS
const Tenant = require("../../models/tenants");
const Property = require("../../models/properties");
const PropertyUnit = require("../../models/propertyUnits");
const DocumentType = require("../../models/documentTypes");
const PropertyOwner = require("../../models/propertyOwners");
const TenantApplication = require("../../models/tenantApplications");
const TenantScreening = require("../../models/tenantScreening");

// VALIDATIONS
const { tenantApplicationValidation } = require("../../validations/tenantApplications");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const unique = require("../../utilities/codegenerator_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/activitylog_utility");

const { createScreening, updateScreening } = require("../../utilities/screening_utility");
const { sendEmail } = require("../../utilities/emailer");
const EmailLog = require("../../models/EmailLog");
// live key
const stripe = require('stripe')('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');
// test key for testing
//const stripe = require('stripe')('sk_test_51M4faDIJ5Vh9F5wkj8BTsmpZawTsNrCk1AqeeAuvSkNZ77DRtZVubQKvY4d2R7apADw86phVINocKygK6tLKVQ4L00Tdbw7ZXG');


const moduleName = `Application`;
const modulename = `Screening`;

module.exports = {
    apply: async (req, res) => {
        try {
            const body = req.body;
            const { tenantId, propertyId, propertyUnitId, documents } = body;

            // ✅ Fetch tenant, property, and owner
            const tenant = await Tenant.findById(tenantId);
            const property = await Property.findById(propertyId);
            if (!property) return Response.customResponse(res, 404, ResponseMessage.NO_PROPERTY_RECORD);

            const owner = await PropertyOwner.findById(property.propertyOwnerId);
            const propertyUnit = await PropertyUnit.findById(propertyUnitId);

            // ✅ Check for duplicate application
            const existingApplication = await TenantApplication.findOne({ tenantId, propertyId, propertyUnitId });
            if (existingApplication) {
                return Response.customResponse(
                    res,
                    409,
                    `An application for this property unit by ${tenant.name} already exists.`
                );
            }

            // ✅ Validate request body
            const { error } = tenantApplicationValidation(req.body);
            if (error) {
                return Response.errorResponse(res, 400, error);
            }

            if (!owner) return Response.customResponse(res, 404, ResponseMessage.NO_OWNER_RECORD);
            if (!tenant) return Response.customResponse(res, 404, ResponseMessage.NO_TENANT_RECORD);
            if (!propertyUnit) return Response.customResponse(res, 404, ResponseMessage.NO_PROPERTY_UNIT_ASSOC);

            // ✅ Update Tenant with owner code
            await Tenant.findOneAndUpdate(
                { _id: tenant._id },
                { ownerCode: owner.code },
                { new: true }
            );

            // ✅ Fetch document details
            const documentsWithDetails = await Promise.all(
                documents.map(async (document) => {
                    const documentTypeDetails = await DocumentType.findById(document.id);
                    if (!documentTypeDetails) {
                        throw new Error(`DocumentType with ID ${document.documentTypeId} not found.`);
                    }
                    return {
                        id: documentTypeDetails._id,
                        documentType: documentTypeDetails.name?.toString().trim() || "Unknown",
                        documentName: document.documentName,
                        tenantCode: tenant.code,
                    };
                })
            );

            const uniqueCode = unique.randomCode();

            // ✅ Create new TenantApplication object
            const application = new TenantApplication({
                tenantId,
                ownerCode: owner.code,
                propertyId,
                code: "AP" + uniqueCode,
                propertyUnitId,
                documents: documentsWithDetails,
                tenantSign: 0,
                applicationStatus: 0,
                createdOn: DateUtil.currentDate(),
            });

            await application.save();

            // ✅ Create activity log
            const action = `New ${moduleName}`;
            const actionBy = body.actionBy == '' || body.actionBy == null ? tenant.code : body.actionBy;
            await createActivityLog(moduleName, action, actionBy);

            // ✅ Trigger screening if needed
            await createScreening(TenantScreening, application, tenant, owner, moduleName, actionBy);

            // ✅ Send professional email to the owner
            const senderName = `${tenant.name}`;
            const receiverName = `${owner.name}`;
            const receiverEmail = `${owner.email}`;

            const emailSubject = `New Application for Unit ${propertyUnit?.name || "Unknown Unit"} - ${application.code}`;
            const emailText = `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <p>Dear ${receiverName},</p>

                <p>
                    We are pleased to inform you that <strong>${senderName}</strong> has expressed interest in one of your property units listed on Rentrack.
                </p>

                <h3 style="color: #444; margin-top: 25px;">🔍 Application Details</h3>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 8px; font-weight: bold;">Application Code:</td>
                        <td style="padding: 8px;">${application.code}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; font-weight: bold;">Applicant Name:</td>
                        <td style="padding: 8px;">${tenant.name}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; font-weight: bold;">Unit Applied For:</td>
                        <td style="padding: 8px;">${propertyUnit?.name || "N/A"}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; font-weight: bold;">Property:</td>
                        <td style="padding: 8px;">${property?.description || "N/A"}</td>
                    </tr>
                </table>

                <p>You can view or manage this application from your Rentrack dashboard.</p>

                <p>Thank you for using Rentrack.</p>

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

                // Log email failure
                await EmailLog.create({
                    to: receiverEmail,
                    subject: emailSubject,
                    message: emailText,
                    status: "failed",
                    error: emailErr.message,
                    createdOn: DateUtil.currentDate()
                });

                return Response.customResponse(res, 500, "Email sending failed");
            }

            return Response.customResponse(res, 201, ResponseMessage.SUCCESS_MESSAGE, { application });

        } catch (err) {
            return Response.errorResponse(res, 500, err.message || err);
        }
    },

    getTenantApplications: async (req, res) => {
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
            const totalRequests = await TenantApplication.countDocuments();

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
            const propertyUnits = await TenantApplication.find()
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
                applicationStatusLabel: statusLabels[item.applicationStatus] || "Unknown",
                property: item.property ? item.property : null,
                unit: item.unit ? item.unit : null,
                customer: item.customer ? item.customer : null,
            }));

            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            return Response.errorResponse(res, 500, err.message || err);
        }
    },

    getTenantApplicationsByOwner: async (req, res) => {
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
            const totalRequests = await TenantApplication.countDocuments({ ownerCode: code });
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
            const propertyUnits = await TenantApplication.find({ ownerCode: code })
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
                applicationStatusLabel: statusLabels[item.applicationStatus] || "Unknown",
                property: item.property ? item.property : null,
                unit: item.unit ? item.unit : null,
                customer: item.customer ? item.customer : null,
            }));

            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            return Response.errorResponse(res, 500, err.message || err);
        }
    },

    getTenantApplicationsByTenant: async (req, res) => {
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
            const totalRequests = await TenantApplication.countDocuments({ tenantId: tenantId });

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
            const requests = await TenantApplication.find({ tenantId: tenantId })
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
                applicationStatusLabel: statusLabels[item.applicationStatus] || "Unknown",
                property: item.property ? item.property : null,
                unit: item.unit ? item.unit : null,
                customer: item.customer ? item.customer : null,
            }));

            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            return Response.errorResponse(res, 500, err.message || err);
        }
    },

    getByTenantApplicationStatus: async (req, res) => {
        try {
            let { applicationStatus } = req.params;
            // console.log("Received query parameters:", req.params);

            // Define status labels
            const statusLabels = {
                0: "In Complete",
                1: "In Review",
                2: "Accepted",
                3: "Rejected",
                4: "Requires Update",
            };

            // Validate and parse applicationStatus
            if (applicationStatus !== undefined) {
                applicationStatus = parseInt(applicationStatus);
                if (isNaN(applicationStatus)) {
                    return Response.customResponse(res, 400, "Invalid applicationStatus value.");
                }
            }

            // Define query object (If applicationStatus is not provided, fetch all)
            const query = applicationStatus !== undefined ? { applicationStatus } : {};

            const totalRequests = await TenantApplication.countDocuments(query);
            const { pagination, skip } = await PaginationUtility.paginationParams(req, totalRequests);

            if (totalRequests === 0) {
                return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
            }

            if (pagination.page > pagination.pages) {
                return Response.customResponse(res, 200, ResponseMessage.OUTOF_DATA);
            }

            // Fetch requests with the correct filtering
            const requests = await TenantApplication.find(query)
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
                applicationStatusLabel: statusLabels[item.applicationStatus] || "Unknown",
                property: item.property ? item.property : null,
                unit: item.unit ? item.unit : null,
                customer: item.customer ? item.customer : null,
            }));

            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            return Response.customResponse(res, 500, err);
        }
    },

    getByTenantApplication: async (req, res) => {
        try {
            const statusLabels = {
                0: "In Complete",
                1: "In Review",
                2: "Accepted",
                3: "Rejected",
                4: "Requires Update",
            };

            const application = await TenantApplication.findById(req.params.id)
                .populate([
                    { path: "property", select: "code description image status" },
                    { path: "unit", select: "id code name" },
                    { path: "customer", select: "code name email avatar phone address" },
                ]);

            if (!application) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            // Add statusLabel to application object
            const applicationWithLabel = {
                ...application.toObject(),
                applicationStatusLabel: statusLabels[application.applicationStatus] || "Unknown",
            };

            return Response.successResponse(res, res.statusCode, applicationWithLabel);
        } catch (error) {
            return Response.errorResponse(res, 500, error);
        }
    },

    update: async (req, res) => {
        try {
            const { id, documents, actionBy } = req.body;

            if (!id || !Array.isArray(documents)) {
                return Response.customResponse(res, 400, "Invalid request. 'id' and 'documents' are required.");
            }

            const existingApplication = await TenantApplication.findById(id);

            if (!existingApplication) {
                return Response.customResponse(res, 404, "Application not found.");
            }

            // ✅ Fetch tenant, property, and owner
            const tenant = await Tenant.findById(existingApplication.tenantId);
            const property = await Property.findById(existingApplication.propertyId);
            const owner = await PropertyOwner.findOne({ code: existingApplication.ownerCode });
            const propertyUnit = await PropertyUnit.findById(existingApplication.propertyUnitId);

            if (!property) return Response.customResponse(res, 404, ResponseMessage.NO_PROPERTY_RECORD);
            if (!owner) return Response.customResponse(res, 404, ResponseMessage.NO_OWNER_RECORD);
            if (!tenant) return Response.customResponse(res, 404, ResponseMessage.NO_TENANT_RECORD);
            if (!propertyUnit) return Response.customResponse(res, 404, ResponseMessage.NO_PROPERTY_UNIT_ASSOC);

            // Prepare updated documents
            const documentsWithDetails = await Promise.all(
                documents.map(async (document) => {
                    const documentTypeDetails = await DocumentType.findById(document.id);
                    if (!documentTypeDetails) {
                        throw new Error(`DocumentType with ID ${document.id} not found.`);
                    }
                    return {
                        id: documentTypeDetails._id,
                        documentType: documentTypeDetails.name?.trim() || "Unknown",
                        documentName: document.documentName,
                        tenantCode: tenant._id,
                    };
                })
            );

            // Remove duplicate documents
            const uniqueDocuments = Array.from(
                new Map(documentsWithDetails.map(doc => [doc.documentName, doc])).values()
            );

            // Update screening
            await updateScreening(
                uniqueDocuments,
                existingApplication,
                tenant._id,
                existingApplication.ownerCode,
                modulename,
                actionBy,
                req.body,
                res
            );

            // Save application updates
            existingApplication.documents = uniqueDocuments;
            existingApplication.applicationStatus = 1;
            await existingApplication.save();

            // Log activity
            const action = `Updated documents in Tenant Application`;
            await createActivityLog("TenantApplication", action, actionBy);

            // ✅ Prepare and send email to property owner
            const receiverEmail = owner.email;
            const receiverName = owner.name;
            const senderName = tenant.name;
            const emailSubject = `Application Update for Unit ${propertyUnit?.name || "Unknown Unit"} - ${existingApplication.code}`;
            const emailText = `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <p>Dear ${receiverName},</p>

                <p>
                    We wanted to let you know that <strong>${senderName}</strong> has updated their application for the unit <strong>${propertyUnit?.name}</strong> at <strong>${property?.description || 'your property'}</strong>.
                </p>

                <h3 style="color: #444; margin-top: 25px;">📄 Updated Documents</h3>
                <ul>
                    ${uniqueDocuments.map(doc => `<li><strong>${doc.documentType}:</strong> ${doc.documentName}</li>`).join('')}
                </ul>

                <p>
                    You can review the changes from your dashboard.
                </p>

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

                return Response.customResponse(res, 500, "Email sending failed.");
            }

            // ✅ Send final success response
            return Response.customResponse(res, 200, "Documents updated successfully.", existingApplication);

        } catch (err) {
            return Response.customResponse(res, 500, err.message || err);
        }
    },

    deleteTenantApplication: async (req, res) => {
        try {
            const { applicationId, code } = req.params;

            // Find the application by ID and tenantId
            const application = await TenantApplication.findById(applicationId);

            if (!application) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            // Ensure applicationStatus is 0 before deletion
            if (application.applicationStatus !== 0) {
                return Response.customResponse(res, 403, "Application cannot be deleted unless in InComplete - status.");
            }

            // Delete the application
            const deletedApplication = await TenantApplication.findOneAndDelete({ _id: applicationId });

            if (!deletedApplication) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            // Log the application deletion action
            const action = `Delete ${moduleName} - ${application.code}`;
            await createActivityLog(moduleName, action, code);

            // Attempt to delete the screening
            const deletedScreening = await TenantScreening.findOneAndDelete({ applicationId: applicationId, screeningStatus: 0 });

            // Log the application deletion action
            const action2 = `Delete ${modulename} - ${application.code}`;
            await createActivityLog(moduleName, action2, code);

            if (deletedScreening) {
                // Both TenantScreening and TenantApplication deleted
                return Response.successResponse(res, 200, {
                    message: "Application and Screening deleted successfully."
                });
            } else {
                // TenantScreening deleted, but TenantApplication not found or not deleted
                return Response.successResponse(res, 200, {
                    message: "Application deleted successfully, but Screening not found or could not be deleted."
                });
            }
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    makePayment: async (req, res) => {
        const name = encodeURIComponent(req.body.name);
        const amount = encodeURIComponent(req.body.amount);
        // const ownerId = encodeURIComponent(req.body.ownerId);
        // const subscriptionId = encodeURIComponent(req.body.subscriptionId);

        const success_url = `https://admin.rentrack.org/#/application/add-application?success=true`;
        //const success_url = `http://localhost:4200/#/application/add-application?success=true`;

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: req.body.name
                        },
                        unit_amount: req.body.amount // $19.99
                    },
                    quantity: 1
                }
            ],
            mode: 'payment',
            success_url: success_url,
            cancel_url: 'https://admin.rentrack.org/#/application/add-application',
            billing_address_collection: 'auto'
        });

        //res.json({ id: session.id });
        return res.status(200).json({
            id: session.id
        });
    }
};
