
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');

// ========================================
// GENERATE JWT TOKEN
// ========================================
const signToken = (id) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is missing in .env file');
  }

  return jwt.sign(
    { id: id.toString() },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    }
  );
};

// ========================================
// GENERATE RANDOM USER CODE
// Format: US123456
// ========================================
const generateUserCode = () => {
  return `US${crypto.randomInt(100000, 1000000)}`;
};

// ========================================
// GENERATE UNIQUE USER CODE
// ========================================
const createUniqueUserCode = async () => {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateUserCode();

    const existingCode = await User.exists({ code });

    if (!existingCode) {
      return code;
    }
  }

  throw new Error('Unable to generate unique user code. Please try again.');
};

// ========================================
// FORMAT USER RESPONSE
// ========================================
const userResponse = (user) => ({
  id: user._id,
  code: user.code,
  name: user.name,
  email: user.email,
  avatar: user.avatar || 'image.png',
  status: user.status,
  isAdmin: user.isAdmin,
  createdOn: user.createdOn,
});

// ========================================
// REGISTER USER
// ========================================
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, avatar } = req.body;

    // Validate required fields
    if (
      typeof name !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !name.trim() ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: 'Name, email and password are required',
      });
    }

    // Validate password
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters',
      });
    }

    // Normalize email
    const normalizedEmail = email.trim().toLowerCase();

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address',
      });
    }

    // Check existing email
    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered',
      });
    }

    // Generate unique code
    const uniqueCode = await createUniqueUserCode();

    // Create user
    const user = await User.create({
      code: uniqueCode,
      name: name.trim(),
      email: normalizedEmail,
      password,
      avatar: typeof avatar === 'string' && avatar.trim()
        ? avatar.trim()
        : 'image.png',
      status: 1,
      isAdmin: 0,
    });

    // Generate token
    const token = signToken(user._id);

    return res.status(200).json({
      success: true,
      message: 'Registration successful',
      token,
      user: userResponse(user),
    });

  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Email or user code already exists',
      });
    }

    next(err);
  }
};

// ========================================
// LOGIN USER
// ========================================
exports.login = async (req, res, next) => {
  try {
    console.log('LOGIN REQUEST BODY:', req.body);

    const { username, email, password } = req.body || {};

    const loginEmail = (email || username || '').trim().toLowerCase();

    if (!loginEmail || typeof password !== 'string' || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email/username and password are required',
      });
    }

    const user = await User.findOne({
      email: loginEmail,
    }).select('+password');

    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    if (user.status !== 1) {
      return res.status(403).json({
        success: false,
        message: 'Your account is inactive',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token: signToken(user._id),
      user: userResponse(user),
    });

  } catch (err) {
    next(err);
  }
};

// ========================================
// GET LOGGED-IN USER
// ========================================
exports.me = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
    }

    return res.status(200).json({
      success: true,
      user: userResponse(req.user),
    });

  } catch (err) {
    next(err);
  }
};
