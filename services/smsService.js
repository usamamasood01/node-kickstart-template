const client = require("twilio")(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const sendOTP = (to) => {
  return new Promise((resolve, reject) => {
    client.verify
      .services(process.env.TWILIO_SERVICE_ID)
      .verifications.create({
        to,
        channel: "sms",
      })
      .then((data) => resolve(data))
      .catch((error) => reject(error));
  });
};

const verifyOTP = (to, code) => {
  return new Promise((resolve, reject) => {
    client.verify
      .services(process.env.TWILIO_SERVICE_ID)
      .verificationChecks.create({ to, code })
      .then((data) =>
        data.status === "approved"
          ? resolve()
          : reject({ message: "Code invalid" })
      )
      .catch((error) => reject(error));
  });
};

module.exports = {
  sendOTP,
  verifyOTP,
};
