// MODELS
const Charge = require("../../models/charges");
const Tenant = require("../../models/tenants");
const Invoice = require("../../models/invoices");
const HandyMan = require("../../models/HandyMen");
const Property = require("../../models/properties");
const ChargeType = require("../../models/chargeTypes");
const PropertyUnit = require("../../models/propertyUnits");
const PropertyOwner = require("../../models/propertyOwners");
const MaintenanceRequest = require("../../models/tenantMaintenanceRequest");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const unique = require("../../utilities/codegenerator_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/activitylog_utility");
const { sendEmail } = require("../../utilities/emailer");
const EmailLog = require("../../models/EmailLog");

// VALIDATIONS
const { tenantMaintenanceRequestValidation } = require("../../validations/tenantMaintenanceRequest");

const moduleName = `MaintenanceRequest`;
// const modulename = `Invoice`;

module.exports = {
    send: async (req, res) => {
        try {
            const body = req.body
            const { propertyId, propertyUnitId, tenantId, gallery, message } = body;

            // console.log("TEST Object:", JSON.stringify(req.body, null, 2));
            // Validate request body
            const { error } = tenantMaintenanceRequestValidation(req.body);

            if (error) {
                return Response.errorResponse(res, 400, error);
            }

            // Ensure propertyId, ownerId and tenantId are valid
            const tenant = await Tenant.findById(body.tenantId);
            const property = await Property.findById(body.propertyId);
            const propertyUnit = await PropertyUnit.findById(body.propertyUnitId);
            const owner = await PropertyOwner.findById(property.propertyOwnerId);

            // console.log("TENANT:", tenant);
            // console.log("OWNER:", owner);
            // console.log("PROPERTY:", property);
            // console.log("PROPERTYUNIT:", propertyUnit);

            if (!owner)
                return Response.customResponse(res, 404, ResponseMessage.NO_OWNER_RECORD);

            if (!tenant)
                return Response.customResponse(res, 404, ResponseMessage.NO_TENANT_RECORD);

            if (!property)
                return Response.customResponse(res, 404, ResponseMessage.NO_PROPERTY_RECORD);

            if (!propertyUnit)
                return Response.customResponse(res, 404, ResponseMessage.NO_PROPERTYUNIT_RECORD);

            const uniqueCode = unique.randomCode();

            // Create notification instance
            const request = new MaintenanceRequest({
                code: "TK" + uniqueCode,
                propertyId: propertyId,
                propertyUnitId: propertyUnitId,
                ownerId: property.propertyOwnerId,
                tenantId: tenantId,
                problemGallery: gallery.map((per) => ({
                    name: per.name,
                })),
                message: message,
                messageStatus: 0,
                senderCode: body.actionBy,
                createdOn: DateUtil.currentDate(),
                // updatedOn: DateUtil.currentDate(),
            });

            // Save message
            await request.save();

            const action = `New ${moduleName}`;
            const person = body.actionBy;
            await createActivityLog(moduleName, action, person);

            var senderName = `${tenant.name}`;
            var receiverName = `${owner.name}`;
            var receiverEmail = `${owner.email}`;
            // const createdDate = new Date(request.createdOn).toLocaleDateString('en-GB', {
            //     year: 'numeric', month: 'long', day: 'numeric'
            // });

            const emailSubject = `Ticket ${request.code} Submission`;
            const emailText = `Dear ${receiverName}, <br><br>

            I hope this message finds you well. I am writing to submit a new support ticket regarding an issue I have encountered within unit ${propertyUnit.name}. 
            Below are the details of the problem:<br><br>
            <strong>Isssue Description:</strong><br><br>
            ${request.message}
            <br><br>

            Best Regards <br>${senderName}<br><br>
            <a href="https://rentrack.org" target="_blank">
            <img src="https://quickbooking.org/quickbooking-logo-wide.png" alt="QuickBooking Logo" style="width: 150px; height: auto;">
            </a><br>
            &copy; ${new Date().getFullYear()} All rights reserved.`;

            try {
                await sendEmail(receiverEmail, emailSubject, emailText, res);
                // return Response.customResponse(res, res.statusCode, ResponseMessage.EMAIL_SUCCESS);
            } catch (error) {
                console.error("Email Error2: ", error);
                return Response.customResponse(res, 500, "Email sending failed");
            }

            return Response.customResponse(res, 201, ResponseMessage.SUCCESS_MESSAGE, request);
        } catch (err) {
            return Response.errorResponse(res, 500, err.message || err);
        }
    },

    assignHandyManAndUpdateStatus: async (req, res) => {
        try {
            const {
                id, actionBy, handyMenAssigned, charges,
                paymentOptionId, paymentPeriodId, invoiceDate, dueDate
            } = req.body;

            const existingTicket = await MaintenanceRequest.findById(id);
            if (!existingTicket) {
                return Response.customResponse(res, 400, ResponseMessage.NO_RECORD);
            }

            let assignedHandymenDetails = [];
            let invoiceSummaryHtml = "";
            let totalAmount = 0;
            let newInvoice = null;

            // Populate handyman details
            if (handyMenAssigned && handyMenAssigned.length > 0) {
                const populatedHandyMen = await Promise.all(
                    handyMenAssigned.map(async (handy) => {
                        const handyManDetails = await HandyMan.findById(handy.id);
                        if (!handyManDetails) {
                            console.error(`HandyMan with ID ${handy.id} not found.`);
                            return null;
                        }

                        const detail = {
                            id: handyManDetails._id,
                            code: handyManDetails.code,
                            name: handyManDetails.name,
                            email: handyManDetails.email,
                            phone: {
                                code: handyManDetails.phone?.code || "",
                                number: handyManDetails.phone?.number || ""
                            },
                            address: handyManDetails.address ? {
                                city: handyManDetails.address.city || "",
                                state: handyManDetails.address.state || "",
                                zipcode: handyManDetails.address.zipcode || ""
                            } : null
                        };

                        assignedHandymenDetails.push(detail);
                        return detail;
                    })
                );

                existingTicket.handyMenAssigned = populatedHandyMen.filter(Boolean);
                if (existingTicket.handyMenAssigned.length > 0) {
                    existingTicket.messageStatus = 1;
                }
            }

            await existingTicket.save();

            const tenant = await Tenant.findById(existingTicket.tenantId);
            const owner = await PropertyOwner.findById(existingTicket.ownerId);

            const senderName = owner?.name || "Rentrack Support";
            const receiverName = tenant?.name || "Tenant";
            const receiverEmail = tenant?.email;
            const receiverPhone = tenant?.phone.code + tenant?.phone.number;
            const receiverAddress = `${tenant?.address.city}, ${tenant?.address.state}, ${tenant?.address.zipcode}`;
            const receiverId = tenant?._id;
            const receiverType = "Tenant";
            const notification = existingTicket._id;

            // Build HTML for handyman list
            const handymanInfoHtml = assignedHandymenDetails.map(hm => `
            <li>
                <strong>${hm.name}</strong><br>
                Email: ${hm.email}<br>
                Phone: ${hm.phone.code}${hm.phone.number}<br>
                ${hm.address?.city ? `Address: ${hm.address.city}, ${hm.address.state}, ${hm.address.zipcode}` : ""}
            </li>
        `).join("<br>");

            // Invoice creation and table summary
            if (charges && charges.length > 0) {
                const chargesWithDetails = await Promise.all(
                    charges.map(async (charge) => {
                        const chargeDetails = await Charge.findById(charge.id);
                        if (!chargeDetails) throw new Error(`Charge with ID ${charge.id} not found.`);

                        const chargeTypeDetails = await ChargeType.findById(chargeDetails.chargeTypeId);
                        if (!chargeTypeDetails) throw new Error(`ChargeType with ID ${chargeDetails.chargeTypeId} not found.`);

                        totalAmount += chargeDetails.amount;

                        invoiceSummaryHtml += `
                        <tr>
                            <td>${chargeDetails.description}</td>
                            <td>$.${chargeDetails.amount}</td>
                            <td>${chargeTypeDetails.accountType}</td>
                        </tr>
                    `;

                        return {
                            id: chargeDetails._id,
                            name: chargeDetails.name,
                            currency: chargeDetails.currency,
                            amount: chargeDetails.amount,
                            accountType: chargeTypeDetails.accountType?.toString().trim() || "Unknown",
                            description: chargeDetails.description
                        };
                    })
                );

                const currency = chargesWithDetails.length > 0 ? chargesWithDetails[0].currency : null;
                const uniqueCode = unique.randomCode();

                newInvoice = new Invoice({
                    tenantId: existingTicket.tenantId,
                    propertyId: existingTicket.propertyId,
                    ownerId: existingTicket.ownerId,
                    propertyUnitId: existingTicket.propertyUnitId,
                    paymentOptionId,
                    paymentPeriodId,
                    charges: chargesWithDetails,
                    invoiceNumber: `I-${uniqueCode}`,
                    currency,
                    totalAmount,
                    isActive: true,
                    isPaid: false,
                    isVoid: false,
                    isBatch: false,
                    invoiceDate,
                    dueDate,
                    ownerCode: actionBy,
                });

                await newInvoice.save();

                if (actionBy) {
                    const action2 = `New Invoice - ${newInvoice.invoiceNumber}`;
                    await createActivityLog("Invoice Created for Handyman", action2, actionBy);
                }
            }

            // Email to Tenant
            const tenantEmailSubject = `Ticket ${existingTicket.code} Update`;
            const tenantEmailText = `
            Dear ${receiverName},<br><br>
            Your maintenance ticket <strong>${existingTicket.code}</strong> has been assigned to the following handyman(s):<br><br>
            <ul>${handymanInfoHtml}</ul><br>
            <strong>Issue Description:</strong><br>
            ${existingTicket.message}<br><br> 
            Best Regards,<br>${senderName}<br><br>
            <a href="https://rentrack.org" target="_blank"><img src="https://quickbooking.org/quickbooking-logo-wide.png" alt="QuickBooking Logo" style="width: 150px; height: auto;"></a><br>
            &copy; ${new Date().getFullYear()} All rights reserved.
        `;

            if (receiverEmail) {
                try {
                    await sendEmail(receiverEmail, tenantEmailSubject, tenantEmailText);
                } catch (err) {
                    console.error("Tenant Email Error:", err.message);
                    await EmailLog.create({
                        receiverId,
                        receiverType,
                        error: err.message,
                        notificationId: notification,
                        timestamp: new Date(),
                    });
                }
            }

            // Email to each Handyman
            for (const handyman of assignedHandymenDetails) {
                const handymanEmailSubject = `Assignment: Ticket ${existingTicket.code}`;
                const handymanEmailText = `
                Dear ${handyman.name},<br><br>
                You have been assigned to a maintenance request <strong>${existingTicket.code}</strong> for tenant: <br><br>
                Name:<strong> ${receiverName}</strong><br><br>
                Email: ${receiverEmail}<br><br>
                Phone: ${receiverPhone}<br><br>
                Address: ${receiverAddress}<br><br>
                <strong>Issue:</strong><br>${existingTicket.message}<br><br>
                ${invoiceSummaryHtml ? `<strong>Invoice Summary:</strong><br><table border="1" cellpadding="5" cellspacing="0"><tr>
                    <th>Description</th><th>Amount</th><th>Type</th></tr>${invoiceSummaryHtml}</table><br><strong>Total:</strong> $.${totalAmount}<br><br>` : ""}
                Please log into the Rentrack portal to begin work.<br><br>
                Best Regards,<br>${senderName}<br><br>
                <a href="https://rentrack.org" target="_blank"><img src="https://quickbooking.org/quickbooking-logo-wide.png" alt="QuickBooking Logo" style="width: 150px; height: auto;">
                </a><br>
                &copy; ${new Date().getFullYear()} All rights reserved.
            `;

                try {
                    await sendEmail(handyman.email, handymanEmailSubject, handymanEmailText);
                } catch (err) {
                    console.error("Handyman Email Error:", err.message);
                    await EmailLog.create({
                        receiverId: handyman.id,
                        receiverType: "HandyMan",
                        error: err.message,
                        notificationId: notification,
                        timestamp: new Date(),
                    });
                }
            }

            return Response.customResponse(res, 200, ResponseMessage.SUCCESS_MESSAGE, existingTicket);
        } catch (err) {
            console.error("Error assigning handyman or sending emails:", err);
            return Response.errorResponse(res, 500, err.message || err);
        }
    },
  
    closeTicketUpdateStatus: async (req, res) => {
        try {
            const { id, actionBy } = req.body;

            const existingTicket = await MaintenanceRequest.findById(id)
                .populate("tenant owner"); // Populate tenant and owner for email

            if (!existingTicket) {
                return Response.customResponse(res, 400, ResponseMessage.NO_RECORD);
            }

            if (existingTicket.messageStatus === 2) {
                return Response.customResponse(res, 400, "Ticket Already Closed");
            }

            existingTicket.messageStatus = 2;
            await existingTicket.save();

            const action = `${moduleName} - ${existingTicket.code}`;
            await createActivityLog("Ticket Closed", action, actionBy);

            // Email content setup
            const tenant = existingTicket.tenant;
            const owner = existingTicket.owner;

            const subject = `Ticket ${existingTicket.code} Closed`;
            const ticketMessage = `
            The maintenance issue reported as <strong>${existingTicket.message}</strong> has been resolved and the ticket has been marked as <strong>Closed</strong>.
        `;

            const emailFooter = `
            <br><br>
            Best Regards,<br>
            Rentrack Team<br><br>
            <a href="https://rentrack.org" target="_blank">
                <img src="https://quickbooking.org/quickbooking-logo-wide.png" alt="QuickBooking Logo" style="width: 150px; height: auto;">
            </a><br>
            &copy; ${new Date().getFullYear()} All rights reserved.
        `;

            // Send to Tenant
            if (tenant?.email) {
                const tenantEmailText = `
                Dear ${tenant.name || "Tenant"},<br><br>
                ${ticketMessage}
                <br><br>Ticket Code: <strong>${existingTicket.code}</strong>${emailFooter}
            `;
                try {
                    await sendEmail(tenant.email, subject, tenantEmailText);
                } catch (err) {
                    console.error("Tenant email failed:", err.message);
                    await EmailLog.create({
                        receiverId: tenant._id,
                        receiverType: "Tenant",
                        error: err.message,
                        notificationId: existingTicket._id,
                        timestamp: new Date(),
                    });
                }
            }

            // Send to Owner
            if (owner?.email) {
                const ownerEmailText = `
                Dear ${owner.name || "Property Owner"},<br><br>
                The handyman has resolved the issue for ticket <strong>${existingTicket.code}</strong>:
                <br><br><strong>Description:</strong> ${existingTicket.message}
                <br><br>This ticket has now been closed.${emailFooter}
            `;
                try {
                    await sendEmail(owner.email, subject, ownerEmailText);
                } catch (err) {
                    console.error("Owner email failed:", err.message);
                    await EmailLog.create({
                        receiverId: owner._id,
                        receiverType: "PropertyOwner",
                        error: err.message,
                        notificationId: existingTicket._id,
                        timestamp: new Date(),
                    });
                }
            }

            return Response.customResponse(res, res.statusCode, ResponseMessage.SUCCESS_MESSAGE);
        } catch (err) {
            console.error("Ticket close error:", err);
            return Response.errorResponse(res, 500, err.message || err);
        }
    },

    getMaintenanceRequests: async (req, res) => {
        console.log('hhh');
        try {

            // Define status labels
            const statusLabels = {
                0: "Open Ticket",
                1: "Ticket Assigned",
                2: "Closed Ticket"
            };

            // Count total Requests for pagination
            const totalRequests = await MaintenanceRequest.countDocuments();

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
            const propertyUnits = await MaintenanceRequest.find()
                .populate([
                    { path: "property", select: "code description image status" },
                    { path: "unit", select: "id code name" },
                    { path: "owner", select: "code name email avatar phone address" },
                    { path: "tenant", select: "code name email avatar phone address" },
                ])
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            // Map the results with property, category, and propertyStatus details
            pagination.data = propertyUnits.map((item) => ({
                ...item.toJSON(),
                statusLabel: statusLabels[item.messageStatus] || "Unknown",
                property: item.property ? item.property : null,
                tenant: item.tenant ? item.tenant : null,
                owner: item.owner ? item.owner : null,
            }));

            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            return Response.errorResponse(res, 500, err.message || err);
        }
    },

    getMaintenanceRequestsByOwner: async (req, res) => {
        try {
            // Fetch the tenant by code
            const owner = await PropertyOwner.findOne({ code: req.params.code });
            // console.log("OWNER:", owner);

            if (!owner) {
                return Response.customResponse(res, 404, ResponseMessage.NO_OWNER_RECORD);
            }

            // Use the owner ID for filtering
            const ownerId = owner._id;

            // Define status labels
            const statusLabels = {
                0: "Open Ticket",
                1: "Ticket Assigned",
                2: "Closed Ticket"
            };

            // Count total Requests for pagination
            const totalRequests = await MaintenanceRequest.countDocuments({ ownerId: ownerId });

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
            const propertyUnits = await MaintenanceRequest.find({ ownerId: ownerId })
                .populate([
                    { path: "property", select: "code description image status" },
                    { path: "unit", select: "id code name" },
                    { path: "owner", select: "code name email avatar phone address" },
                    { path: "tenant", select: "code name email avatar phone address" },
                ])
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            // Map the results with property, category, and propertyStatus details
            pagination.data = propertyUnits.map((item) => ({
                ...item.toJSON(),
                statusLabel: statusLabels[item.messageStatus] || "Unknown",
                property: item.property ? item.property : null,
                tenant: item.tenant ? item.tenant : null,
                owner: item.owner ? item.owner : null,
            }));

            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            return Response.errorResponse(res, 500, err.message || err);
        }
    },

    getMaintenanceRequestsByTenant: async (req, res) => {
        try {
            // Fetch the tenant by code
            const tenant = await Tenant.findOne({ code: req.params.code });
            // console.log("TENANT:", tenant);

            if (!tenant) {
                return Response.customResponse(res, 404, ResponseMessage.NO_TENANT_RECORD);
            }

            // Use the tenant ID for filtering
            const tenantId = tenant._id;

            // Define status labels
            const statusLabels = {
                0: "Open Ticket",
                1: "Ticket Assigned",
                2: "Closed Ticket"
            };
            // Count total Requests for pagination
            const totalRequests = await MaintenanceRequest.countDocuments({ tenantId: tenantId });

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
            const requests = await MaintenanceRequest.find({ tenantId: tenantId })
                .populate([
                    { path: "property", select: "code description image status" },
                    { path: "unit", select: "id code name" },
                    { path: "owner", select: "code name email avatar phone address" },
                    { path: "tenant", select: "code name email avatar phone address" },
                ])
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            // Map the results with property, tenant, and owner details
            pagination.data = requests.map((item) => ({
                ...item.toJSON(),
                statusLabel: statusLabels[item.messageStatus] || "Unknown",
                property: item.property ? item.property : null,
                tenant: item.tenant ? item.tenant : null,
                owner: item.owner ? item.owner : null,

            }));

            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            return Response.errorResponse(res, 500, err.message || err);
        }
    },

    getMaintenanceRequestsByHandyman: async (req, res) => {
        try {
            // Find the handyman by code
            const handyman = await HandyMan.findOne({ code: req.params.code });

            if (!handyman) {
                return Response.customResponse(res, 404, "Handyman not found");
            }

            const handymanId = handyman._id;

            const statusLabels = {
                0: "Open Ticket",
                1: "Ticket Assigned",
                2: "Closed Ticket"
            };

            // Count total requests where this handyman is assigned
            const totalRequests = await MaintenanceRequest.countDocuments({
                "handyMenAssigned.id": handymanId
            });

            if (totalRequests === 0) {
                return Response.customResponse(res, res.statusCode, ResponseMessage.NO_DATA);
            }

            const { pagination, skip } = await PaginationUtility.paginationParams(req, totalRequests);

            if (pagination.page > pagination.pages) {
                return Response.customResponse(res, res.statusCode, ResponseMessage.OUTOF_DATA);
            }

            // Find all tickets where the handyman is assigned
            const tickets = await MaintenanceRequest.find({
                "handyMenAssigned.id": handymanId
            })
                .populate([
                    { path: "property", select: "code description image status" },
                    { path: "unit", select: "id code name" },
                    { path: "owner", select: "code name email avatar phone address" },
                    { path: "tenant", select: "code name email avatar phone address" },
                ])
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            pagination.data = tickets.map((item) => ({
                ...item.toJSON(),
                statusLabel: statusLabels[item.messageStatus] || "Unknown",
                property: item.property || null,
                tenant: item.tenant || null,
                owner: item.owner || null,
            }));

            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            return Response.errorResponse(res, 500, err.message || err);
        }
    },

    getByMaintenanceStatus: async (req, res) => {
        try {
            let { messageStatus } = req.params;
            // console.log("Received query parameters:", req.params);

            // Define status labels
            const statusLabels = {
                0: "Open Ticket",
                1: "Ticket Assigned",
                2: "Closed Ticket"
            };

            // Validate and parse messageStatus
            if (messageStatus !== undefined) {
                messageStatus = parseInt(messageStatus);
                if (isNaN(messageStatus)) {
                    return Response.customResponse(res, 400, "Invalid messageStatus value.");
                }
            }

            // Define query object (If messageStatus is not provided, fetch all)
            const query = messageStatus !== undefined ? { messageStatus } : {};

            const totalRequests = await MaintenanceRequest.countDocuments(query);
            const { pagination, skip } = await PaginationUtility.paginationParams(req, totalRequests);

            if (totalRequests === 0) {
                return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
            }

            if (pagination.page > pagination.pages) {
                return Response.customResponse(res, 200, ResponseMessage.OUTOF_DATA);
            }

            // Fetch requests with the correct filtering
            const requests = await MaintenanceRequest.find(query)
                .sort({ updatedOn: -1 })
                .skip(skip)
                .limit(pagination.pageSize)
                .populate([
                    { path: "property", select: "code description image status" },
                    { path: "unit", select: "id code name" },
                    { path: "owner", select: "code name email avatar phone address" },
                    { path: "tenant", select: "code name email avatar phone address" },
                ]);

            // Map the results with property, tenant, and owner details
            pagination.data = requests.map((item) => ({
                ...item.toJSON(),
                statusLabel: statusLabels[item.messageStatus] || "Unknown",
                property: item.property || null,
                tenant: item.tenant || null,
                owner: item.owner || null,
            }));

            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            return Response.customResponse(res, 500, err);
        }
    },

    deleteMaintenance: async (req, res) => {
        try {
            const { requestId, tenantId } = req.params;

            const message = await MaintenanceRequest.findOne({ _id: requestId, tenantId: tenantId });
            // console.log("message:", message);

            if (!message) {
                return Response.customResponse(res, 404, ResponseMessage.FAIL_MESSAGE);
            }

            const deletedMessage = await MaintenanceRequest.findByIdAndDelete(requestId);

            if (!deletedMessage) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            // Fetch the tenant by code
            const tenant = await Tenant.findById(tenantId);
            // console.log("TENANT:", tenant.code);

            if (!tenant) {
                return Response.customResponse(res, 404, ResponseMessage.NO_TENANT_RECORD);
            }

            const action = `Delete ${moduleName} - ${requestId}`;
            const person = tenant.code;
            await createActivityLog(moduleName, action, person);

            return Response.successResponse(
                res,
                res.statusCode,
                ResponseMessage.SUCCESS_MESSAGE
            );
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    }

};
