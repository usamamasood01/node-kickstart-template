const { jwtService, userService } = require('../services');
const {
  FORGET_PASS_EMAIL_SUBJECT,
  FORGET_PASS_EMAIL_BODY,
  PLATFORMS,
  passwordRegex,
} = require('../constants');
const bcrypt = require('bcrypt');
const { sendMail } = require('../services/mailerService');
const smsService = require('../services/smsService');
const _ = require('lodash');
const { removeUserLockedFields } = require('../services/utilsService');

/**
 * @swagger
 * tags:
 *   name: User
 *   description: The routes regarding user's authentication, authorization and functionality
 */

/**
 * @swagger
 * /user/register:
 *   post:
 *     summary: signup a new user
 *     tags: [User]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: Object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               firebaseToken:
 *                 type: string
 *             example:
 *               email: someone@mail.com
 *               password: password
 *               firebaseToken: firebaseToken
 *     responses:
 *       200:
 *         description: user signed up successfully
 *       422:
 *         description: invalid request body
 *       500:
 *         description: something went wrong
 */
const signup = async (req, res) => {
  try {
    const { email, password, firebaseToken } = req.body;
    if (!email || !password) {
      return res.status(422).send({ error: 'Email or password missing!' });
    }

    if (!password.match(passwordRegex)) {
      return res.status(422).send({
        error:
          'Password must contain at least 8 characters, 1 uppercase letter, 1 special character and 1 number!',
      });
    }

    let user;
    user = await userService.getOneUser({ email: email.toLowerCase() });
    if (user) {
      return res.status(422).send({
        error: 'Email associated with another account',
      });
    }

    if (firebaseToken) {
      await userService.updateAllUsers(
        {
          'firebaseTokens.token': firebaseToken,
        },
        {
          $pull: {
            firebaseTokens: { token: firebaseToken },
          },
        }
      );
    }

    user = await userService.addUser({
      email: req.body.email.toLowerCase(),
      password: req.body.password,
      ...(firebaseToken && {
        firebaseTokens: [
          {
            platform: req.headers.platform
              ? req.headers.platform.toLowerCase()
              : PLATFORMS.android,
            token: firebaseToken,
          },
        ],
      }),
    });

    const accessToken = jwtService.generateAccessToken(user);

    res
      .header('access_token', accessToken)
      .status(200)
      .json(user?._doc ? _.omit(user?._doc, ['password']) : {});
  } catch (error) {
    console.log('Exception signup', error);
    res.status(500).send({
      error: error?.message ? error?.message : 'Something went wrong',
    });
  }
};

/**
 * @swagger
 * /user/login:
 *   post:
 *     summary: signin a user
 *     tags: [User]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: Object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *             example:
 *               email: someone@mail.com
 *               password: password
 *     responses:
 *       200:
 *         description: user signed in successfully
 *       422:
 *         description: invalid request body
 *       500:
 *         description: something went wrong
 *       403:
 *         description: Email or password incorrect
 */
const login = async (req, res) => {
  try {
    const { email, password, firebaseToken } = req.body;
    if (!email || !password) {
      return res.status(422).send({ error: 'Email or password missing!' });
    }

    const user = await userService.getOneUser({ email: email.toLowerCase() });
    if (!user)
      return res.status(403).send({ error: 'Email or password incorrect!' });

    const isCorrectPass = await bcrypt.compareSync(password, user.password);
    if (!isCorrectPass)
      return res.status(403).send({ error: 'Password incorrect!' });

    const accessToken = jwtService.generateAccessToken(user);

    if (firebaseToken) {
      await userService.updateAllUsers(
        {
          'firebaseTokens.token': firebaseToken,
        },
        {
          $pull: {
            firebaseTokens: { token: firebaseToken },
          },
        }
      );
      user = await userService.updateUser(
        { _id: user._id },
        {
          $push: {
            firebaseTokens: {
              platform: req.headers.platform
                ? req.headers.platform.toLowerCase()
                : PLATFORMS.android,
              token: firebaseToken,
            },
          },
        }
      );
    }

    res
      .set('access-control-expose-headers', 'access_token')
      .header('access_token', accessToken)
      .status(200)
      .json(user?._doc ? _.omit(user?._doc, ['password']) : {});
  } catch (error) {
    console.log('Exception login', error);
    res.status(500).send({
      error: error?.message ? error?.message : 'Something went wrong',
    });
  }
};

