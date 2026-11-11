const mongoose = require("mongoose");

const emailLogSchema = new mongoose.Schema({
  receiverId: String,
  receiverType: String,
  notificationId: mongoose.Types.ObjectId,
  error: String,
  timestamp: Date,
});

module.exports = mongoose.model("EmailLog", emailLogSchema);
