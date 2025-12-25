const express = require('express');
const admin = require('firebase-admin');
const path = require('path');
const session = require('express-session');
const PDFDocument = require('pdfkit');
const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'smart-lab-secret-key',
    resave: false,
    saveUninitialized: true
}));

// --- FIREBASE SETUP ---
try {
    let serviceAccount;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
        serviceAccount = require("./serviceAccountKey.json");
    }
    if (!admin.apps.length) {
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
} catch (error) {
    console.log("Firebase Error:", error.message);
}

const db = admin.firestore();

// --- ROUTES ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Admin Login
app.get('/login', (req, res) => {
    res.send(`
        <html><head><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet"></head>
        <body class="bg-light d-flex align-items-center" style="height:100vh">
            <div class="container" style="max-width:400px">
                <div class="card shadow p-4">
                    <h3 class="text-center text-primary">Admin Login</h3>
                    <form action="/login" method="POST">
                        <input type="text" name="username" placeholder="Username" class="form-control mb-3" required>
                        <input type="password" name="password" placeholder="Password" class="form-control mb-3" required>
                        <button class="btn btn-primary w-100">Login</button>
                    </form>
                </div>
            </div>
        </body></html>`);
});

app.post('/login', (req, res) => {
    if (req.body.username === 'admin' && req.body.password === 'lab123') {
        req.session.isLoggedIn = true;
        res.redirect('/users');
    } else {
        res.send("<script>alert('Invalid Details'); window.location='/login';</script>");
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Add Patient Logic
app.post('/add-user', async (req, res) => {
    try {
        await db.collection('smart_users').add({
            name: req.body.userName,
            email: req.body.userEmail,
            phone: req.body.userPhone,
            age: req.body.userAge,
            gender: req.body.userGender,
            test: req.body.userTest,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        res.send(`<html><body style="text-align:center; padding:50px; font-family:sans-serif;">
            <h1 style="color:green">✔️ Patient Registered!</h1>
            <a href="/" style="padding:10px 20px; background:blue; color:white; text-decoration:none; border-radius:5px;">Add Another</a>
            <a href="/login" style="margin-left:10px;">Go to Dashboard</a>
        </body></html>`);
    } catch (error) { res.status(500).send(error.message); }
});

// Patient List with Search
app.get('/users', async (req, res) => {
    if (!req.session.isLoggedIn) return res.redirect('/login');

    const searchQuery = req.query.search || '';
    const snapshot = await db.collection('smart_users').orderBy('createdAt', 'desc').get();
    
    let rows = '';
    snapshot.forEach(doc => {
        const data = doc.data();
        // Search Filter
        if (data.name.toLowerCase().includes(searchQuery.toLowerCase()) || data.phone.includes(searchQuery)) {
            rows += `<tr>
                <td>${data.name}</td>
                <td>${data.age} / ${data.gender}</td>
                <td>${data.phone}</td>
                <td><span class="badge bg-info text-dark">${data.test}</span></td>
                <td>
                    <a href="/download-pdf/${doc.id}" class="btn btn-sm btn-outline-primary">PDF</a>
                    <a href="/delete/${doc.id}" class="btn btn-sm btn-outline-danger" onclick="return confirm('Delete?')">Delete</a>
                </td>
            </tr>`;
        }
    });

    res.send(`
        <html><head><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet"></head>
        <body class="p-4 bg-light">
            <div class="container bg-white shadow p-4 rounded">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2>🔬 Smart-Lab Dashboard</h2>
                    <a href="/logout" class="btn btn-danger btn-sm">Logout</a>
                </div>
                <form action="/users" method="GET" class="d-flex mb-3">
                    <input type="text" name="search" value="${searchQuery}" class="form-control me-2" placeholder="Search by Name or Phone...">
                    <button class="btn btn-primary">Search</button>
                </form>
                <table class="table table-hover">
                    <thead class="table-dark"><tr><th>Name</th><th>Age/Sex</th><th>Phone</th><th>Test</th><th>Action</th></tr></thead>
                    <tbody>${rows || '<tr><td colspan="5" class="text-center">No Records Found</td></tr>'}</tbody>
                </table>
                <a href="/" class="btn btn-success mt-3">+ New Registration</a>
            </div>
        </body></html>`);
});

// Generate PDF Report
app.get('/download-pdf/:id', async (req, res) => {
    if (!req.session.isLoggedIn) return res.redirect('/login');
    const docSnap = await db.collection('smart_users').doc(req.params.id).get();
    const data = docSnap.data();
    
    const doc = new PDFDocument();
    res.setHeader('Content-disposition', `attachment; filename="Report-${data.name}.pdf"`);
    res.setHeader('Content-type', 'application/pdf');
    doc.pipe(res);
    
    doc.fontSize(22).text('SMART-LABORATORY REPORT', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Patient Name: ${data.name.toUpperCase()}`);
    doc.text(`Age/Gender: ${data.age} / ${data.gender}`);
    doc.text(`Phone: ${data.phone}`);
    doc.text(`Test Name: ${data.test}`);
    doc.moveDown();
    doc.text('-------------------------------------------');
    doc.text('RESULT: NORMAL (Dummy Data for now)');
    doc.moveDown();
    doc.fontSize(10).text('Generated by Smart-Lab Digital System', { align: 'center' });
    doc.end();
});

app.get('/delete/:id', async (req, res) => {
    if (!req.session.isLoggedIn) return res.redirect('/login');
    await db.collection('smart_users').doc(req.params.id).delete();
    res.redirect('/users');
});

app.listen(PORT, () => console.log(`Smart-Lab Live!`));