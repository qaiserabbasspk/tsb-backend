const QBActivityLog = require("../models/qbActivityLogs");
const DateUtil = require("../utilities/date_utility");

const createActivityLog = async (modulename, action, user) => {
    const log = new QBActivityLog({
        name: modulename,
        action: action,
        actionOn: DateUtil.currentDate(),
        userCode: user,
    });

    await log.save();

    // return log;
};

module.exports = { createActivityLog };
