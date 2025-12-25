const express = require('express');
const admin = require('firebase-admin');
const path = require('path');
const session = require('express-session');
const PDFDocument = require('pdfkit'); // PDF Library
const app = express();
const PORT = 3000;

app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'smart-lab-secret-key',
    resave: false,
    saveUninitialized: true
}));

const serviceAccount = require("./serviceAccountKey.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function isAuthenticated(req, res, next) {
    if (req.session.isLoggedIn) return next();
    res.redirect('/login');
}

// --- ROUTES ---

app.get('/login', (req, res) => {
    res.send(`
        <html>
        <head><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet"></head>
        <body class="d-flex align-items-center justify-content-center" style="height: 100vh; background: #f0f2f5;">
            <div class="card p-4 shadow" style="width: 350px;">
                <h3 class="text-center">Admin Login</h3>
                <form action="/login" method="POST">
                    <input type="text" name="username" placeholder="Username" class="form-control mb-2" required>
                    <input type="password" name="password" placeholder="Password" class="form-control mb-3" required>
                    <button class="btn btn-primary w-100">Login</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'lab123') {
        req.session.isLoggedIn = true;
        res.redirect('/users');
    } else {
        res.send("<script>alert('Wrong Credentials'); window.location='/login';</script>");
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/add-user', async (req, res) => {
    try {
        await db.collection('smart_users').add({
            name: req.body.userName,
            email: req.body.userEmail,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        res.send("<h1>Registration Successful!</h1><a href='/'>Go Back</a>");
    } catch (error) { res.status(500).send(error.message); }
});

// Users List with PDF Button
app.get('/users', isAuthenticated, async (req, res) => {
    const snapshot = await db.collection('smart_users').orderBy('createdAt', 'desc').get();
    let rows = '';
    snapshot.forEach(doc => {
        const data = doc.data();
        rows += `<tr>
            <td>${data.name}</td>
            <td>${data.email}</td>
            <td>
                <a href="/download-pdf/${doc.id}" class="btn btn-info btn-sm">PDF Report</a>
                <a href="/edit/${doc.id}" class="btn btn-warning btn-sm">Edit</a>
                <a href="/delete/${doc.id}" class="btn btn-danger btn-sm">Delete</a>
            </td>
        </tr>`;
    });

    res.send(`
        <html>
        <head><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet"></head>
        <body class="container p-5 text-center">
            <div class="d-flex justify-content-between mb-4">
                <h2>🔬 Smart-Lab User Dashboard</h2>
                <a href="/logout" class="btn btn-outline-danger">Logout</a>
            </div>
            <table class="table table-hover table-bordered shadow-sm">
                <thead class="table-dark"><tr><th>Name</th><th>Email</th><th>Actions</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
            <a href="/" class="btn btn-success">Add New Patient/User</a>
        </body>
        </html>
    `);
});

// --- PDF GENERATION ROUTE ---
app.get('/download-pdf/:id', isAuthenticated, async (req, res) => {
    try {
        const docSnap = await db.collection('smart_users').doc(req.params.id).get();
        if (!docSnap.exists) return res.send("User not found");
        
        const userData = docSnap.data();

        // PDF Create karein
        const doc = new PDFDocument();
        let filename = `Report-${userData.name}.pdf`;

        // HTTP Header set karein taaki browser ise download kare
        res.setHeader('Content-disposition', 'attachment; filename="' + filename + '"');
        res.setHeader('Content-type', 'application/pdf');

        doc.pipe(res);

        // PDF Content
        doc.fontSize(25).text('🔬 SMART-LAB REPORT', { align: 'center' });
        doc.moveDown();
        doc.fontSize(16).text(`Date: ${new Date().toLocaleDateString()}`);
        doc.text('------------------------------------------');
        doc.moveDown();
        doc.fontSize(14).text(`Patient Name: ${userData.name}`);
        doc.text(`Email Address: ${userData.email}`);
        doc.moveDown();
        doc.text('Status: Registered Successfully');
        doc.moveDown();
        doc.fontSize(10).text('Note: This is a computer generated report.', { align: 'center' });

        doc.end();

    } catch (error) { res.status(500).send(error.message); }
});

// Edit & Delete logic
app.get('/edit/:id', isAuthenticated, async (req, res) => {
    const doc = await db.collection('smart_users').doc(req.params.id).get();
    const data = doc.data();
    res.send(`<html><head><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet"></head>
    <body class="container p-5"><h3>Update User</h3>
    <form action="/update/${doc.id}" method="POST">
        <input name="userName" value="${data.name}" class="form-control mb-2">
        <input name="userEmail" value="${data.email}" class="form-control mb-2">
        <button class="btn btn-success">Update</button></form></body></html>`);
});

app.post('/update/:id', isAuthenticated, async (req, res) => {
    await db.collection('smart_users').doc(req.params.id).update({ name: req.body.userName, email: req.body.userEmail });
    res.redirect('/users');
});

app.get('/delete/:id', isAuthenticated, async (req, res) => {
    await db.collection('smart_users').doc(req.params.id).delete();
    res.redirect('/users');
});

app.listen(PORT, () => console.log(`Server: http://localhost:${PORT}`));