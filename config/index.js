module.exports = {
  db: require("./database"),
  redisConnectionDetails: require("./redis"),
  s3: require("./aws"),
  firebaseAdmin: require("./firebaseAdmin"),
};
