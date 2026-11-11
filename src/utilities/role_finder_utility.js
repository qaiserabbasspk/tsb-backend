const Role = require("../models/roles");

const findRole = async function findRoleByNamePrefix(prefix) {
    return Role.findOne({ name: { $regex: new RegExp(`^${prefix}`, 'i') } });
}

module.exports = { findRole };