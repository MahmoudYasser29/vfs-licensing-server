require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const License = require('./models/License');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/vfs-licenses')
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// Helper function to generate license code
function generateLicenseCode() {
  const segments = 4;
  const segmentLength = 4;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < segmentLength; j++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (i < segments - 1) code += '-';
  }
  
  return code;
}

// Helper function to get client IP
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0] || 
         req.headers['x-real-ip'] || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress ||
         'unknown';
}

// ==========================================
// LICENSE VALIDATION ENDPOINTS
// ==========================================

// POST /api/license/validate - Activate a license
app.post('/api/license/validate', async (req, res) => {
  try {
    const { code, deviceFingerprint, deviceInfo } = req.body;
    
    if (!code || !deviceFingerprint) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_REQUEST',
        message: 'الكود وبصمة الجهاز مطلوبة'
      });
    }
    
    // Find license
    const license = await License.findOne({ code: code.toUpperCase() });
    
    if (!license) {
      return res.status(404).json({
        success: false,
        error: 'INVALID_CODE',
        message: 'الكود غير صحيح. برجاء التحقق من الكود والمحاولة مرة أخرى'
      });
    }
    
    // Check if license is valid
    if (!license.isValid()) {
      if (license.revoked) {
        return res.status(403).json({
          success: false,
          error: 'LICENSE_REVOKED',
          message: 'هذا الكود محظور. برجاء التواصل مع المبرمج'
        });
      }
      
      return res.status(403).json({
        success: false,
        error: 'CODE_EXPIRED',
        message: 'انتهت صلاحية هذا الكود. برجاء التواصل مع المبرمج للتجديد'
      });
    }
    
    // Check if device can activate
    if (!license.canActivateDevice(deviceFingerprint)) {
      return res.status(403).json({
        success: false,
        error: 'CODE_USED',
        message: 'هذا الكود مستخدم على جهاز آخر. برجاء التواصل مع المبرمج لإعادة التفعيل'
      });
    }
    
    // Update device info
    const ipAddress = getClientIP(req);
    license.updateDevice(deviceFingerprint, deviceInfo, ipAddress);
    await license.save();
    
    // Calculate days remaining
    const daysRemaining = Math.ceil((license.expiresAt - new Date()) / (1000 * 60 * 60 * 24));
    
    // Return success
    res.json({
      success: true,
      licenseId: license._id,
      expiresAt: license.expiresAt,
      daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
      allowedCountries: license.allowedCountries
    });
    
  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'خطأ في السيرفر. برجاء المحاولة لاحقاً'
    });
  }
});

// POST /api/license/check - Re-validate existing license
app.post('/api/license/check', async (req, res) => {
  try {
    const { licenseId, deviceFingerprint } = req.body;
    
    if (!licenseId || !deviceFingerprint) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_REQUEST'
      });
    }
    
    const license = await License.findById(licenseId);
    
    if (!license) {
      return res.status(404).json({
        success: false,
        error: 'LICENSE_NOT_FOUND',
        message: 'الترخيص غير موجود'
      });
    }
    
    // Check if license is valid
    if (!license.isValid()) {
      return res.status(403).json({
        success: false,
        error: license.revoked ? 'LICENSE_REVOKED' : 'CODE_EXPIRED',
        message: license.revoked 
          ? 'تم إلغاء هذا الترخيص' 
          : 'انتهت صلاحية الترخيص'
      });
    }
    
    // Check if device is still valid
    const device = license.devices.find(d => d.fingerprint === deviceFingerprint);
    if (!device) {
      return res.status(403).json({
        success: false,
        error: 'DEVICE_NOT_FOUND',
        message: 'الجهاز غير مسجل'
      });
    }
    
    if (device.blocked) {
      return res.status(403).json({
        success: false,
        error: 'DEVICE_BLOCKED',
        message: 'هذا الجهاز محظور. برجاء التواصل مع المبرمج'
      });
    }
    
    // Update last seen
    device.lastSeen = new Date();
    await license.save();
    
    const daysRemaining = Math.ceil((license.expiresAt - new Date()) / (1000 * 60 * 60 * 24));
    
    res.json({
      success: true,
      expiresAt: license.expiresAt,
      daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
      allowedCountries: license.allowedCountries
    });
    
  } catch (error) {
    console.error('Check error:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR'
    });
  }
});

// ==========================================
// AUTO-UPDATE ENDPOINTS
// ==========================================