/**
 * @swagger
 * /user/forgot_password:
 *   post:
 *     summary: email a reset link when password is forgotton
 *     tags: [User]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: Object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *             example:
 *               email: someone@mail.com
 *     responses:
 *       200:
 *         description: Email sent successfully!
 *       422:
 *         description: Email missing!
 *       500:
 *         description: something went wrong
 *       404:
 *         description: User not found
 */
const forgetPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(422).send({ error: 'Email missing!' });

    const user = await userService.getOneUser({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const text = FORGET_PASS_EMAIL_BODY({ _id: user._id }, user.password);
    await sendMail(user.email, FORGET_PASS_EMAIL_SUBJECT, text);

    res.status(200).json({ message: 'Email sent successfully!' });
  } catch (error) {
    console.log('Exception forgetPassword', error);
    res.status(500).send({
      error: error?.message ? error?.message : 'Something went wrong',
    });
  }
};

/**
 * @swagger
 * /user/validate_pass_reset_link:
 *   post:
 *     summary: validates a link sent for resetting password
 *     tags: [User]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: Object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *             example:
 *               token: abcd
 *     responses:
 *       200:
 *         description: Email sent successfully!
 *       422:
 *         description: Token missing!
 *       401:
 *         description: Token is not valid!
 *       500:
 *         description: something went wrong
 *       404:
 *         description: User not found
 */
const validateLink = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(422).send({ error: 'Token missing!' });

    const decoded = jwtService.decodeToken(token);
    if (!decoded) return res.status(401).json({ error: 'Token is not valid!' });

    const user = await userService.getOneUser({ _id: decoded.payload._id });
    if (!user) return res.status(404).json({ error: 'User not found' });

    jwtService.verifyToken(token, user.password, (error, user) => {
      if (error) {
        return res.status(401).json({ error: 'Token is not valid!' });
      }
      return res.status(200).json({ message: 'Token valid!' });
    });
  } catch (error) {
    console.log('Exception validateLink', error);
    res.status(500).send({
      error: error?.message ? error?.message : 'Something went wrong',
    });
  }
};

/**
 * @swagger
 * /user/update_password:
 *   put:
 *     summary: change an existing user password
 *     tags: [User]
 *     parameters:
 *      - in: header
 *        name: access_token
 *        schema:
 *          type: string
 *        required: true
 *      - in: header
 *        name: platform
 *        schema:
 *          type: string
 *        required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: Object
 *             required:
 *               - oldPassword
 *               - newPassword
 *               - confirmNewPassword
 *             properties:
 *               oldPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *               confirmNewPassword:
 *                 type: string
 *             example:
 *               oldPassword: oldPassword
 *               newPassword: newPassword
 *               confirmNewPassword: newPassword
 *     responses:
 *       200:
 *         description: Password Changed successfully!
 *       422:
 *         description: Required fields missing!
 *       500:
 *         description: something went wrong
 *       403:
 *         description: user not authorized
 */
const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword, confirmNewPassword } = req.body;
    const userId = req.user._id;
    if (!oldPassword || !newPassword || !confirmNewPassword) {
      return res.status(422).send({ error: 'Required fields missing!' });
    }

    if (newPassword !== confirmNewPassword) {
      return res
        .status(403)
        .send({ error: 'Password and confirm password are not same.' });
    }

    if (!newPassword.match(passwordRegex)) {
      return res.status(200).send({
        error:
          'Password must contain at least 8 characters, 1 uppercase letter, 1 special character and 1 number!',
      });
    }

    const user = await userService.getOneUser({ _id: userId });
    if (!user) return res.status(403).send({ error: 'Data not found!' });

    const isCorrectPass = await bcrypt.compareSync(oldPassword, user.password);
    if (!isCorrectPass) {
      return res.status(200).send({ error: 'Password incorrect!' });
    }

    await userService.updateUser({ _id: userId }, { password: newPassword });
    return res.status(200).json({ message: 'Password Changed successfully!' });
  } catch (error) {
    console.log('Exception change password', error);
    res.status(500).send({
      error: error?.message ? error?.message : 'Something went wrong',
    });
  }
};

/**
 * @swagger
 * /user/reset_password:
 *   post:
 *     summary: reset password with email link token
 *     tags: [User]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: Object
 *             required:
 *               - token
 *               - password
 *             properties:
 *               token:
 *                 type: string
 *               password:
 *                 type: string
 *             example:
 *               oldPassword: token
 *               password: password
 *     responses:
 *       200:
 *         description: Password reset successfully!
 *       422:
 *         description: Required fields missing!
 *       500:
 *         description: something went wrong
 *       401:
 *         description: Token is not valid!
 */
