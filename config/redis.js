const redisConnectionDetails = {
  host: process.env.REDIS_URL,
  port: process.env.REDIS_PORT,
  database: process.env.REDIS_DB,
};

module.exports = redisConnectionDetails;
