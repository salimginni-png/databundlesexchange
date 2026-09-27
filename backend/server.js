const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

// =============================================
// CONFIGURATION - FROM ENVIRONMENT VARIABLES
// =============================================
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8912556480:AAF_m34R8vT5GUwhsx29qPW854OOXnl5FfY';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '8313270294';
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
const TEST_MODE = false;

// =============================================
// PAYSTACK - READ FROM ENVIRONMENT
// =============================================
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_API = 'https://api.paystack.co';

// =============================================
// CORS - NEW URLS ONLY
// =============================================
app.use(cors({
    origin: [
        'https://databundlesexchange-hkp7.onrender.com',
        'https://databundlesexchange-production-86f4.up.railway.app',
        'http://localhost:5500',
        'http://127.0.0.1:5500'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    credentials: true
}));

app.options('*', cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =============================================
// LOGGING
// =============================================
app.use((req, res, next) => {
    console.log(`📥 ${req.method} ${req.path}`);
    if (req.path !== '/api/paystack/webhook') {
        console.log('📦 Body:', req.body);
    }
    console.log('🌐 Origin:', req.headers.origin);
    next();
});

// =============================================
// TELEGRAM
// =============================================
async function sendToTelegram(message) {
    if (TEST_MODE) {
        console.log('📨 [TEST MODE] Would send to Telegram:', message);
        return { ok: true };
    }
    try {
        const response = await axios.post(TELEGRAM_API_URL, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'HTML'
        });
        console.log('✅ Telegram message sent successfully!');
        return response.data;
    } catch (error) {
        console.error('❌ Error sending to Telegram:', error.response?.data || error.message);
        return { ok: false };
    }
}

// =============================================
// FORMAT MESSAGES
// =============================================
function formatVendorRegistration(data) {
    return `
🎉 <b>NEW VENDOR REGISTRATION (PAID)!</b>

👤 <b>Full Name:</b> ${data.fullName}
📱 <b>Phone:</b> ${data.phone}
📧 <b>Email:</b> ${data.email}
🏪 <b>Business Name:</b> ${data.business}
📦 <b>Trade Type:</b> ${data.tradeType}
📡 <b>Network:</b> ${data.network}
🎂 <b>Date of Birth:</b> ${data.dob}
🏠 <b>Hometown:</b> ${data.hometown}
📢 <b>Subscribe to HDS Ads:</b> ${data.subscribeHDS ? '✅ YES' : '❌ NO'}

💳 <b>PAYMENT CONFIRMED</b>
💰 <b>Amount:</b> GHS 100.00
🔖 <b>Reference:</b> ${data.reference}

⏰ <b>Time:</b> ${new Date().toLocaleString()}
    `;
}

function formatPersonalPurchase(data) {
    return `
🛒 <b>NEW PERSONAL USER PURCHASE (PAID)!</b>

📦 <b>Package:</b> ${data.package}
💰 <b>Amount:</b> ${data.price}
📱 <b>Phone:</b> ${data.phone}

💳 <b>PAYMENT CONFIRMED</b>
🔖 <b>Reference:</b> ${data.reference}

⏰ <b>Time:</b> ${new Date().toLocaleString()}
    `;
}

function formatPurchase(data) {
    return `
🛒 <b>NEW AGENT PURCHASE (PAID)!</b>

📦 <b>Package:</b> ${data.package}
💰 <b>Amount:</b> ${data.price}
📱 <b>Phone:</b> ${data.phone}

💳 <b>PAYMENT CONFIRMED</b>
🔖 <b>Reference:</b> ${data.reference}

⏰ <b>Time:</b> ${new Date().toLocaleString()}
    `;
}

function formatRecharge(data) {
    return `
💰 <b>NEW RECHARGE (PAID)!</b>

📦 <b>Package:</b> ${data.package}
💰 <b>Amount:</b> ${data.price}
📱 <b>Phone:</b> ${data.phone}

💳 <b>PAYMENT CONFIRMED</b>
🔖 <b>Reference:</b> ${data.reference}

⏰ <b>Time:</b> ${new Date().toLocaleString()}
    `;
}

// =============================================
// PENDING PAYMENTS STORAGE
// =============================================
const pendingPayments = {};

// Helper to convert GHS to pesewas
function toPesewas(ghs) {
    return Math.round(parseFloat(ghs) * 100);
}

// =============================================
// API ENDPOINTS
// =============================================

app.get('/', (req, res) => {
    res.json({
        status: '✅ Bundle Bazaar API is running!',
        port: PORT,
        testMode: TEST_MODE,
        telegramBot: '✅ Connected',
        paystack: PAYSTACK_SECRET_KEY ? '✅ Connected' : '❌ Missing Secret Key',
        endpoints: [
            'POST /api/register-vendor/init',
            'POST /api/personal-purchase/init',
            'POST /api/purchase/init',
            'POST /api/recharge/init',
            'POST /api/paystack/webhook',
            'GET /api/paystack/verify/:reference',
            'GET /api/health'
        ]
    });
});

app.get('/api/health', (req, res) => {
    res.json({ status: '✅ Healthy', port: PORT, timestamp: new Date().toISOString() });
});

// =============================================
// 1. VENDOR REGISTRATION INIT
// =============================================
app.post('/api/register-vendor/init', async (req, res) => {
    try {
        const { fullName, phone, email, business, tradeType, network, dob, hometown, subscribeHDS } = req.body;

        if (!fullName || !phone || !email || !business || !tradeType || !network || !dob || !hometown) {
            return res.status(400).json({ success: false, message: '❌ All fields are required!' });
        }
        if (phone.length < 10 || !/^\d+$/.test(phone)) {
            return res.status(400).json({ success: false, message: '❌ Please enter a valid phone number' });
        }
        if (!email.includes('@') || !email.includes('.')) {
            return res.status(400).json({ success: false, message: '❌ Please enter a valid email address' });
        }

        const reference = 'REG-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9).toUpperCase();

        pendingPayments[reference] = {
            type: 'vendor-registration',
            amount: 10000,
            data: { fullName, phone, email, business, tradeType, network, dob, hometown, subscribeHDS: subscribeHDS || false },
            createdAt: Date.now()
        };

        console.log('✅ Registration initialized:', reference);

        res.json({
            success: true,
            reference: reference,
            amount: 10000,
            email: email,
            message: '✅ Ready for payment'
        });

    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ success: false, message: '❌ Failed to process registration.' });
    }
});

