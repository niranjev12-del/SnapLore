const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { createClient } = require("redis");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const redis = createClient({
    url: process.env.REDIS_URL
});

redis.on("error", (err) => {
    console.error("Redis Error:", err);
});

/* =========================
   DEFAULT PRODUCTS
   ========================= */

const defaultProducts = [
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

/* =========================
   PRODUCT FUNCTIONS
   ========================= */

async function getProducts() {
    const data = await redis.get("products");

    if (!data) {
        return [];
    }

    try {
        const products = JSON.parse(data);
        return Array.isArray(products) ? products : [];
    } catch (error) {
        console.error("Invalid products data:", error);
        return [];
    }
}

async function saveProducts(products) {
    await redis.set(
        "products",
        JSON.stringify(products)
    );
}

/* =========================
   GET PRODUCTS
   ========================= */

app.get("/api/products", async (req, res) => {
    try {
        const products = await getProducts();

        res.json(products);

    } catch (error) {

        console.error(
            "Get products error:",
            error
        );

        res.status(500).json({
            error: "Could not load products"
        });
    }
});

/* =========================
   ADD PRODUCT
   ========================= */

app.post("/api/products", async (req, res) => {

    try {

        const {
            name,
            price,
            category,
            image
        } = req.body;

        if (
            !name ||
            price === undefined ||
            !category ||
            !image
        ) {

            return res.status(400).json({
                error:
                    "Name, price, category and image are required"
            });
        }

        const numericPrice = Number(price);

        if (
            !Number.isFinite(numericPrice) ||
            numericPrice < 0
        ) {

            return res.status(400).json({
                error:
                    "Price must be a valid number"
            });
        }

        const products = await getProducts();

        let newId = 1;

        if (products.length > 0) {

            newId =
                Math.max(
                    ...products.map(
                        product =>
                            Number(product.id) || 0
                    )
                ) + 1;
        }

        const newProduct = {

            id: newId,

            name: String(name).trim(),

            price: numericPrice,

            category:
                String(category)
                    .trim()
                    .toLowerCase(),

            image:
                String(image).trim()
        };

        products.push(newProduct);

        await saveProducts(products);

        res.status(201).json({

            success: true,

            message:
                "Product added successfully",

            product: newProduct
        });

    } catch (error) {

        console.error(
            "Add product error:",
            error
        );

        res.status(500).json({
            error: "Could not add product"
        });
    }
});

/* =========================
   DELETE PRODUCT
   ========================= */

app.delete(
    "/api/products/:id",
    async (req, res) => {

        try {

            const id =
                Number(req.params.id);

            if (!Number.isFinite(id)) {

                return res.status(400).json({
                    error:
                        "Invalid product ID"
                });
            }

            const products =
                await getProducts();

            const exists =
                products.some(
                    product =>
                        Number(product.id) === id
                );

            if (!exists) {

                return res.status(404).json({
                    error:
                        "Product not found"
                });
            }

            const updatedProducts =
                products.filter(
                    product =>
                        Number(product.id) !== id
                );

            await saveProducts(
                updatedProducts
            );

            res.json({

                success: true,

                message:
                    "Product deleted successfully"
            });

        } catch (error) {

            console.error(
                "Delete product error:",
                error
            );

            res.status(500).json({
                error:
                    "Could not delete product"
            });
        }
    }
);

/* =========================
   SAVE ORDER
   ========================= */

app.post("/api/orders", async (req, res) => {

    try {

        const order = req.body;

        if (
            !order.name ||
            !order.email ||
            !order.phone ||
            !order.address
        ) {

            return res.status(400).json({
                error:
                    "Missing customer details"
            });
        }

        const orderId =
            `order:${Date.now()}`;

        const orderData = {

            id: orderId,

            name: order.name,

            email: order.email,

            phone: order.phone,

            address: order.address,

            paymentMethod:
                order.paymentMethod || "",

            items:
                order.items || [],

            total:
                order.total || 0,

            createdAt:
                new Date().toISOString()
        };

        await redis.set(
            orderId,
            JSON.stringify(orderData)
        );

        res.json({

            success: true,

            orderId: orderId
        });

    } catch (error) {

        console.error(
            "Order error:",
            error
        );

        res.status(500).json({

            error:
                "Could not save order"
        });
    }
});

/* =========================
   GET ORDERS
   ========================= */

app.get("/api/orders", async (req, res) => {

    try {

        const keys =
            await redis.keys("order:*");

        const orders = [];

        for (const key of keys) {

            const data =
                await redis.get(key);

            if (data) {

                try {

                    orders.push(
                        JSON.parse(data)
                    );

                } catch (error) {

                    console.error(
                        `Invalid order: ${key}`
                    );
                }
            }
        }

        orders.sort(
            (a, b) =>
                new Date(
                    b.createdAt || 0
                ) -
                new Date(
                    a.createdAt || 0
                )
        );

        res.json(orders);

    } catch (error) {

        console.error(
            "Get orders error:",
            error
        );

        res.status(500).json({

            error:
                "Could not load orders"
        });
    }
});

/* =========================
   START SERVER
   ========================= */

async function startServer() {

    try {

        if (!process.env.REDIS_URL) {

            throw new Error(
                "REDIS_URL is missing. Add REDIS_URL in Render Environment Variables."
            );
        }

        await redis.connect();

        console.log(
            "Connected to Redis!"
        );

        /*
          IMPORTANT:
          Only create the original products
          when Redis does not already have
          a products key.
        */

        const existingProducts =
            await redis.get("products");

        if (!existingProducts) {

            await saveProducts(
                defaultProducts
            );

            console.log(
                "Default products saved to Redis"
            );

        } else {

            console.log(
                "Existing products found. Keeping them."
            );
        }

        app.listen(
            PORT,
            () => {

                console.log(
                    `SnapLore running on port ${PORT}`
                );
            }
        );

    } catch (error) {

        console.error(
            "Server startup error:",
            error
        );

        process.exit(1);
    }
}

startServer();
