function permissionValidation(permissions) {
  if (!Array.isArray(permissions)) {
    return { error: new Error("Permissions must be provided as an array.") };
  }

  for (let i = 0; i < permissions.length; i++) {
    const { module, claims } = permissions[i];

    if (typeof module !== "string" || !Array.isArray(claims)) {
      return {
        error: new Error(`Invalid format for permission object at index ${i}.`),
      };
    }
  }

  return { error: null };
}

module.exports = permissionValidation;