const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password)
      return res.status(422).send({ error: 'Token or password missing!' });

    if (!password.match(passwordRegex)) {
      return res.status(200).send({
        error:
          'Password must contain at least 8 characters, 1 uppercase letter, 1 special character and 1 number!',
      });
    }

    const decoded = jwtService.decodeToken(token);
    if (!decoded) return res.status(401).json({ error: 'Token is not valid!' });

    const user = await userService.getOneUser({ _id: decoded.payload._id });
    jwtService.verifyToken(token, user.password, async (error, user) => {
      if (error) {
        return res.status(401).json({ error: 'Token is not valid!' });
      }
      await userService.updateUser({ _id: decoded.payload._id }, { password });
      return res
        .status(200)
        .json({ message: 'Password Changed successfully!' });
    });
  } catch (error) {
    console.log('Exception resetPassword', error);
    res.status(500).send({
      error: error?.message ? error?.message : 'Something went wrong',
    });
  }
};

/**
 * @swagger
 * /user/send_otp:
 *   post:
 *     summary: send an OPT on given number for user verification
 *     tags: [User]
 *     parameters:
 *      - in: header
 *        name: access_token
 *        schema:
 *          type: string
 *        required: true
 *      - in: header
 *        name: platform
 *        schema:
 *          type: string
 *        required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: Object
 *             required:
 *               - number
 *             properties:
 *               number:
 *                 type: string
 *             example:
 *               number: 1234567
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *       422:
 *         description: Required fields missing!
 *       500:
 *         description: something went wrong
 */
const sendOTP = async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) return res.status(422).send({ error: 'Number missing!' });

    await smsService.sendOTP(number);
    res.status(200).json({ message: 'OTP sent successfully' });
  } catch (error) {
    console.log('Exception sendOTP', error);
    res.status(500).send({
      error: error?.message ? error?.message : 'Something went wrong',
    });
  }
};

/**
 * @swagger
 * /user/verify_otp:
 *   post:
 *     summary: verify the sent OTP on given number
 *     tags: [User]
 *     parameters:
 *      - in: header
 *        name: access_token
 *        schema:
 *          type: string
 *        required: true
 *      - in: header
 *        name: platform
 *        schema:
 *          type: string
 *        required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: Object
 *             required:
 *               - number
 *               - code
 *             properties:
 *               number:
 *                 type: string
 *               code:
 *                 type: string
 *             example:
 *               number: 1234567
 *               code: 1234
 *     responses:
 *       200:
 *         description: OTP verified successfully
 *       422:
 *         description: Required fields missing!
 *       500:
 *         description: something went wrong
 */
const verifyOTP = async (req, res) => {
  try {
    const { number, code } = req.body;
    if (!number || !code)
      return res.status(422).send({ error: 'Number or code missing!' });

    await smsService.verifyOTP(number, code);
    await userService.updateUser({ _id: req.user._id });
    res.status(200).json({ message: 'OTP verified successfully' });
  } catch (error) {
    console.log('Exception verifyOTP', error);
    res.status(500).send({
      error: error?.message ? error?.message : 'Something went wrong',
    });
  }
};

/**
 * @swagger
 * /user/update:
 *   put:
 *     summary: update user's profile
 *     tags: [User]
 *     parameters:
 *      - in: header
 *        name: access_token
 *        schema:
 *          type: string
 *        required: true
 *      - in: header
 *        name: platform
 *        schema:
 *          type: string
 *        required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: Object
 *             properties:
 *               name:
 *                 type: string
 *             example:
 *               name: usama
 *     responses:
 *       200:
 *         description: Profile Updated successfully
 *       500:
 *         description: something went wrong
 */
const updateProfile = async (req, res) => {
  try {
    let { body } = req;
    body = removeUserLockedFields(body);
    await userService.updateUser({ _id: req.user._id }, { $set: body });
    res.status(200).json({ message: 'Profile Updated successfully' });
  } catch (error) {
    console.log('Exception verifyOTP', error);
    res.status(500).send({
      error: error?.message ? error?.message : 'Something went wrong',
    });
  }
};

module.exports = {
  signup,
  login,
  forgetPassword,
  validateLink,
  resetPassword,
  sendOTP,
  verifyOTP,
  changePassword,
  updateProfile,
};
