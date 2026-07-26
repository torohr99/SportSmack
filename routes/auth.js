const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_do_not_use_in_prod';

// Helper function to generate JWT
const generateToken = (id, username) => {
  return jwt.sign({ id, username }, JWT_SECRET, {
    expiresIn: '30d',
  });
};

// @route   POST /api/auth/register
// @desc    Register a new user
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }

    // Check if user exists
    const userExists = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }]
      }
    });

    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Generate OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Create user
    const user = await prisma.user.create({
      data: {
        username,
        email,
        password_hash,
        isVerified: false,
        otpCode: otpCode
      }
    });

    // Send OTP email asynchronously
    const { sendOTP } = require('../utils/mailer');
    sendOTP(user.email, otpCode).catch(err => console.error("Failed to send OTP:", err));

    res.status(201).json({
      success: true,
      message: 'Registration successful. Please check your email for the OTP.',
      userId: user.id
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// @route   POST /api/auth/login
// @desc    Authenticate a user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (user && (await bcrypt.compare(password, user.password_hash))) {
      
      if (!user.isVerified) {
        return res.status(403).json({ message: 'Account not verified. Please verify your email first.', unverified: true, userId: user.id });
      }

      // Create token
      const token = generateToken(user.id, user.username);

      res.json({
        id: user.id,
        username: user.username,
        email: user.email,
        token
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user / clear cookie
router.post('/logout', (req, res) => {
  res.cookie('token', '', {
    httpOnly: true,
    expires: new Date(0)
  });
  res.status(200).json({ message: 'Logged out successfully' });
});

// @route   GET /api/auth/me
// @desc    Get current user profile
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, username: true, email: true, created_at: true, profile_pic: true }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching profile' });
  }
});

// @route   POST /api/auth/verify
// @desc    Verify OTP code
router.post('/verify', async (req, res) => {
  try {
    const { userId, code } = req.body;
    
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    if (user.isVerified) return res.status(400).json({ message: 'User is already verified' });
    
    if (user.otpCode !== code) return res.status(400).json({ message: 'Invalid OTP code' });
    
    // Update user
    await prisma.user.update({
      where: { id: userId },
      data: { isVerified: true, otpCode: null }
    });
    
    // Generate token
    const token = generateToken(user.id, user.username);
    
    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      token
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