// =============================================
// 2. PERSONAL USER PURCHASE INIT
// =============================================
app.post('/api/personal-purchase/init', async (req, res) => {
    try {
        const { package: packageName, price, phone } = req.body;

        if (!packageName || !price || !phone) {
            return res.status(400).json({ success: false, message: '❌ All fields are required!' });
        }
        if (phone.length < 10 || !/^\d+$/.test(phone)) {
            return res.status(400).json({ success: false, message: '❌ Please enter a valid phone number' });
        }

        const reference = 'PERS-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9).toUpperCase();
        const amountInPesewas = toPesewas(price);

        pendingPayments[reference] = {
            type: 'personal-purchase',
            amount: amountInPesewas,
            data: { package: packageName, price: price, phone: phone },
            createdAt: Date.now()
        };

        console.log('✅ Personal purchase initialized:', reference);

        res.json({
            success: true,
            reference: reference,
            amount: amountInPesewas,
            email: phone + '@bundlebazaar.com',
            message: '✅ Ready for payment'
        });

    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ success: false, message: '❌ Failed to process purchase.' });
    }
});

// =============================================
// 3. AGENT PURCHASE INIT
// =============================================
app.post('/api/purchase/init', async (req, res) => {
    try {
        const { package: packageName, price, phone } = req.body;

        if (!packageName || !price || !phone) {
            return res.status(400).json({ success: false, message: '❌ All fields are required!' });
        }
        if (phone.length < 10 || !/^\d+$/.test(phone)) {
            return res.status(400).json({ success: false, message: '❌ Please enter a valid phone number' });
        }

        const reference = 'AGENT-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9).toUpperCase();
        const amountInPesewas = toPesewas(price);

        pendingPayments[reference] = {
            type: 'agent-purchase',
            amount: amountInPesewas,
            data: { package: packageName, price: price, phone: phone },
            createdAt: Date.now()
        };

        console.log('✅ Agent purchase initialized:', reference);

        res.json({
            success: true,
            reference: reference,
            amount: amountInPesewas,
            email: phone + '@bundlebazaar.com',
            message: '✅ Ready for payment'
        });

    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ success: false, message: '❌ Failed to process purchase.' });
    }
});

