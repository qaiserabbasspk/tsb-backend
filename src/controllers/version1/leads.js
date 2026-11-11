const Lead = require("../../models/leads");
const EmailLog = require("../../models/EmailLog");
const { leadsValidation } = require("../../validations/leads");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const { status } = require("../../utilities/status_change_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/activitylog_utility");
const { sendEmail } = require("../../utilities/quickbookingEmailer_utility");
const { upsertGuestLead } = require("../../utilities/guestLead_utility");

const moduleName = `Lead`;

module.exports = {
    create: async (req, res) => {
        try {
            const body = req.body;

            const { error } = leadsValidation(body);

            if (error) {
                return Response.errorResponse(res, 400, error);
            }
            const phone = { ...body.phone };

            const lead = Lead({
                name: body.name,
                email: body.email,
                phone,
                isActive: true,
                createdOn: DateUtil.currentDate(),
            });

            const newLead = await lead.save();

            upsertGuestLead({
                name: body.name,
                email: body.email,
                phone,
                source: "lead_modal",
                refId: newLead._id,
            }).catch((err) => console.error("[GuestLead] Unexpected error:", err));

            const senderName = body.name;
            const senderEmail = body.email;
            const senderPhone = phone;

            const emailSubject = `New Lead - QuickBooking`;
            const emailText = `
                    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                        <p>Hello,</p>
            
                        <p>You have received a lead  <strong>${senderName} : ${senderEmail}</strong>.</p><br>
                        <p>Name: <strong>${senderName}</p><br>
                        <p>Email: <strong>${senderEmail}</p><br>
                        <p>Phone: <strong>${senderPhone.code} ${senderPhone.number}</p><br>
            
                        <h3 style="color: #444; margin-top: 25px;">💬 Client's Message</h3>
                        <blockquote style="background-color: #f9f9f9; border-left: 4px solid #ccc; padding: 10px 15px; margin: 20px 0;">
                            ${body.message || "No additional comments were provided."}
                        </blockquote>
            
                        <p>looking forward to hearing from you.</p>
            
                        <br>
                        <p style="font-weight: bold;">Best Regards,<br>${senderName}</p>
            
                        <br>
                        <div style="border-top: 1px solid #ddd; padding-top: 15px;">
                           <a href="https://quickbooking.org" target="_blank">
                        <img src="https://quickbooking.org/quickbooking-logo.png" alt="QuickBooking Logo" style="width: 150px; height: auto; margin-top: 20px;">
                        </a>
                            <span style="font-size: 12px; color: #999;">&copy; ${new Date().getFullYear()} QuickBooking. All rights reserved.</span>
                        </div>
                    </div>
                  `;

            const emailResponse = await sendEmail("info@quickbooking.org", emailSubject, emailText, res);

            if (emailResponse.status === 'error') {
                await EmailLog.create({
                    to: 'info@quickbooking.org',
                    subject: emailSubject,
                    message: emailText,
                    status: "failed",
                    error: emailResponse.message,
                    createdOn: DateUtil.currentDate()
                });
                return Response.customResponse(res, 500, emailResponse.message);
            }

            const action = `New ${moduleName} - ${newLead.title}`;
            const person = body.actionBy;
            await createActivityLog(moduleName, action, person);

            // Welcome email to the guest — non-blocking, does not affect the API response
            const welcomeSubject = `Welcome to QuickBooking, ${senderName}`;
            const welcomeText = `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto;">
                    <p>Hi ${senderName},</p>

                    <p>Thanks for your interest in QuickBooking — Nigeria's platform for hotels, short lets, apartments, and event spaces.</p>

                    <p>Your next stay is a click away. Browse available properties and book directly:</p>

                    <div style="text-align: center; margin: 30px 0;">
                        <a href="https://quickbooking.org/hotels/list"
                           style="background-color: #198754; color: #fff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 16px;">
                            Browse Properties
                        </a>
                    </div>

                    <p style="color: #666; font-size: 14px;">
                        If you have any questions, reach us at
                        <a href="mailto:info@quickbooking.org" style="color: #198754;">info@quickbooking.org</a>.
                    </p>

                    <br>
                    <div style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 10px;">
                        <a href="https://quickbooking.org" target="_blank">
                            <img src="https://quickbooking.org/quickbooking-logo.png" alt="QuickBooking" style="width: 130px; height: auto;">
                        </a><br>
                        <span style="font-size: 12px; color: #999;">&copy; ${new Date().getFullYear()} QuickBooking. All rights reserved.</span>
                    </div>
                </div>
            `;
            sendEmail(senderEmail, welcomeSubject, welcomeText, res).catch(() => {});

            return Response.successResponse(res, res.statusCode, newLead);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    getAll: async (req, res) => {
        try {
            const totalLeads = await Lead.countDocuments();
            const { pagination, skip } = await PaginationUtility.paginationParams(
                req,
                totalLeads
            );

            if (pagination.page > pagination.pages) {
                return res.status(200).json({
                    message: `Page number ${pagination.page} is greater than the total number of pages that is ${pagination.pages}`,
                });
            }

            pagination.data = await Lead.find()
                .select()
                .sort({ _id: -1 })
                .skip(skip)
                .limit(pagination.pageSize);

            pagination.data = pagination.data.map((pagination) => {
                pagination.id = pagination._id.toHexString();
                return pagination;
            });

            if (pagination.length === 0) {
                return Response.customResponse(
                    res,
                    res.statusCode,
                    ResponseMessage.NO_DATA
                );
            }

            return Response.paginationResponse(res, res.statusCode, pagination);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    update: async (req, res) => {
        try {
            const lead = await Lead.findById(req.body.id);

            if (!lead) {
                return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
            }

            lead.name = req.body.name || lead.name;
            lead.email = req.body.email || lead.email;
            lead.isActive = req.body.isActive;
            lead.phone = req.body.phone || lead.phone;

            const updatedLead = await lead.save();

            // const action = `Update ${moduleName}`;
            // const person = req.body.actionBy;
            // await createActivityLog(feature, action, person);

            return Response.successResponse(res, res.statusCode, updatedLead);
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },

    delete: async (req, res) => {
        try {
            const lead = await Lead.findById(req.params.id);

            if (!lead) {
                return Response.customResponse(res, 404, ResponseMessage.NO_DATA);
            }

            await lead.deleteOne();

            const action = `Deleted ${moduleName} - ${lead.name}`;
            const person = req.param.actionBy;
            await createActivityLog(moduleName, action, person);

            return Response.customResponse(
                res,
                res.statusCode,
                ResponseMessage.SUCCESS_MESSAGE
            );
        } catch (err) {
            return Response.errorResponse(res, 500, err);
        }
    },
}