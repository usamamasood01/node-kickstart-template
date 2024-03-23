const admin = require("firebase-admin");
const { getFirebaseAdminKey } = require("../services/utilsService");

admin.initializeApp({
  credential: admin.credential.cert(getFirebaseAdminKey()),
});

module.exports = admin;
