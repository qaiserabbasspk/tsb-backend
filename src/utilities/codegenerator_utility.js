const { genSaltSync, hashSync, compareSync } = require("bcryptjs");

module.exports = {
  randomCode: () => {
    const characters = "0123456789";
    let uniqueCode = "";
    for (let i = 0; i < 8; i++) {
      const randomIndex = Math.floor(Math.random() * characters.length);
      uniqueCode += characters.charAt(randomIndex);
    }

    return uniqueCode;
  },

  passCode: () => {
    const characters = "0123456789";
    let uniqueCode = "";
    for (let i = 0; i < 6; i++) {
      const randomIndex = Math.floor(Math.random() * characters.length);
      uniqueCode += characters.charAt(randomIndex);
    }

    return uniqueCode;
  },

  passwordHash: (password) => {
    // Hash the password
    const salt = genSaltSync(8);
    return hashSync(password, salt);
  },
};
