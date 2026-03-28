const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('frontend'));

// Database connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'zamilpro',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';

// ========== AUTH ROUTES ==========// Register
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        // Validate input
        if (!username || !email || !password) {
            return res.status(400).json({ message: 'Missing required fields' });
        }
        
        const connection = await pool.getConnection();
        
        // Check if user exists
        const [rows] = await connection.query('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length > 0) {
            connection.release();
            return res.status(400).json({ message: 'Email already registered' });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Insert user
        await connection.query('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', 
            [username, email, hashedPassword]);
        
        connection.release();
        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ message: 'Missing credentials' });
        }
        
        const connection = await pool.getConnection();
        
        // Get user
        const [rows] = await connection.query('SELECT * FROM users WHERE username = ?', [username]);
        
        if (rows.length === 0) {
            connection.release();
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        
        const user = rows[0];
        
        // Check password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            connection.release();
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        
        connection.release();
        
        // Generate JWT
        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ message: 'Login successful', token });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// ========== PRODUCT ROUTES ==========// Get all products
app.get('/api/products', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [products] = await connection.query('SELECT * FROM products');
        connection.release();
        
        res.json(products);
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get product by ID
app.get('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const connection = await pool.getConnection();
        const [products] = await connection.query('SELECT * FROM products WHERE id = ?', [id]);
        connection.release();
        
        if (products.length === 0) {
            return res.status(404).json({ message: 'Product not found' });
        }
        
        res.json(products[0]);
    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Create product (Admin only)
app.post('/api/products', async (req, res) => {
    try {
        const { name, description, price, stock } = req.body;
        
        if (!name || !price || stock === undefined) {
            return res.status(400).json({ message: 'Missing required fields' });
        }
        
        const connection = await pool.getConnection();
        await connection.query('INSERT INTO products (name, description, price, stock) VALUES (?, ?, ?, ?)', 
            [name, description, price, stock]);
        connection.release();
        
        res.status(201).json({ message: 'Product created successfully' });
    } catch (error) {
        console.error('Error creating product:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// ========== ORDER ROUTES ==========// Create order
app.post('/api/orders', async (req, res) => {
    try {
        const { userId, items, total } = req.body;
        
        if (!userId || !items || !total) {
            return res.status(400).json({ message: 'Missing required fields' });
        }
        
        const connection = await pool.getConnection();
        
        // Create order
        const [result] = await connection.query('INSERT INTO orders (user_id, total, status) VALUES (?, ?, ?)', 
            [userId, total, 'pending']);
        
        const orderId = result.insertId;
        
        connection.release();
        res.status(201).json({ message: 'Order created', orderId });
    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get user orders
app.get('/api/orders/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const connection = await pool.getConnection();
        const [orders] = await connection.query('SELECT * FROM orders WHERE user_id = ?', [userId]);
        connection.release();
        
        res.json(orders);
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// ========== ERROR HANDLING ==========app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});