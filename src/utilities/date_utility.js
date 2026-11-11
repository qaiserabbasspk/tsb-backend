const moment = require("moment-timezone");
require("moment");

module.exports = {
  currentDate: () => moment().tz("Africa/Nairobi").toDate(),
  validFromDate: () => moment().tz("Africa/Nairobi").add(3, "hours"), // since mongoDb time is 3 hours behind our timezone
  expirationDate: () => moment().tz("Africa/Nairobi").add(7, "hours"), // add 7 to make the 4 hour diff btw from and expiry time
};
