const DateUtil = require("../utilities/date_utility");
const { createActivityLog } = require("../utilities/activitylog_utility");

const createAccount = async (Model, newUser, code, roleName, moduleName, actionBy) => {
    try {
        // console.log(`Creating ${roleName}...`);
        const account = new Model({
            ownerCode: newUser.ownerCode,
            code, // Use the same code passed from the SystemUser
            _id: newUser._id, // Set the same _id as SystemUser
            name: newUser.name,
            email: newUser.email,
            roleId: newUser.roleId,
            status: roleName == 'HandyMan' ? 1 : 0,
            isOwner: newUser.isOwner,
            avatar: newUser.avatar,
            password: newUser.password,
            phone: newUser.phone,
            address: newUser.address,
            createdOn: DateUtil.currentDate(),
        });

        await account.save();
        // const savedAccount = await account.save();
        // console.log(`${roleName} created successfully:`, savedAccount);

        // Log the action
        const action = `New ${roleName} - ${newUser.name}`;
        await createActivityLog(moduleName, action, actionBy);

    } catch (err) {
        // console.error(`Error creating ${roleName}:`, err.message);
        throw err; // Propagate error for global handling
    }
}

module.exports = { createAccount };