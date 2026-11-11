// MODELS
const SystemUser = require("../../models/systemUsers");
const TourSchedule = require("../../models/tourSchedule");
const Property = require("../../models/properties");
const PropertyUnit = require("../../models/propertyUnits");
const PropertyOwner = require("../../models/propertyOwners");

// VALIDATIONS
const { appointmentValidation } = require("../../validations/tourschedule");

// UTILITIES
const DateUtil = require("../../utilities/date_utility");
const Response = require("../../utilities/response_utility");
const ResponseMessage = require("../../utilities/messages_utility");
const PaginationUtility = require("../../utilities/pagination_utility");
const { createActivityLog } = require("../../utilities/activitylog_utility");
const { sendEmail } = require("../../utilities/emailer");
const EmailLog = require("../../models/EmailLog");

const moduleName = `TourSchedule`;

module.exports = {
  create: async (req, res) => {
    try {
      const body = req.body;

      const { error } = appointmentValidation(body);

      if (error) {
        return Response.sendValidationErrorMessage(res, 400, error);
      }

      const propertyUnit = await PropertyUnit.findById(body.propertyUnitId);

      if (!propertyUnit) {
        return Response.customResponse(res, 404, ResponseMessage.NO_PROPERTYUNIT_RECORD);
      }

      const property = await Property.findById(propertyUnit.propertyId);

      if (!property) {
        return Response.customResponse(res, 404, ResponseMessage.NO_PROPERTY_RECORD);
      }

      const owner = await PropertyOwner.findById(property.propertyOwnerId);

      const newAppointment = new TourSchedule({
        propertyUnitId: propertyUnit._id,
        ownerId: owner._id,
        fullName: body.fullName,
        email: body.email,
        phone: body.phone,
        appointmentDate: body.appointmentDate,
        appointmentTime: body.appointmentTime,
        comments: body.comments,
        appointmentStatus: 0,
        createdAt: DateUtil.currentDate(),
      });

      const appointment = await newAppointment.save();

      const action = `New ${moduleName} For - ${property.code}`;
      const person = body.customerId;
      await createActivityLog(moduleName, action, person);

      // Step 7: Send email to owner
      const receiverEmail = owner.email;
      const receiverName = owner.name;
      const senderName = body.fullName;
      let customerDetails = [
        {
          "fullName": `${senderName}`,
          "email": `${body.email}`,
          "phone": `${body.phone}`,
          "appointmentDate": `${body.appointmentDate}`,
          "appointmentTime": `${body.appointmentTime}`,
        }
      ];

      // Build HTML for customer list
      const customerInfoHtml = customerDetails.map(hm => `
            <li>
                <strong>${hm.fullName}</strong><br>
                Email: ${hm.email}<br>
                Phone: ${hm.phone}<br>
                Date: ${hm.appointmentDate}<br>
                Time: ${hm.appointmentTime}
            </li>
        `).join("<br>");

      const emailSubject = `🎉 Home Tour Appointment For - ${propertyUnit.name}`;
      const emailText = `
                  <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                      <p>Dear ${receiverName},</p>
      
                      <p>This is to schedule a tour for unit <strong>${propertyUnit.name} - ${propertyUnit.code}</strong> in the property <strong>${property.description}</strong>.</p>
      
                      <h3 style="color: #444; margin-top: 25px;">💬 Customer's Message</h3>
                      <blockquote style="background-color: #f9f9f9; border-left: 4px solid #ccc; padding: 10px 15px; margin: 20px 0;">
                          ${body.comments || "No additional comments were provided."}
                      </blockquote>
      
                      <p>Here are my details for further communication</p>
                      <ul>${customerInfoHtml}</ul>
      
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

      return res.status(res.statusCode).json(appointment);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getAppointments: async (req, res) => {
    try {
      const totalAppointments = await TourSchedule.countDocuments();
      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalAppointments
      );

      if (totalAppointments == 0) {
        return Response.customResponse(
          res,
          res.statusCode,
          ResponseMessage.NO_DATA
        );
      }

      if (pagination.page > pagination.pages) {
        return Response.customResponse(
          res,
          res.statusCode,
          ResponseMessage.OUTOF_DATA
        );
      }

      pagination.data = await TourSchedule.find()
        .populate([
          { path: "propertyUnit" },
          { path: "owner" },
        ])
        .sort({ _id: -1 })
        .skip(skip)
        .limit(pagination.pageSize);

      return Response.paginationResponse(res, res.statusCode, pagination);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getAppointmentsByTenant: async (req, res) => {
    try {
      const client = await TourSchedule.findOne({ email: req.params.email });

      if (!client) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      const customer = req.params.email;
      const totalTours = await TourSchedule.countDocuments({
        email: customer,
      });

      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalTours
      );

      if (pagination.page > pagination.pages) {
        return Response.customResponse(
          res,
          res.statusCode,
          ResponseMessage.OUTOF_DATA
        );
      }

      pagination.data = await TourSchedule.find({ email: customer })
        .populate([
          { path: "propertyUnit" },
          { path: "owner" },
        ])
        .sort({ _id: -1 })
        .skip(skip)
        .limit(pagination.pageSize);

      if (totalTours === 0) {
        return Response.customResponse(
          res,
          res.statusCode,
          ResponseMessage.NO_DATA
        );
      }

      pagination.data = pagination.data.map((item) => ({
        ...item.toJSON(),
        propertyUnit: item.propertyUnit ? item.propertyUnit : null,
        owner: item.owner ? item.owner : null,
      }));

      return Response.paginationResponse(res, res.statusCode, pagination);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  getAppointmentsByOwner: async (req, res) => {
    try {
      const client = await PropertyOwner.findById(req.params.ownerId);

      if (!client) {
        return Response.customResponse(res, 404, ResponseMessage.NO_OWNER_RECORD);
      }

      const customer = req.params.ownerId;
      const totalTours = await TourSchedule.countDocuments({
        ownerId: customer,
      });

      const { pagination, skip } = await PaginationUtility.paginationParams(
        req,
        totalTours
      );

      if (pagination.page > pagination.pages) {
        return Response.customResponse(
          res,
          res.statusCode,
          ResponseMessage.OUTOF_DATA
        );
      }

      pagination.data = await TourSchedule.find({ ownerId: customer })
        .populate([
          { path: "propertyUnit" },
          { path: "owner" },
        ])
        .sort({ _id: -1 })
        .skip(skip)
        .limit(pagination.pageSize);

      if (totalTours === 0) {
        return Response.customResponse(
          res,
          res.statusCode,
          ResponseMessage.NO_DATA
        );
      }

      pagination.data = pagination.data.map((item) => ({
        ...item.toJSON(),
        propertyUnit: item.propertyUnit ? item.propertyUnit: null,
        owner: item.owner ? item.owner : null,
      }));

      return Response.paginationResponse(res, res.statusCode, pagination);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  get: async (req, res) => {
    try {
      const appointment = await TourSchedule.findById(req.params.id).populate([
        { path: "propertyUnit" },
        { path: "owner" },
      ]);

      if (!appointment) {
        return Response.customResponse(res, 404, ResponseMessage.NO_RECORD);
      }

      const appointmentData = {
        id: appointment._id,
        propertyUnit: appointment.propertyUnit ? appointment.propertyUnit.code : null,
        owner: appointment.owner ? appointment.owner.name : null,
        fullName: appointment.fullName,
        email: appointment.appointmentDate,
        phone: appointment.phone,
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
        comments: appointment.comments,
        appointmentStatus: appointment.appointmentStatus,
        createdAt: appointment.createdAt,
        updatedAt: appointment.updatedAt,
      };

      return Response.successResponse(res, res.statusCode, appointmentData);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  delete: async (req, res) => {
    try {
      const param = req.params;
      const userId = param.userId;

      const user = await SystemUser.findOne({ code: userId });
      const appointment = await TourSchedule.findById(param.id);
      const propertyUnit = await PropertyUnit.findById(appointment.propertyUnitId);

      if (!appointment) {
        return Response.customResponse(res, 404, ResponseMessage.NO_TOUR_RECORD);
      }

      await appointment.deleteOne();

      const action = `Deleted ${moduleName} For- ${propertyUnit.code}`;
      await createActivityLog(moduleName, action, user._id);

      return res.status(res.statusCode).json({
        message: ResponseMessage.SUCCESS_MESSAGE,
      });
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },

  update: async (req, res) => {
    try {
      const body = req.body;
      const appointment = await TourSchedule.findById(body.id);
      const propertyUnit = await PropertyUnit.findById(appointment.propertyUnitId);

      if (!propertyUnit) {
        return Response.customResponse(res, 404, ResponseMessage.NO_PROPERTYUNIT_RECORD);
      }

      const property = await Property.findById(propertyUnit.propertyId);

      if (!property) {
        return Response.customResponse(res, 404, ResponseMessage.NO_PROPERTY_RECORD);
      }

      const owner = await PropertyOwner.findById(property.propertyOwnerId);

      appointment.appointmentDate = body.appointmentDate || appointment.appointmentDate;
      appointment.appointmentTime = body.appointmentTime || appointment.appointmentTime;
      appointment.updatedAt = DateUtil.currentDate();

      const updatedAppointment = await appointment.save();

      const action = `Updated ${moduleName} - ${property.code}`;
      const person = appointment.customerId;
      await createActivityLog(moduleName, action, person);

      // Step 7: Send email to owner
      const receiverEmail = appointment.email;
      const receiverName = appointment.fullName;
      const senderName = owner.name;
      let updatedDetails = [
        {
          "appointmentDate": `${body.appointmentDate}`,
          "appointmentTime": `${body.appointmentTime}`,
        }
      ];

      // Build HTML for customer list
      const updatedInfoHtml = updatedDetails.map(hm => `
            <li>
                Date: ${hm.appointmentDate}<br>
                Time: ${hm.appointmentTime}
            </li>
        `).join("<br>");

      const emailSubject = `🎉 Home Tour Appointment Update For - ${propertyUnit.name}`;
      const emailText = `
                  <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                      <p>Dear ${receiverName},</p>
      
                      <p>This is an update following your appointment request for <strong>${propertyUnit.name} - ${propertyUnit.code}</strong> in the property <strong>${property.description}</strong>.</p>
      
                      <h3 style="color: #444; margin-top: 25px;">💬 Your Message</h3>
                      <blockquote style="background-color: #f9f9f9; border-left: 4px solid #ccc; padding: 10px 15px; margin: 20px 0;">
                          ${appointment.comments || "No additional comments were provided."}
                      </blockquote>
      
                      <p>Here are the updated details regarding your appointment</p>
                      <ul>${updatedInfoHtml}</ul>
      
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

      return res.status(res.statusCode).json(updatedAppointment);
    } catch (err) {
      return Response.errorResponse(res, 500, err);
    }
  },
};
