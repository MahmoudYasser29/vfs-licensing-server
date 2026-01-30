# VFS License Server

Backend server for VFS Commander Pro extension licensing system.

## Features
- ✅ License validation and device binding
- ✅ Embassy/Country restrictions per license  
- ✅ Auto-update mechanism for Chrome extension
- ✅ Complete admin API for license management
- ✅ MongoDB database with device tracking

## Quick Start

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Setup MongoDB
**Option A: Local MongoDB**
- Install MongoDB locally
- It will run on `mongodb://localhost:27017`

**Option B: MongoDB Atlas (Recommended - Free)**
- Go to https://www.mongodb.com/cloud/atlas
- Create free account
- Create cluster (free M0)
- Get connection string
- Update `.env` file with your connection string

### 3. Configure Environment
```bash
cp .env.example .env
```

Edit `.env` file:
- Set `MONGODB_URI` to your MongoDB connection
- Change `ADMIN_SECRET_KEY` to a strong random string
- Update `SERVER_URL` when deploying

### 4. Start Server
```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

Server will start on http://localhost:3000

## API Endpoints

### License Validation (Public)

#### POST /api/license/validate
Activate a license code.

**Request:**
```json
{
  "code": "XXXX-XXXX-XXXX-XXXX",
  "deviceFingerprint": "unique-device-id",
  "deviceInfo": {
    "browser": "Chrome",
    "os": "Windows",
    ...
  }
}
```

**Response:**
```json
{
  "success": true,
  "licenseId": "...",
  "expiresAt": "2026-02-27T00:00:00Z",
  "daysRemaining": 30,
  "allowedCountries": ["The Netherlands", "Greece"]
}
```

#### POST /api/license/check
Re-validate existing license.

### Admin API

All admin endpoints require `x-admin-key` header:
```
x-admin-key: your-secret-admin-key
```

#### POST /api/admin/generate
Generate new license code.

**Request:**
```json
{
  "expirationDays": 30,
  "maxDevices": 1,
  "allowedCountries": ["The Netherlands", "Greece"],
  "customerEmail": "customer@example.com",
  "customerName": "احمد محمد",
  "notes": "Trial license"
}
```

#### GET /api/admin/licenses
List all licenses with pagination and filters.

Query params:
- `filter`: active, expired, revoked
- `search`: search by code/email/name
- `page`: page number
- `limit`: results per page

#### GET /api/admin/stats
Dashboard statistics.

#### POST /api/admin/revoke
Revoke license or specific device.

#### PATCH /api/admin/license/:id
Update license details.

#### DELETE /api/admin/license/:id
Delete license.

### Auto-Update

#### GET /api/updates.xml
Chrome extension update manifest.

#### GET /api/download/extension.crx
Download latest extension file.

## Testing Admin API

### Using cURL:

```bash
# Generate license
curl -X POST http://localhost:3000/api/admin/generate \
  -H "Content-Type: application/json" \
  -H "x-admin-key: temp-admin-key-change-in-production" \
  -d '{
    "expirationDays": 30,
    "allowedCountries": ["The Netherlands"],
    "customerName": "Test User"
  }'

# Get stats
curl http://localhost:3000/api/admin/stats \
  -H "x-admin-key: temp-admin-key-change-in-production"
```

### Using Postman:
1. Set header: `x-admin-key = your-secret-key`
2. Use the endpoints above

## Deployment

### Railway.app (Recommended - Free Tier)

1. Go to https://railway.app
2. Create account
3. New Project → Deploy from GitHub
4. Add MongoDB plugin
5. Set environment variables
6. Deploy!

### Render.com (Alternative - Free Tier)

1. Go to https://render.com
2. Create Web Service from GitHub
3. Add MongoDB Atlas connection
4. Set environment variables
5. Deploy!

## Environment Variables

Required for production:
- `MONGODB_URI`: Your MongoDB connection string
- `ADMIN_SECRET_KEY`: Strong random string
- `SERVER_URL`: Your deployed server URL
- `EXTENSION_ID`: Chrome extension ID (from manifest)
- `EXTENSION_VERSION`: Current version number

## Security Notes

⚠️ **Important:**
- Change `ADMIN_SECRET_KEY` in production
- Never commit `.env` file
- Use HTTPS in production
- Keep MongoDB connection secure
