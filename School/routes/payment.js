const express = require('express');
const router = express.Router();
let Razorpay, razorpay;
const crypto = require('crypto');

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

if (keyId && keySecret) {
    Razorpay = require('razorpay');
    razorpay = new Razorpay({
        key_id: keyId,
        key_secret: keySecret
    });
}

// Middleware to check if Razorpay is configured
function checkRazorpayConfigured(req, res, next) {
    if (!razorpay) {
        return res.status(503).json({ error: 'Razorpay is not configured on this server.' });
    }
    next();
}

// Create order
router.post('/create-order', checkRazorpayConfigured, async (req, res) => {
    try {
        const { amount, plan } = req.body;
        
        const options = {
            amount: amount * 100, // amount in smallest currency unit (paise)
            currency: "INR",
            receipt: `receipt_${Date.now()}`,
            notes: {
                plan: plan
            }
        };

        const order = await razorpay.orders.create(options);
        res.json(order);
    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({ error: 'Error creating order' });
    }
});

// Verify payment
router.post('/verify-payment', checkRazorpayConfigured, async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            plan
        } = req.body;

        // Verify signature
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac("sha256", keySecret)
            .update(body.toString())
            .digest("hex");

        const isAuthentic = expectedSignature === razorpay_signature;

        if (isAuthentic) {
            // Update subscription in database
            const db = req.app.locals.db;
            await db.collection('subscriptions').updateOne(
                { username: req.session.username },
                {
                    $set: {
                        plan: plan,
                        status: 'active',
                        startDate: new Date(),
                        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
                        paymentId: razorpay_payment_id,
                        orderId: razorpay_order_id
                    }
                },
                { upsert: true }
            );

            res.json({
                success: true,
                message: 'Payment verified successfully'
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'Payment verification failed'
            });
        }
    } catch (error) {
        console.error('Error verifying payment:', error);
        res.status(500).json({ error: 'Error verifying payment' });
    }
});

module.exports = router; 