// =============================================
// 4. RECHARGE INIT
// =============================================
app.post('/api/recharge/init', async (req, res) => {
    try {
        const { package: packageName, price, phone } = req.body;

        if (!packageName || !price || !phone) {
            return res.status(400).json({ success: false, message: '❌ All fields are required!' });
        }
        if (phone.length < 10 || !/^\d+$/.test(phone)) {
            return res.status(400).json({ success: false, message: '❌ Please enter a valid phone number' });
        }

        const reference = 'RECH-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9).toUpperCase();
        const amountInPesewas = toPesewas(price);

        pendingPayments[reference] = {
            type: 'recharge',
            amount: amountInPesewas,
            data: { package: packageName, price: price, phone: phone },
            createdAt: Date.now()
        };

        console.log('✅ Recharge initialized:', reference);

        res.json({
            success: true,
            reference: reference,
            amount: amountInPesewas,
            email: phone + '@bundlebazaar.com',
            message: '✅ Ready for payment'
        });

    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ success: false, message: '❌ Failed to process recharge.' });
    }
});

// =============================================
// 5. PAYSTACK WEBHOOK
// =============================================
app.post('/api/paystack/webhook', async (req, res) => {
    try {
        const event = req.body;

        console.log('📥 Paystack webhook received:', event.event);

        if (event.event === 'charge.success') {
            const reference = event.data.reference;
            const amount = event.data.amount;
            const status = event.data.status;

            console.log('💰 Payment success:', reference, amount, status);

            if (status === 'success') {
                const pending = pendingPayments[reference];

                if (pending && amount >= pending.amount) {
                    let telegramMessage = '';

                    if (pending.type === 'vendor-registration') {
                        telegramMessage = formatVendorRegistration({ ...pending.data, reference: reference });
                    } else if (pending.type === 'personal-purchase') {
                        telegramMessage = formatPersonalPurchase({ ...pending.data, reference: reference });
                    } else if (pending.type === 'agent-purchase') {
                        telegramMessage = formatPurchase({ ...pending.data, reference: reference });
                    } else if (pending.type === 'recharge') {
                        telegramMessage = formatRecharge({ ...pending.data, reference: reference });
                    }

                    if (telegramMessage) {
                        await sendToTelegram(telegramMessage);
                        console.log('✅ Telegram sent for:', reference);
                    }

                    delete pendingPayments[reference];
                } else {
                    console.log('⚠️ No pending payment or amount mismatch for:', reference);
                }
            }
        }

        res.sendStatus(200);

    } catch (error) {
        console.error('❌ Webhook error:', error);
        res.sendStatus(200);
    }
});

// =============================================
// 6. VERIFY PAYMENT
// =============================================
app.get('/api/paystack/verify/:reference', async (req, res) => {
    try {
        const { reference } = req.params;

        if (!PAYSTACK_SECRET_KEY) {
            return res.status(500).json({ success: false, message: '❌ Paystack secret key not configured' });
        }

        const response = await axios.get(
            `${PAYSTACK_API}/transaction/verify/${reference}`,
            { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } }
        );

        const data = response.data;

        if (data.status && data.data.status === 'success') {
            res.json({
                success: true,
                status: 'success',
                amount: data.data.amount,
                reference: reference
            });
        } else {
            res.json({ success: false, status: data.data?.status || 'pending' });
        }

    } catch (error) {
        console.error('❌ Verify error:', error.response?.data || error.message);
        res.status(500).json({ success: false, message: '❌ Verification failed' });
    }
});

// =============================================
// 404
// =============================================
app.use((req, res) => {
    res.status(404).json({ success: false, message: '❌ Endpoint not found', path: req.path });
});

// =============================================
// START
// =============================================
app.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(50));
    console.log(`🚀 Bundle Bazaar Backend running on port ${PORT}`);
    console.log(`🤖 Telegram Bot: ✅ Configured`);
    console.log(`💰 Paystack: ${PAYSTACK_SECRET_KEY ? '✅ Connected (LIVE)' : '❌ MISSING SECRET KEY'}`);
    console.log('='.repeat(50));
});
