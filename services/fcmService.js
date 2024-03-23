const { firebaseAdmin } = require("../config");
const { PLATFORMS } = require("../constants");

const sendNotification = async (
  notification,
  tokens,
  platform = null,
  data = {}
) => {
  try {
    let payload = {
      data: {
        ...notification,
        ...{ _id: data?._id ? data?._id.toString() : "" },
      },
    };
    if (platform === PLATFORMS.ios) {
      payload.notification = notification;
    }

    await firebaseAdmin
      .messaging()
      .sendToDevice(tokens, payload, {
        priority: "high",
        contentAvailable: true,
      })
      .then((res) => console.log(JSON.stringify(res, null, 4)))
      .catch((err) => console.log(err));
  } catch (error) {
    console.log(`Error in sendNotification method: ${error}`);
  }
};

const sendSilentNotification = async (data, tokens) => {
  try {
    const payload = {
      notification: {},
      data,
    };
    const options = {
      contentAvailable: true,
    };

    firebaseAdmin
      .messaging()
      .sendToDevice(tokens, payload, options)
      .then((res) => console.log(JSON.stringify(res, null, 4)))
      .catch((err) => console.log(err));
  } catch (error) {
    console.log(`Error in sendSilentNotification method: ${error}`);
  }
};

module.exports = {
  sendSilentNotification,
  sendNotification,
};
