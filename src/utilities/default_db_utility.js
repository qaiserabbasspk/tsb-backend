const Account = require("../models/account");
const PaymentType = require("../models/paymentType");
const DateUtil = require("./date_utility");

module.exports = {
  runDefaultDbProperties: async () => {
    // Check if the User collection is empty
    const account = await Account.countDocuments();
    // Check if the PaymentType collection is empty
    const payment = await PaymentType.countDocuments();
    if (account === 0) {
      // Insert initial records
      await Account.insertMany([
        {
          acname: "Sales Revenue",
          acnumber: "410101",
          actype: "Revenue",
          status: true,
          createdOn: DateUtil.currentDate(),
        },
        {
          acname: "Cash",
          acnumber: "101001",
          actype: "Asset",
          status: true,
          createdOn: DateUtil.currentDate(),
        },
      ])
        .then(() => {
          console.log("Initial records inserted successfully");
        })
        .catch((err) => {
          console.error("Error inserting initial records:", err);
        });
    }

    if (payment === 0) {
      // Insert initial records
      await PaymentType.insertMany([
        { type: "FullPayment", createdOn: DateUtil.currentDate() },
        { type: "Installment", createdOn: DateUtil.currentDate() },
        { type: "Subscription", createdOn: DateUtil.currentDate() },
      ])
        .then(() => {
          console.log("Initial records inserted successfully");
        })
        .catch((err) => {
          console.error("Error inserting initial records:", err);
        });
    }
  },
};
