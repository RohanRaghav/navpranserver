const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const cors = require('cors');
require('dotenv').config();
const app = express();
const cloudinary = require('cloudinary').v2;
const fileUpload = require('express-fileupload');
const bodyParser = require('body-parser');

// Middleware to parse JSON
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
// Sample Route
app.get("/", (req, res) => {
  res.send("Hello from Express on Vercel!");
});
const allowedOrigins = ["https://navpran.vercel.app"];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  }
}));

app.use(fileUpload({ useTempFiles: false }));
// MongoDB connection
const mongoURI = process.env.MONGODB_URI;

mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
const userSchema = new mongoose.Schema({
  username: String,
  password: String,
  phonenumber: String,  // Store phone number as a string for flexibility
  role: String,
  address:String,
  overallBloodDonations: { type: Number, default: 0 }, // New field with default value 0
  locationDonations: { type: Number, default: 0 },      // New field with default value 0
  plasmaDonations: { type: Number, default: 0 },        // New field with default value 0
  vouchers: { type: Number, default: 0 },               // New field with default value 0
});

const User = mongoose.model("User", userSchema);
const generateUniqueId = async () => {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  
  // Function to generate the random ID
  const generateId = () => {
    const randomString = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
    const randomNumber = Math.floor(1000 + Math.random() * 9000); // 4-digit number
    return `${randomString}#${randomNumber}`;
  };

  let uniqueId = generateId();
  
  // Check for uniqueness in the database
  let existingUser = await User.findOne({ uniqueId });
  
  while (existingUser) {
    // If the uniqueId exists, modify either the random letter or number and try again
    const randLetterIndex = Math.floor(Math.random() * 4); // Random index for letter
    const randNumberIndex = Math.floor(Math.random() * 4); // Random index for the number part
    
    // Change a random letter in the string part
    let newRandomString = uniqueId.substring(0, randLetterIndex) + 
                          letters[Math.floor(Math.random() * letters.length)] + 
                          uniqueId.substring(randLetterIndex + 1, 4);
    
    // Change a random digit in the numeric part
    let newRandomNumber = uniqueId.split('#')[1].split('').map((digit, index) => {
      return index === randNumberIndex ? Math.floor(Math.random() * 10) : digit;
    }).join('');
    
    // Form the new ID with modified parts
    uniqueId = `${newRandomString}#${newRandomNumber}`;

    // Recheck if this new ID is unique
    existingUser = await User.findOne({ uniqueId });
  }

  return uniqueId;
};

// Mongoose Donor Schema and Model
const donorSchema = new mongoose.Schema({
  username: String,
  voucherUrl: String,
});

const Donor = mongoose.model('Donor', donorSchema);