// GET /api/updates.xml - Chrome extension update manifest
app.get('/api/updates.xml', async (req, res) => {
  const extensionId = process.env.EXTENSION_ID || 'YOUR_EXTENSION_ID';
  const version = process.env.EXTENSION_VERSION || '8.0';
  const serverUrl = process.env.SERVER_URL || 'http://localhost:3000';
  
  res.set('Content-Type', 'application/xml');
  res.send(`<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='${extensionId}'>
    <updatecheck codebase='${serverUrl}/api/download/extension.crx' version='${version}' />
  </app>
</gupdate>`);
});

// GET /api/download/extension.crx - Download latest extension
app.get('/api/download/extension.crx', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const crxPath = path.join(__dirname, 'public', 'vfs-commander-pro.crx');
  
  if (fs.existsSync(crxPath)) {
    res.download(crxPath);
  } else {
    res.status(404).json({
      success: false,
      error: 'FILE_NOT_FOUND',
      message: 'Extension file not found. Please upload the .crx file to backend/public/'
    });
  }
});

// ==========================================
// ADMIN ENDPOINTS
// ==========================================

// Middleware to verify admin
function verifyAdmin(req, res, next) {
  const adminKey = req.headers['x-admin-key'] || req.body.adminKey;
  
  if (adminKey !== process.env.ADMIN_SECRET_KEY) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Invalid admin key'
    });
  }
  
  next();
}

// POST /api/admin/generate - Generate new license
app.post('/api/admin/generate', verifyAdmin, async (req, res) => {
  try {
    const { 
      expirationDays, 
      maxDevices, 
      allowedCountries,
      customerEmail, 
      customerName, 
      notes 
    } = req.body;
    
    // Generate unique code
    let code;
    let exists = true;
    while (exists) {
      code = generateLicenseCode();
      exists = await License.findOne({ code });
    }
    
    // Calculate expiration
    const expiresAt = new Date();
    if (expirationDays && expirationDays > 0) {
      expiresAt.setDate(expiresAt.getDate() + parseInt(expirationDays));
    } else {
      // Unlimited license (100 years)
      expiresAt.setFullYear(expiresAt.getFullYear() + 100);
    }
    
    // Set allowed countries (default to all if not specified)
    const countries = allowedCountries && allowedCountries.length > 0 
      ? allowedCountries 
      : ['The Netherlands', 'Greece', 'portugal'];
    
    // Create license
    const license = new License({
      code,
      expiresAt,
      maxDevices: maxDevices || 1,
      allowedCountries: countries,
      customerEmail,
      customerName,
      notes
    });
    
    await license.save();
    
    res.json({
      success: true,
      license: {
        code,
        expiresAt,
        maxDevices: license.maxDevices,
        allowedCountries: license.allowedCountries,
        id: license._id
      }
    });
    
  } catch (error) {
    console.error('Generate error:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: error.message
    });
  }
});

// GET /api/admin/licenses - List all licenses
app.get('/api/admin/licenses', verifyAdmin, async (req, res) => {
  try {
    const { filter, search, page = 1, limit = 50 } = req.query;
    
    let query = {};
    
    // Apply filters
    if (filter === 'active') {
      query.revoked = false;
      query.expiresAt = { $gt: new Date() };
    } else if (filter === 'expired') {
      query.expiresAt = { $lte: new Date() };
    } else if (filter === 'revoked') {
      query.revoked = true;
    }
    
    // Search
    if (search) {
      query.$or = [
        { code: new RegExp(search, 'i') },
        { customerEmail: new RegExp(search, 'i') },
        { customerName: new RegExp(search, 'i') }
      ];
    }
    
    const licenses = await License.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await License.countDocuments(query);
    
    res.json({
      success: true,
      licenses,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('List error:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR'
    });
  }
});

// GET /api/admin/license/:id - Get single license details
app.get('/api/admin/license/:id', verifyAdmin, async (req, res) => {
  try {
    const license = await License.findById(req.params.id);
    
    if (!license) {
      return res.status(404).json({
        success: false,
        error: 'LICENSE_NOT_FOUND'
      });
    }
    
    res.json({
      success: true,
      license
    });
    
  } catch (error) {
    console.error('Get license error:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR'
    });
  }
});

