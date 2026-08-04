const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { createClient } = require("redis");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve website files
app.use(express.static(__dirname));

// Redis connection
const redis = createClient({
    url: process.env.REDIS_URL
});

redis.on("error", (err) => {
    console.error("Redis Error:", err);
});


// ==========================================
// GET PRODUCTS
// ==========================================

app.get("/api/products", async (req, res) => {
    try {
        const products = await redis.get("products");

        if (!products) {
            return res.json([]);
        }

        res.json(JSON.parse(products));

    } catch (error) {
        console.error("Products error:", error);

        res.status(500).json({
            error: error.message
        });
    }
});


// ==========================================
// SAVE ORDER
// ==========================================

app.post("/api/orders", async (req, res) => {
    try {
        const order = req.body;

        // Check customer details
        if (
            !order.name ||
            !order.email ||
            !order.phone ||
            !order.address
        ) {
            return res.status(400).json({
                error: "Missing customer details"
            });
        }

        // Create unique order ID
        const orderId = `order:${Date.now()}`;

        // Create order object
        const orderData = {
            id: orderId,
            name: order.name,
            email: order.email,
            phone: order.phone,
            address: order.address,
            paymentMethod: order.paymentMethod || "Not specified",
            items: order.items || [],
            total: order.total || 0,
            createdAt: new Date().toISOString()
        };

        // Save order in Redis
        await redis.set(
            orderId,
            JSON.stringify(orderData)
        );

        // Also add order ID to a Redis list
        await redis.lPush(
            "orders",
            orderId
        );

        console.log("New order saved:", orderId);

        // Send response to website
        res.json({
            success: true,
            orderId: orderId
        });

    } catch (error) {
        console.error("Order error:", error);

        res.status(500).json({
            error: "Could not save order"
        });
    }
});


// ==========================================
// GET ALL ORDERS
// ==========================================

app.get("/api/orders", async (req, res) => {
    try {
        // Get all order IDs
        const orderIds = await redis.lRange(
            "orders",
            0,
            -1
        );

        if (orderIds.length === 0) {
            return res.json([]);
        }

        // Get all orders from Redis
        const orders = await Promise.all(
            orderIds.map(async (orderId) => {

                const order = await redis.get(orderId);

                if (!order) {
                    return null;
                }

                return JSON.parse(order);
            })
        );

        // Remove empty orders
        const validOrders = orders.filter(
            (order) => order !== null
        );

        res.json(validOrders);

    } catch (error) {
        console.error("Get orders error:", error);

        res.status(500).json({
            error: "Could not load orders"
        });
    }
});


// ==========================================
// GET SINGLE ORDER
// ==========================================

app.get("/api/orders/:orderId", async (req, res) => {
    try {
        const orderId = req.params.orderId;

        const order = await redis.get(orderId);

        if (!order) {
            return res.status(404).json({
                error: "Order not found"
            });
        }

        res.json(JSON.parse(order));

    } catch (error) {
        console.error("Get single order error:", error);

        res.status(500).json({
            error: "Could not load order"
        });
    }
});


// ==========================================
// PRODUCTS
// ==========================================

const products = [
    {
        id: 1,
        name: "A4 Photo Frame",
        price: 399,
        category: "frames",
        image: "images/frame1.jpg"
    },
    {
        id: 2,
        name: "A6 Photo Frame",
        price: 199,
        category: "frames",
        image: "images/frame2.jpg"
    },
    {
        id: 3,
        name: "Rose Bouquet",
        price: 299,
        category: "bouquets",
        image: "images/rose.jpg"
    },
    {
        id: 4,
        name: "Birthday Hamper",
        price: 1199,
        category: "hampers",
        image: "images/birthday.jpg"
    }
];


// ==========================================
// SAVE PRODUCTS TO REDIS
// ==========================================

async function saveProducts() {

    const existing = await redis.get("products");

    if (!existing) {

        await redis.set(
            "products",
            JSON.stringify(products)
        );

        console.log("Products saved to Redis");

    } else {

        console.log("Products already exist in Redis");

    }
}


// ==========================================
// START SERVER
// ==========================================

async function main() {

    try {

        // Connect to Redis
        await redis.connect();

        console.log("Connected to Redis Cloud!");

        // Save products
        await saveProducts();

        // Start Express server
        app.listen(PORT, () => {

            console.log(
                `SnapLore running at http://localhost:${PORT}`
            );

            console.log(
                `Admin page: http://localhost:${PORT}/admin.html`
            );

        });

    } catch (error) {

        console.error(
            "Server startup error:",
            error
        );

    }
}

main();