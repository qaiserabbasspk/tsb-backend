// MODELS
const Tenant = require("../../models/tenants");
const Notification = require("../../models/notifications");
const PropertyOwner = require("../../models/propertyOwners");
const EmailLog = require("../../models/EmailLog");

// VALIDATIONS
const { notificationValidation } = require("../../validations/notifications");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/activitylog_utility");
const { sendEmail } = require("../../utilities/emailer");
const { sendEmailer } = require("../../utilities/emailerNotification");

const moduleName = `Notification`;

module.exports = { 
    send: async (req, res) => {
        try {
            const { senderId, senderType, recipients, message, attachment } = req.body;
    
            // Validate request body
            const { error } = notificationValidation(req.body);
            if (error) return Response.errorResponse(res, 400, error);
    
            if (!["PropertyOwner", "Tenant"].includes(senderType)) {
                return Response.errorResponse(res, 400, "Invalid sender type");
            }
    
            const invalidRecipients = recipients.filter(
                (r) => !["PropertyOwner", "Tenant"].includes(r.receiverType)
            );
            if (invalidRecipients.length > 0) {
                return Response.errorResponse(res, 400, "Invalid receiver type(s)");
            }
    
            // Create and save notification
            const notification = new Notification({
                senderId,
                senderType,
                recipients: recipients.map(r => ({
                    receiverId: r.receiverId,
                    receiverType: r.receiverType,
                })),
                message,
                attachment,
                createdOn: DateUtil.currentDate(),
            });
    
            await notification.save();
            console.log("Notification saved with ID:", notification._id);
    
            const emailSubject = `New Rentrack Notification`;
    
            for (const recipient of recipients) {
                const { receiverId, receiverType } = recipient;
                try {
                    let receiver;
                    if (receiverType === "Tenant") {
                        receiver = await Tenant.findById(receiverId);
                    } else if (receiverType === "PropertyOwner") {
                        receiver = await PropertyOwner.findById(receiverId);
                    }
    
                    if (!receiver) {
                        throw new Error(`No ${receiverType} found with ID ${receiverId}`);
                    }
    
                    const emailText = `
                        Dear ${receiver.name},<br><br>
                        You have received a new message in your Rentrack portal:<br><br>
                        <strong>${message}</strong><br><br>
                        Best Regards,<br>Rentrack Support<br><br>
                        <a href="https://rentrack.org" target="_blank">
                            <img src="https://quickbooking.org/quickbooking-logo-wide.png" alt="QuickBooking Logo" style="width: 150px; height: auto;">
                        </a><br>
                        &copy; ${new Date().getFullYear()} All rights reserved.
                    `;
    
                    console.log(`Sending email to ${receiver.email} (${receiverType})`);
                    const result = await sendEmail(receiver.email, emailSubject, emailText);
    
                    if (result.status !== "success") {
                        throw new Error(result.message || "Unknown email failure");
                    }
    
                    console.log(`Email sent successfully to ${receiver.email}`);
                } catch (err) {
                    console.error(`Failed to send email to ${receiverId}:`, err.message);
                    await EmailLog.create({
                        receiverId,
                        receiverType,
                        error: err.message,
                        notificationId: notification._id,
                        timestamp: new Date(),
                    });
                }
            }
    
            return Response.customResponse(
                res,
                201,
                ResponseMessage.SUCCESS_MESSAGE,
                notification
            );
        } catch (err) {
            console.error("Notification send error:", err);
            return Response.errorResponse(res, 500, err.message || err);
        }
    },

    getChatBetweenOwnerAndTenant: async (req, res) => {
        try {
            const { ownerId, tenantId } = req.params;

            const totalChat = await Notification.countDocuments({
                $or: [
                    { senderId: ownerId, "recipients.receiverId": tenantId },
                    { senderId: tenantId, "recipients.receiverId": ownerId },
                ],
            });

            const { pagination, skip } = await PaginationUtility.paginationParams(req, totalChat);

            if (totalChat === 0) {
                return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
            }

            if (pagination.page > pagination.pages) {
                return Response.customResponse(res, 200, ResponseMessage.OUTOF_DATA);
            }

            const chats = await Notification.find({
                $or: [
                    { senderId: ownerId, "recipients.receiverId": tenantId },
                    { senderId: tenantId, "recipients.receiverId": ownerId },
                ],
            })
                .sort({ updatedOn: -1 })
                .skip(skip)
                .limit(pagination.pageSize)
                .populate({
                    path: "sender",
                    select: "id code name email avatar status senderType",
                    model: function (doc) {
                        return doc.senderType === "Tenant" ? "Tenant" : "PropertyOwner";
                    },
                });

            // Manually populate `receiverDetails`
            const formattedChats = await Promise.all(
                chats.map(async (chat) => {
                    const receiverDetails = await Promise.all(
                        chat.recipients.map(async (recipient) => {
                            const Model = recipient.receiverType === "Tenant" ? Tenant : PropertyOwner;
                            const receiver = await Model.findById(recipient.receiverId)
                                .select("id code name email avatar status");

                            return receiver
                                ? {
                                    id: receiver._id,
                                    code: receiver.code,
                                    name: receiver.name,
                                    email: receiver.email,
                                    avatar: receiver.avatar,
                                    status: receiver.status,
                                    receiverType: recipient.receiverType, // ✅ Ensure receiverType is included
                                }
                                : null;
                        })
                    );

                    return {
                        id: chat._id,
                        message: chat.message,
                        attachment: chat.attachment,
                        status: chat.status,
                        sender: chat.sender
                            ? {
                                id: chat.sender._id,
                                code: chat.sender.code,
                                name: chat.sender.name,
                                email: chat.sender.email,
                                avatar: chat.sender.avatar,
                                status: chat.sender.status,
                                senderType: chat.senderType,
                            }
                            : null,
                        receiverDetails,
                    };
                })
            );

            pagination.data = formattedChats;
            return Response.paginationResponse(res, res.statusCode, pagination);

        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    getUnReadMessagesBetweenOwnerAndTenant: async (req, res) => {
        try {
            const { ownerId, tenantId } = req.params;

            const totalChat = await Notification.countDocuments({
                $or: [
                    { senderId: ownerId, "recipients.receiverId": tenantId, status: 0 },
                    { senderId: tenantId, "recipients.receiverId": ownerId, status: 0 },
                ],
            });

            const { pagination, skip } = await PaginationUtility.paginationParams(req, totalChat);

            if (totalChat === 0) {
                return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
            }

            if (pagination.page > pagination.pages) {
                return Response.customResponse(res, 200, ResponseMessage.OUTOF_DATA);
            }

            const chats = await Notification.find({
                $or: [
                    { senderId: ownerId, "recipients.receiverId": tenantId, status: 0 },
                    { senderId: tenantId, "recipients.receiverId": ownerId, status: 0 },
                ],
            })
                .sort({ updatedOn: -1 })
                .skip(skip)
                .limit(pagination.pageSize)
                .populate({
                    path: "sender",
                    select: "id code name email avatar status senderType",
                    model: function (doc) {
                        return doc.senderType === "Tenant" ? "Tenant" : "PropertyOwner";
                    },
                });

            // Manually populate `receiverDetails`
            const formattedChats = await Promise.all(
                chats.map(async (chat) => {
                    const receiverDetails = await Promise.all(
                        chat.recipients.map(async (recipient) => {
                            const Model = recipient.receiverType === "Tenant" ? Tenant : PropertyOwner;
                            const receiver = await Model.findById(recipient.receiverId)
                                .select("id code name email avatar status");

                            return receiver
                                ? {
                                    id: receiver._id,
                                    code: receiver.code,
                                    name: receiver.name,
                                    email: receiver.email,
                                    avatar: receiver.avatar,
                                    status: receiver.status,
                                    receiverType: recipient.receiverType, // ✅ Included receiverType
                                }
                                : null;
                        })
                    );

                    return {
                        id: chat._id,
                        message: chat.message,
                        attachment: chat.attachment,
                        status: chat.status,
                        sender: chat.sender
                            ? {
                                id: chat.sender._id,
                                code: chat.sender.code,
                                name: chat.sender.name,
                                email: chat.sender.email,
                                avatar: chat.sender.avatar,
                                status: chat.sender.status,
                                senderType: chat.senderType,
                            }
                            : null,
                        receiverDetails,
                    };
                })
            );

            pagination.data = formattedChats;
            return Response.paginationResponse(res, res.statusCode, pagination);

        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    deleteChatMessage: async (req, res) => {
        try {
            const { messageId, senderId } = req.params;

            const message = await Notification.findOne({ _id: messageId, senderId: senderId });

            if (!message) {
                return Response.customResponse(res, 404, ResponseMessage.FAIL_MESSAGE);
            }

            const deletedMessage = await Notification.findByIdAndDelete(messageId);

            if (!deletedMessage) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            const action = `Delete ${moduleName} - ${messageId}`;
            const person = senderId;
            await createActivityLog(moduleName, action, person);

            return Response.successResponse(
                res,
                res.statusCode,
                ResponseMessage.SUCCESS_MESSAGE
            );
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    updateStatusToRead: async (req, res) => {
        try {
            const { messageId } = req.params;
            const chat = await Notification.findByIdAndUpdate(messageId, { status: 1 });

            if (!chat) {
                return Response.customResponse(res, 400, ResponseMessage.NO_RECORD);
            }

            return Response.successResponse(
                res,
                res.statusCode,
                ResponseMessage.SUCCESS_MESSAGE
            );
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    // either senderId or status canbe optional
    // getByStatusAndSender: async (req, res) => {
    //     try {
    //         const { senderId, status } = req.query;

    //         const query = {};

    //         if (senderId) {
    //             query["senderId"] = senderId; // Ensure correct filtering by sender
    //         }

    //         if (status !== undefined && status !== "") {
    //             const parsedStatus = parseInt(status);
    //             if (!isNaN(parsedStatus)) {
    //                 query["status"] = parsedStatus; // Ensure correct filtering by status
    //             }
    //         }

    //         const totalChat = await Notification.countDocuments(query);

    //         const { pagination, skip } = await PaginationUtility.paginationParams(req, totalChat);

    //         if (totalChat === 0) {
    //             return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
    //         }

    //         if (pagination.page > pagination.pages) {
    //             return Response.customResponse(res, 200, ResponseMessage.OUTOF_DATA);
    //         }

    //         const chats = await Notification.find(query)
    //             .sort({ updatedOn: -1 })
    //             .skip(skip)
    //             .limit(pagination.pageSize)
    //             .populate({
    //                 path: "sender",
    //                 select: "id code name email avatar status senderType",
    //                 model: function (doc) {
    //                     return doc.senderType === "Tenant" ? "Tenant" : "PropertyOwner";
    //                 },
    //             });

    //         // Manually populate `receiverDetails`
    //         const formattedChats = await Promise.all(
    //             chats.map(async (chat) => {
    //                 const receiverDetails = await Promise.all(
    //                     chat.recipients.map(async (recipient) => {
    //                         const Model = recipient.receiverType === "Tenant" ? Tenant : PropertyOwner;
    //                         const receiver = await Model.findById(recipient.receiverId)
    //                             .select("id code name email avatar status");

    //                         return receiver
    //                             ? {
    //                                 id: receiver._id,
    //                                 code: receiver.code,
    //                                 name: receiver.name,
    //                                 email: receiver.email,
    //                                 avatar: receiver.avatar,
    //                                 status: receiver.status,
    //                                 receiverType: recipient.receiverType,
    //                             }
    //                             : null;
    //                     })
    //                 );

    //                 return {
    //                     id: chat._id,
    //                     message: chat.message,
    //                     attachment: chat.attachment,
    //                     status: chat.status,
    //                     sender: chat.sender
    //                         ? {
    //                             id: chat.sender._id,
    //                             code: chat.sender.code,
    //                             name: chat.sender.name,
    //                             email: chat.sender.email,
    //                             avatar: chat.sender.avatar,
    //                             status: chat.sender.status,
    //                             senderType: chat.senderType,
    //                         }
    //                         : null,
    //                     receiverDetails,
    //                 };
    //             })
    //         );

    //         pagination.data = formattedChats;
    //         return Response.paginationResponse(res, res.statusCode, pagination);
    //     } catch (err) {
    //         return Response.errorResponse(res, 500, err);
    //     }
    // }

    // senderId and status are mandatory and status defaults to 0 if not passed
    getByStatusAndSender: async (req, res) => {
        try {
            const { senderId } = req.query;
            let { status } = req.query;

            // console.log("Received query parameters:", req.query);

            // Ensure senderId is provided
            if (!senderId) {
                return Response.customResponse(res, 400, "senderId is required.");
            }

            // Default status to 0 if not provided
            status = status !== undefined ? parseInt(status) : 0;

            if (isNaN(status)) {
                return Response.customResponse(res, 400, "Invalid status value.");
            }

            // Define query object
            const query = { senderId, status };

            // console.log("MongoDB Query:", query); // Debugging - Check the actual query

            const totalChat = await Notification.countDocuments(query);

            const { pagination, skip } = await PaginationUtility.paginationParams(req, totalChat);

            if (totalChat === 0) {
                return Response.customResponse(res, 200, ResponseMessage.NO_DATA);
            }

            if (pagination.page > pagination.pages) {
                return Response.customResponse(res, 200, ResponseMessage.OUTOF_DATA);
            }

            // Fetch chats with the correct filtering
            const chats = await Notification.find(query)
                .sort({ updatedOn: -1 })
                .skip(skip)
                .limit(pagination.pageSize)
                .populate({
                    path: "sender",
                    select: "id code name email avatar status senderType",
                    model: function (doc) {
                        return doc.senderType === "Tenant" ? "Tenant" : "PropertyOwner";
                    },
                });

            // console.log("Fetched data before formatting:", chats); // Debugging - Check raw data

            // Manually populate `receiverDetails`
            const formattedChats = await Promise.all(
                chats.map(async (chat) => {
                    const receiverDetails = await Promise.all(
                        chat.recipients.map(async (recipient) => {
                            const Model = recipient.receiverType === "Tenant" ? Tenant : PropertyOwner;
                            const receiver = await Model.findById(recipient.receiverId)
                                .select("id code name email avatar status");

                            return receiver
                                ? {
                                    id: receiver._id,
                                    code: receiver.code,
                                    name: receiver.name,
                                    email: receiver.email,
                                    avatar: receiver.avatar,
                                    status: receiver.status,
                                    receiverType: recipient.receiverType,
                                }
                                : null;
                        })
                    );

                    return {
                        id: chat._id,
                        message: chat.message,
                        attachment: chat.attachment,
                        status: chat.status,
                        sender: chat.sender
                            ? {
                                id: chat.sender._id,
                                code: chat.sender.code,
                                name: chat.sender.name,
                                email: chat.sender.email,
                                avatar: chat.sender.avatar,
                                status: chat.sender.status,
                                senderType: chat.senderType,
                            }
                            : null,
                        receiverDetails,
                    };
                })
            );

            pagination.data = formattedChats;
            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            // console.error("Error in getByStatusAndSender:", err); // Debugging - Check error
            return Response.customResponse(res, 500, err);
        }
    }

};
