const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  fingerprint: {
    type: String,
    required: true
  },
  deviceInfo: {
    browser: String,
    browserVersion: String,
    os: String,
    platform: String,
    language: String,
    timezone: String,
    screenResolution: String,
    hardwareConcurrency: Number
  },
  firstActivated: {
    type: Date,
    default: Date.now
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  activationCount: {
    type: Number,
    default: 1
  },
  ipAddress: String,
  blocked: {
    type: Boolean,
    default: false
  }
});

const licenseSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    required: true
  },
  maxDevices: {
    type: Number,
    default: 1
  },
  revoked: {
    type: Boolean,
    default: false
  },
  allowedCountries: {
    type: [String],
    default: ['The Netherlands', 'Greece', 'portugal'] // All countries by default
  },
  devices: [deviceSchema],
  notes: String,
  customerEmail: String,
  customerName: String
});

// Indexes for faster queries
licenseSchema.index({ code: 1 });
licenseSchema.index({ 'devices.fingerprint': 1 });
licenseSchema.index({ expiresAt: 1 });
licenseSchema.index({ revoked: 1 });

// Method to check if license is valid
licenseSchema.methods.isValid = function() {
  if (this.revoked) return false;
  if (this.expiresAt && new Date() > this.expiresAt) return false;
  return true;
};

// Method to check if device can activate
licenseSchema.methods.canActivateDevice = function(fingerprint) {
  // Check if device already activated
  const existingDevice = this.devices.find(d => d.fingerprint === fingerprint);
  if (existingDevice) {
    if (existingDevice.blocked) return false;
    return true; // Same device reactivating
  }
  
  // Check if max devices reached
  if (this.devices.length >= this.maxDevices) {
    return false;
  }
  
  return true;
};

// Method to add or update device
licenseSchema.methods.updateDevice = function(fingerprint, deviceInfo, ipAddress) {
  const existingDevice = this.devices.find(d => d.fingerprint === fingerprint);
  
  if (existingDevice) {
    // Update existing device
    existingDevice.lastSeen = new Date();
    existingDevice.activationCount += 1;
    existingDevice.deviceInfo = deviceInfo;
    existingDevice.ipAddress = ipAddress;
  } else {
    // Add new device
    this.devices.push({
      fingerprint,
      deviceInfo,
      ipAddress,
      firstActivated: new Date(),
      lastSeen: new Date(),
      activationCount: 1
    });
  }
};

module.exports = mongoose.model('License', licenseSchema);