// Route to handle file upload and save URL
app.post('/donors/:donorId/share-voucher', async (req, res) => {
  try {
    const donorId = req.params.donorId;
    const file = req.files?.voucher; // Access uploaded file

    if (!file) {
      return res.status(400).json({ error: 'Voucher file is required' });
    }

    // Check if donor exists
    const donor = await Donor.findById(donorId);
    if (!donor) {
      return res.status(404).json({ error: 'Donor not found' });
    }

    // Upload file to Cloudinary
    const uploadResponse = await cloudinary.uploader.upload(file.tempFilePath, {
      folder: 'vouchers',
    });

    // Save the URL of the uploaded file
    donor.voucherUrl = uploadResponse.secure_url;
    await donor.save();

    // Return the URL of the uploaded voucher
    res.status(200).json({ message: 'Voucher uploaded successfully', voucherUrl: uploadResponse.secure_url });
  } catch (error) {
    console.error('Error sharing voucher:', error);
    res.status(500).json({ error: 'Error sharing voucher.' });
  }
});
// API for Signup
app.post('/api/signup', async (req, res) => {
  try {
    const { username, password, phonenumber, role, address } = req.body;

    if (!username || !password || !phonenumber || !role || !address) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const existingUser = await User.findOne({ phonenumber });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this phone number already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const uniqueId = await generateUniqueId(); // Generate unique ID

    const newUser = new User({
      username,
      uniqueId,
      password: hashedPassword,
      phonenumber,
      role,
      address
    });

    await newUser.save();

    res.status(201).json({ message: 'User registered successfully', uniqueId });
  } catch (error) {
    console.error('Error during signup:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login route
app.post('/api/login', async (req, res) => {
  try {
    const { username, password,phonenumber } = req.body;

    if (!username || !password || !phonenumber) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await User.findOne({ phonenumber });
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    res.json({ message: 'Logged in successfully', username });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Example of an Express route handler to fetch user data based on username
app.get('/api/userData', async (req, res) => {
  const { username } = req.query;

  if (!username) {
    return res.status(400).json({ message: "Username is required" });
  }

  try {
    const user = await User.findOne({ username }).select(
      "role overallBloodDonations locationDonations plasmaDonations vouchers uniqueId address phonenumber"
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Error fetching user data:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});
app.get('/api/donors', async (req, res) => {
  try {
    const donors = await User.find({ role: "Donor" }); // Make sure the role is "Donor" (case sensitive)
    res.json(donors);
  } catch (error) {
    console.error('Error fetching donors:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
let bloodData = [
  { region: 'Downtown', hospital: 'City Hospital', bloodType: 'A+', unitsAvailable: 10 },
  { region: 'Uptown', hospital: 'Greenfield Hospital', bloodType: 'O-', unitsAvailable: 5 },
  { region: 'Midtown', hospital: 'Riverbend Medical', bloodType: 'B+', unitsAvailable: 7 },
  { region: 'Westside', hospital: 'Pinewood Clinic', bloodType: 'O+', unitsAvailable: 8 },
];
// PUT route to update donor data
app.put('/api/donors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;

    const updatedDonor = await User.findByIdAndUpdate(id, updatedData, { new: true });
    res.json(updatedDonor);
  } catch (error) {
    console.error('Error updating donor:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
const notificationSchema = new mongoose.Schema({
  region: String,
  hospital: String,
  bloodType: String,
  patientName: String,
  phoneNumber: String,
  timestamp: { type: Date, default: Date.now },
});

// Create a model for notifications
const Notification = mongoose.model('Notification', notificationSchema);
app.post('/api/request-blood', async (req, res) => {
  const { region, hospital, bloodType, patientName, phoneNumber } = req.body;

  if (!region || !hospital || !bloodType || !patientName || !phoneNumber) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  // Simulate reducing the blood units available
  const bloodItem = bloodData.find(
    (item) => item.region === region && item.hospital === hospital && item.bloodType === bloodType
  );

  if (bloodItem && bloodItem.unitsAvailable > 0) {
    bloodItem.unitsAvailable -= 1;

    const message = `${patientName} has requested ${bloodType} blood type from ${hospital} in the ${region} region.`;

    try {
      // Save the notification to the database
      const notification = new Notification({
        region,
        hospital,
        bloodType,
        patientName,
        phoneNumber,
        message, // Store the message explicitly in the database
      });

      await notification.save();

      res.status(200).json({
        success: true,
        message: 'Blood request submitted successfully.',
        details: message,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to save notification.',
        error: error.message,
      });
    }
  } else {
    res.status(400).json({
      success: false,
      message: 'Blood type not available.',
    });
  }
});
app.get('/api/notifications', async (req, res) => {
  try {
    const notifications = await Notification.find();
    res.status(200).json({ notifications });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});
const transactionSchema = new mongoose.Schema({
  donorId: { type: mongoose.Schema.Types.ObjectId, ref: "Donor", required: true },
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: "Donor", required: true },
  proofUrl: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Transaction", transactionSchema);
const shareVoucher = async (req, res) => {
  try {
    const { donorId, recipientId, proofUrl } = req.body;

    // Validate input
    if (!donorId || !recipientId || !proofUrl) {
      return res.status(400).json({ success: false, message: "All fields are required." });
    }

    // Find the donor
    const donor = await Donor.findById(donorId);
    if (!donor) {
      return res.status(404).json({ success: false, message: "Donor not found." });
    }

    // Find the recipient
    const recipient = await Donor.findOne({ uniqueId: recipientId });
    if (!recipient) {
      return res.status(404).json({ success: false, message: "Recipient not found." });
    }

    // Share a voucher
    if (donor.vouchers > 0) {
      donor.vouchers -= 1;
      recipient.vouchers += 1;

      // Save the updated donor and recipient
      await donor.save();
      await recipient.save();

      // Log the transaction
      const transaction = new Transaction({
        donorId,
        recipientId,
        proofUrl,
        timestamp: new Date(),
      });

      await transaction.save();

      return res.status(200).json({ success: true, message: "Voucher shared successfully." });
    } else {
      return res.status(400).json({ success: false, message: "Insufficient vouchers." });
    }
  } catch (error) {
    console.error("Error sharing voucher:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
};

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
