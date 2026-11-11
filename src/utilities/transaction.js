const {
  FullPayment,
  Installment,
  Subscription,
} = require("../models/transaction");

const createTransaction = async (paymentTypeString, transactionData) => {
  // const session = await mongoose.startSession();
  // session.startTransaction();
  try {
    let newTransaction;
    switch (paymentTypeString) {
      case "FullPayment":
        newTransaction = new FullPayment(transactionData);
        break;
      case "Installment":
        newTransaction = new Installment(transactionData);
        break;
      case "Subscription":
        newTransaction = new Subscription(transactionData);
        break;
      default:
        throw new Error("Invalid payment type");
    }

    await newTransaction.save();

    // await session.commitTransaction();
    // session.endSession();
    // return newTransaction;
  } catch (error) {
    // await session.abortTransaction();
    // session.endSession();
    throw error;
  } finally {
    // session.endSession();
  }
};

const updateTransactionStatus = async (contractId, status) => {
  await Transaction.findOneAndUpdate(
    { contractId: contractId },
    {
      $set: {
        status: status,
        updatedOn: DateUtil.currentDate(),
      },
    }
  );
};

module.exports = {
  createTransaction,
  updateTransactionStatus,
};
