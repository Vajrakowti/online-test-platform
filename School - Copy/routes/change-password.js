const express = require('express');
const router = express.Router();

// This route handles serving the change password page
router.get('/', (req, res) => {
    res.sendFile('change-password.html', { root: './public' });
});

// This route handles the API request to change the password
router.post('/api', async (req, res) => {
    const { username, currentPassword, newPassword } = req.body;
    
    if (!username || !currentPassword || !newPassword) {
        return res.status(400).json({ 
            success: false, 
            message: 'All fields are required' 
        });
    }
    
    try {
        const dbo = req.app.locals.db;
        
        // First verify current credentials in the user table
        const user = await dbo.collection("user").findOne({ 
            Username: username, 
            Password: currentPassword 
        });
        
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid username or current password' 
            });
        }
        
        // Update password in the user table
        await dbo.collection("user").updateOne(
            { Username: username },
            { $set: { Password: newPassword } }
        );
        
        res.status(200).json({ 
            success: true, 
            message: 'Password updated successfully' 
        });
    } catch (err) {
        console.error('Error changing password:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Server error occurred. Please try again later.' 
        });
    }
});

module.exports = router; 