// GET /api/admin/stats - Dashboard statistics
app.get('/api/admin/stats', verifyAdmin, async (req, res) => {
  try {
    const now = new Date();
    
    const totalLicenses = await License.countDocuments({});
    const activeLicenses = await License.countDocuments({
      revoked: false,
      expiresAt: { $gt: now }
    });
    const expiredLicenses = await License.countDocuments({
      expiresAt: { $lte: now },
      revoked: false
    });
    const revokedLicenses = await License.countDocuments({
      revoked: true
    });
    
    // Count total devices
    const allLicenses = await License.find({});
    const totalDevices = allLicenses.reduce((sum, license) => sum + license.devices.length, 0);
    
    res.json({
      success: true,
      stats: {
        totalLicenses,
        activeLicenses,
        expiredLicenses,
        revokedLicenses,
        totalDevices
      }
    });
    
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR'
    });
  }
});

// POST /api/admin/revoke - Revoke a license or device
app.post('/api/admin/revoke', verifyAdmin, async (req, res) => {
  try {
    const { licenseId, deviceFingerprint } = req.body;
    
    const license = await License.findById(licenseId);
    
    if (!license) {
      return res.status(404).json({
        success: false,
        error: 'LICENSE_NOT_FOUND'
      });
    }
    
    if (deviceFingerprint) {
      // Block specific device
      const device = license.devices.find(d => d.fingerprint === deviceFingerprint);
      if (device) {
        device.blocked = true;
      }
    } else {
      // Revoke entire license
      license.revoked = true;
    }
    
    await license.save();
    
    res.json({
      success: true,
      message: deviceFingerprint ? 'Device blocked' : 'License revoked'
    });
    
  } catch (error) {
    console.error('Revoke error:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR'
    });
  }
});

// POST /api/admin/unrevoke - Un-Revoke License (Unban)
app.post('/api/admin/unrevoke', verifyAdmin, async (req, res) => {
  try {
    const { licenseId } = req.body;
    await License.findByIdAndUpdate(licenseId, { revoked: false });
    res.json({ success: true, message: 'License un-revoked' });
  } catch (error) {
    console.error('Unrevoke error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/admin/delete - Delete License
app.post('/api/admin/delete', verifyAdmin, async (req, res) => {
  try {
    const { licenseId } = req.body;
    await License.findByIdAndDelete(licenseId);
    res.json({ success: true, message: 'License deleted permanently' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/admin/license/:id - Update license
app.patch('/api/admin/license/:id', verifyAdmin, async (req, res) => {
  try {
    const { expiresAt, allowedCountries, maxDevices, customerEmail, customerName, notes } = req.body;
    
    const license = await License.findById(req.params.id);
    
    if (!license) {
      return res.status(404).json({
        success: false,
        error: 'LICENSE_NOT_FOUND'
      });
    }
    
    if (expiresAt) license.expiresAt = new Date(expiresAt);
    if (allowedCountries) license.allowedCountries = allowedCountries;
    if (maxDevices !== undefined) license.maxDevices = parseInt(maxDevices);
    if (customerEmail !== undefined) license.customerEmail = customerEmail;
    if (customerName !== undefined) license.customerName = customerName;
    if (notes !== undefined) license.notes = notes;
    
    await license.save();
    
    res.json({
      success: true,
      license
    });
    
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR'
    });
  }
});

// DELETE /api/admin/license/:id - Delete a license
app.delete('/api/admin/license/:id', verifyAdmin, async (req, res) => {
  try {
    const license = await License.findByIdAndDelete(req.params.id);
    
    if (!license) {
      return res.status(404).json({
        success: false,
        error: 'LICENSE_NOT_FOUND'
      });
    }
    
    res.json({
      success: true,
      message: 'License deleted'
    });
    
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR'
    });
  }
});

// ==========================================
// TEST ENDPOINT
// ==========================================

app.get('/', (req, res) => {
  res.json({
    message: 'VFS License Server',
    version: '1.0.0',
    endpoints: {
      license: '/api/license/validate',
      check: '/api/license/check',
      admin: '/api/admin/*',
      updates: '/api/updates.xml'
    }
  });
});

// ==========================================
// START SERVER
// ==========================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════╗
║   🚀 VFS License Server Running               ║
╠═══════════════════════════════════════════════╣
║   Port: ${PORT}                                    ║
║   📊 Admin API: /api/admin                    ║
║   🔐 License API: /api/license                ║
║   🔄 Update XML: /api/updates.xml             ║
╚═══════════════════════════════════════════════╝
  `);
});
