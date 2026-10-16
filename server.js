const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/data', express.static(path.join(__dirname, 'data')));

// File paths
const PRODUCTS_FILE = path.join(__dirname, 'data', 'products.json');
const REVIEWS_FILE = path.join(__dirname, 'data', 'reviews.json');
const ORDERS_FILE = path.join(__dirname, 'data', 'orders.json');

// Helper functions for reading/writing data
function readJSON(file, defaultVal = []) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(defaultVal, null, 2), 'utf8');
      return defaultVal;
    }
    const data = fs.readFileSync(file, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error reading ${file}:`, err);
    return defaultVal;
  }
}

function writeJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`Error writing ${file}:`, err);
    return false;
  }
}

// 1. GET /api/categories - summary of available categories
app.get('/api/categories', (req, res) => {
  const products = readJSON(PRODUCTS_FILE);
  const counts = { all: products.length };
  
  products.forEach(p => {
    counts[p.category] = (counts[p.category] || 0) + 1;
  });

  const categories = [
    { id: 'all', label: 'All Products', count: counts.all },
    { id: 'audio', label: 'Audio & Sound', count: counts.audio || 0 },
    { id: 'wearables', label: 'Wearables & Health', count: counts.wearables || 0 },
    { id: 'computing', label: 'Computing & Displays', count: counts.computing || 0 },
    { id: 'gaming', label: 'Gaming & VR', count: counts.gaming || 0 },
    { id: 'smart-home', label: 'Drones & Smart Tech', count: counts['smart-home'] || 0 }
  ];

  res.json({ success: true, categories });
});

// 2. GET /api/products - multi-faceted search, filter, and sort
app.get('/api/products', (req, res) => {
  let products = readJSON(PRODUCTS_FILE);
  const { category, search, minPrice, maxPrice, minRating, sort, trending, featured } = req.query;

  // Filter by category
  if (category && category !== 'all') {
    products = products.filter(p => p.category.toLowerCase() === category.toLowerCase());
  }

  // Filter by search keyword
  if (search && search.trim() !== '') {
    const q = search.toLowerCase().trim();
    products = products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.tagline.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      (p.features && p.features.some(f => f.toLowerCase().includes(q))) ||
      p.category.toLowerCase().includes(q)
    );
  }

  // Filter by price range
  if (minPrice) {
    products = products.filter(p => p.price >= parseFloat(minPrice));
  }
  if (maxPrice) {
    products = products.filter(p => p.price <= parseFloat(maxPrice));
  }

  // Filter by rating
  if (minRating) {
    products = products.filter(p => p.rating >= parseFloat(minRating));
  }

  // Filter by trending / featured
  if (trending === 'true') {
    products = products.filter(p => p.isTrending);
  }
  if (featured === 'true') {
    products = products.filter(p => p.isFeatured);
  }

  // Dynamic Sorting
  switch (sort) {
    case 'price-asc':
      products.sort((a, b) => a.price - b.price);
      break;
    case 'price-desc':
      products.sort((a, b) => b.price - a.price);
      break;
    case 'rating-desc':
      products.sort((a, b) => b.rating - a.rating);
      break;
    case 'discount-desc':
      products.sort((a, b) => (b.discountPercent || 0) - (a.discountPercent || 0));
      break;
    case 'name-asc':
      products.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'featured':
    default:
      products.sort((a, b) => (b.isFeatured ? 1 : 0) - (a.isFeatured ? 1 : 0));
      break;
  }

  res.json({
    success: true,
    total: products.length,
    products
  });
});

// 3. GET /api/products/:id - single product details
app.get('/api/products/:id', (req, res) => {
  const products = readJSON(PRODUCTS_FILE);
  const product = products.find(p => p.id === req.params.id);

  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }

  // Attach reviews for this product
  const reviews = readJSON(REVIEWS_FILE).filter(r => r.productId === req.params.id);

  res.json({
    success: true,
    product: {
      ...product,
      reviews
    }
  });
});

// 4. GET /api/products/:id/reviews - fetch customer reviews
app.get('/api/products/:id/reviews', (req, res) => {
  const reviews = readJSON(REVIEWS_FILE).filter(r => r.productId === req.params.id);
  res.json({ success: true, total: reviews.length, reviews });
});

// 4b. GET /api/featured-reviews - featured customer reviews for homepage
app.get('/api/featured-reviews', (req, res) => {
  const reviews = readJSON(REVIEWS_FILE).slice(0, 3);
  res.json({ success: true, total: reviews.length, reviews });
});

// 5. POST /api/products/:id/reviews - submit new review
app.post('/api/products/:id/reviews', (req, res) => {
  const { author, rating, title, comment } = req.body;
  const productId = req.params.id;

  if (!author || !rating || !comment) {
    return res.status(400).json({ success: false, message: 'Author, rating, and comment are required.' });
  }

  const products = readJSON(PRODUCTS_FILE);
  const productIndex = products.findIndex(p => p.id === productId);

  if (productIndex === -1) {
    return res.status(404).json({ success: false, message: 'Product not found.' });
  }

  const reviews = readJSON(REVIEWS_FILE);
  const newReview = {
    id: 'rev-' + Date.now(),
    productId,
    author: author.trim(),
    rating: Math.min(5, Math.max(1, parseInt(rating, 10))),
    date: new Date().toISOString().split('T')[0],
    verified: true,
    title: (title || 'Great Product').trim(),
    comment: comment.trim()
  };

  reviews.unshift(newReview);
  writeJSON(REVIEWS_FILE, reviews);

  // Recalculate average rating for product
  const productReviews = reviews.filter(r => r.productId === productId);
  const avg = productReviews.reduce((sum, r) => sum + r.rating, 0) / productReviews.length;
  products[productIndex].rating = parseFloat(avg.toFixed(1));
  products[productIndex].reviewCount = productReviews.length;
  writeJSON(PRODUCTS_FILE, products);

  res.status(201).json({
    success: true,
    message: 'Review posted successfully!',
    review: newReview,
    updatedRating: products[productIndex].rating,
    reviewCount: products[productIndex].reviewCount
  });
});

// 6. POST /api/coupons/validate - validate coupon codes
app.post('/api/coupons/validate', (req, res) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ success: false, message: 'Coupon code is required.' });
  }

  const normalized = code.trim().toUpperCase();
  const coupons = {
    TECH20: { discountPercent: 20, type: 'percent', label: '20% Off All Flagship Tech' },
    CYBER15: { discountPercent: 15, type: 'percent', label: '15% Off Cyber Deals' },
    NEXUS10: { discountPercent: 10, type: 'percent', label: '10% Off New Customers' },
    FREESHIP: { freeShipping: true, type: 'shipping', label: 'Free Express Courier Shipping' }
  };

  const coupon = coupons[normalized];
  if (coupon) {
    res.json({
      success: true,
      valid: true,
      code: normalized,
      coupon
    });
  } else {
    res.status(404).json({
      success: false,
      valid: false,
      message: 'Invalid or expired promotional code. Try TECH20 or CYBER15.'
    });
  }
});

// 7. POST /api/checkout - process simulated order
app.post('/api/checkout', (req, res) => {
  const { items, customer, shippingMethod, payment, promoCode } = req.body;

  if (!items || !items.length) {
    return res.status(400).json({ success: false, message: 'Cart items are required.' });
  }
  if (!customer || !customer.name || !customer.email || !customer.address) {
    return res.status(400).json({ success: false, message: 'Complete customer details required.' });
  }

  // Calculate pricing
  const products = readJSON(PRODUCTS_FILE);
  let subtotal = 0;
  const processedItems = [];

  for (const item of items) {
    const product = products.find(p => p.id === item.productId);
    if (product) {
      const variant = product.variants ? product.variants.find(v => v.id === item.variantId) : null;
      const priceDelta = variant ? variant.priceDelta : 0;
      const unitPrice = product.price + priceDelta;
      const quantity = Math.max(1, parseInt(item.quantity || 1, 10));
      const lineTotal = unitPrice * quantity;

      subtotal += lineTotal;
      processedItems.push({
        productId: product.id,
        name: product.name,
        image: product.image,
        variantName: variant ? variant.name : 'Standard',
        unitPrice,
        quantity,
        lineTotal: parseFloat(lineTotal.toFixed(2))
      });
    }
  }

  // Shipping calculation
  let shippingCost = 0;
  let shippingTitle = 'Standard Ground';
  let estimatedDays = '3 - 5 Business Days';

  if (shippingMethod === 'express') {
    shippingCost = 14.99;
    shippingTitle = 'Express Air Priority';
    estimatedDays = '1 - 2 Business Days';
  } else if (shippingMethod === 'overnight') {
    shippingCost = 29.99;
    shippingTitle = 'Overnight Quantum Courier';
    estimatedDays = 'Next Business Day';
  } else {
    // Free standard over $99
    shippingCost = subtotal >= 99 ? 0 : 9.99;
    shippingTitle = subtotal >= 99 ? 'Free Standard Ground' : 'Standard Ground';
    estimatedDays = '3 - 5 Business Days';
  }

  // Discount calculation
  let discountAmount = 0;
  if (promoCode) {
    const code = promoCode.trim().toUpperCase();
    if (code === 'TECH20') discountAmount = subtotal * 0.20;
    else if (code === 'CYBER15') discountAmount = subtotal * 0.15;
    else if (code === 'NEXUS10') discountAmount = subtotal * 0.10;
    else if (code === 'FREESHIP') shippingCost = 0;
  }

  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const tax = taxableAmount * 0.0825; // 8.25% estimated tax
  const total = taxableAmount + shippingCost + tax;

  // Generate unique Order ID
  const orderId = 'NX-' + Math.floor(100000 + Math.random() * 900000);
  const orderDate = new Date().toISOString();

  // Create order object
  const newOrder = {
    id: orderId,
    date: orderDate,
    status: 'Confirmed',
    customer: {
      name: customer.name,
      email: customer.email,
      phone: customer.phone || 'N/A',
      address: customer.address,
      city: customer.city,
      state: customer.state || '',
      zip: customer.zip,
      country: customer.country || 'USA'
    },
    shipping: {
      method: shippingTitle,
      estimatedDelivery: estimatedDays,
      cost: parseFloat(shippingCost.toFixed(2))
    },
    payment: {
      method: payment?.method || 'Credit Card',
      cardLast4: payment?.cardNumber ? payment.cardNumber.slice(-4) : '4242',
      status: 'Paid (Simulated)'
    },
    items: processedItems,
    summary: {
      subtotal: parseFloat(subtotal.toFixed(2)),
      discount: parseFloat(discountAmount.toFixed(2)),
      promoCode: promoCode ? promoCode.toUpperCase() : null,
      shipping: parseFloat(shippingCost.toFixed(2)),
      tax: parseFloat(tax.toFixed(2)),
      total: parseFloat(total.toFixed(2))
    }
  };

  const orders = readJSON(ORDERS_FILE);
  orders.unshift(newOrder);
  writeJSON(ORDERS_FILE, orders);

  res.status(201).json({
    success: true,
    message: 'Order processed successfully!',
    order: newOrder
  });
});

// 8. GET /api/orders/:id - lookup order receipt
app.get('/api/orders/:id', (req, res) => {
  const orders = readJSON(ORDERS_FILE);
  const order = orders.find(o => o.id === req.params.id);

  if (!order) {
    return res.status(404).json({ success: false, message: 'Order receipt not found.' });
  }

  res.json({ success: true, order });
});

// Fallback to index.html for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`⚡ NexusGear E-Commerce Server is running at http://localhost:${PORT}`);
});
