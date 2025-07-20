const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');

const app = express();
app.use(cors()); // Allow requests from your extension
app.use(express.json());

// IMPORTANT: Replace this with your actual MongoDB connection string
const uri = "mongodb+srv://vfs-api-user:<db_password>@vfs-licenses.bx9nt6j.mongodb.net/?retryWrites=true&w=majority&appName=VFS-Licenses";
const client = new MongoClient(uri);

let keysCollection;

async function connectToDb() {
    try {
        await client.connect();
        keysCollection = client.db("licensing").collection("keys");
        console.log("Connected to MongoDB!");
    } catch (e) {
        console.error(e);
    }
}

app.post('/validate', async (req, res) => {
    const { apiKey } = req.body;

    if (!apiKey) {
        return res.status(400).json({ status: 'error', message: 'API key is required.' });
    }

    const licenseKey = await keysCollection.findOne({ key: apiKey });

    if (licenseKey) {
        if (new Date(licenseKey.expiryDate) > new Date()) {
            res.json({ status: 'valid', expiry: licenseKey.expiryDate });
        } else {
            res.json({ status: 'expired', message: 'Your license has expired.' });
        }
    } else {
        res.json({ status: 'invalid', message: 'Invalid API key.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    connectToDb();
    console.log(`Licensing server running on port ${PORT}`);
});
