const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors'); // Require the cors package

const app = express();

// **THE FIX IS HERE**
// This tells your server to accept requests from any origin.
app.use(cors()); 

app.use(express.json());

// IMPORTANT: Make sure this is your correct MongoDB connection string
const uri = "mongodb+srv://vfs-api-user:M@vfs-licenses.bx9nt6j.mongodb.net/?retryWrites=true&w=majority&appName=VFS-Licenses";
const client = new MongoClient(uri);

let keysCollection;

async function connectToDb() {
    try {
        await client.connect();
        keysCollection = client.db("licensing").collection("keys");
        console.log("Successfully connected to MongoDB Atlas!");
    } catch (e) {
        console.error("Failed to connect to MongoDB", e);
    }
}

app.post('/validate', async (req, res) => {
    const { apiKey } = req.body;

    if (!apiKey) {
        return res.status(400).json({ status: 'error', message: 'API key is required.' });
    }

    // Ensure the database connection is established
    if (!keysCollection) {
        return res.status(500).json({ status: 'error', message: 'Database not connected.' });
    }

    try {
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
    } catch (error) {
        console.error("Error during key validation:", error);
        res.status(500).json({ status: 'error', message: 'An internal server error occurred.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    connectToDb(); // Connect to the database when the server starts
    console.log(`Licensing server running on port ${PORT}`);
});
