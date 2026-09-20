// A curated starter catalog of common Indian kirana/grocery products, for
// the "Import from catalog" picker in Inventory — lets a shop skip typing
// every item by hand. GST% and HSN are indicative defaults (4-digit HSN,
// which is what GSTR-1 requires below the ₹5cr turnover threshold most
// kirana shops sit under) — rates vary by exact product/packaging and
// change over time, so they're a starting point to verify, not gospel.
// Price is intentionally left out — that's shop- and region-specific and
// always set by the owner at import time.

export const CATALOG_CATEGORIES = [
  "Atta & Flour",
  "Rice",
  "Pulses",
  "Oil & Ghee",
  "Grocery & Spices",
  "Dairy",
  "Tea & Coffee",
  "Snacks",
  "Biscuits & Bakery",
  "Beverages",
  "Personal Care",
  "Household",
];

export const INDIAN_CATALOG = [
  // ---------- Atta & Flour ----------
  { name: "Aashirvaad Atta 5kg", hindi_name: "आटा", category: "Atta & Flour", unit: "pcs", gst: 5, hsn_code: "1101" },
  { name: "Aashirvaad Atta 10kg", hindi_name: "आटा", category: "Atta & Flour", unit: "pcs", gst: 5, hsn_code: "1101" },
  { name: "Fortune Chakki Atta 5kg", hindi_name: "आटा", category: "Atta & Flour", unit: "pcs", gst: 5, hsn_code: "1101" },
  { name: "Maida (Refined Flour)", hindi_name: "मैदा", category: "Atta & Flour", unit: "kg", gst: 5, hsn_code: "1101" },
  { name: "Besan (Gram Flour)", hindi_name: "बेसन", category: "Atta & Flour", unit: "kg", gst: 5, hsn_code: "1106" },
  { name: "Suji / Rava", hindi_name: "सूजी", category: "Atta & Flour", unit: "kg", gst: 5, hsn_code: "1103" },
  { name: "Rice Flour", hindi_name: "चावल का आटा", category: "Atta & Flour", unit: "kg", gst: 5, hsn_code: "1102" },

  // ---------- Rice ----------
  { name: "Basmati Rice", hindi_name: "चावल", category: "Rice", unit: "kg", gst: 5, hsn_code: "1006" },
  { name: "India Gate Basmati Rice 5kg", hindi_name: "चावल", category: "Rice", unit: "pcs", gst: 5, hsn_code: "1006" },
  { name: "Sona Masoori Rice", hindi_name: "चावल", category: "Rice", unit: "kg", gst: 5, hsn_code: "1006" },
  { name: "Idli Rice", category: "Rice", unit: "kg", gst: 5, hsn_code: "1006" },
  { name: "Poha (Flattened Rice)", hindi_name: "पोहा", category: "Rice", unit: "kg", gst: 5, hsn_code: "1904" },
  { name: "Puffed Rice (Murmura)", hindi_name: "मुरमुरा", category: "Rice", unit: "kg", gst: 5, hsn_code: "1904" },

  // ---------- Pulses ----------
  { name: "Toor Dal (Arhar)", hindi_name: "तूर दाल", category: "Pulses", unit: "kg", gst: 0, hsn_code: "0713" },
  { name: "Moong Dal", hindi_name: "मूंग दाल", category: "Pulses", unit: "kg", gst: 0, hsn_code: "0713" },
  { name: "Chana Dal", hindi_name: "चना दाल", category: "Pulses", unit: "kg", gst: 0, hsn_code: "0713" },
  { name: "Urad Dal", hindi_name: "उड़द दाल", category: "Pulses", unit: "kg", gst: 0, hsn_code: "0713" },
  { name: "Masoor Dal", hindi_name: "मसूर दाल", category: "Pulses", unit: "kg", gst: 0, hsn_code: "0713" },
  { name: "Rajma (Kidney Beans)", hindi_name: "राजमा", category: "Pulses", unit: "kg", gst: 0, hsn_code: "0713" },
  { name: "Chana (Kabuli/Whole)", hindi_name: "चना", category: "Pulses", unit: "kg", gst: 0, hsn_code: "0713" },

  // ---------- Oil & Ghee ----------
  { name: "Fortune Sunflower Oil 1L", hindi_name: "तेल", category: "Oil & Ghee", unit: "pcs", gst: 5, hsn_code: "1512" },
  { name: "Saffola Gold Oil 1L", category: "Oil & Ghee", unit: "pcs", gst: 5, hsn_code: "1512" },
  { name: "Mustard Oil 1L", hindi_name: "सरसों तेल", category: "Oil & Ghee", unit: "pcs", gst: 5, hsn_code: "1514" },
  { name: "Groundnut Oil 1L", hindi_name: "मूंगफली तेल", category: "Oil & Ghee", unit: "pcs", gst: 5, hsn_code: "1508" },
  { name: "Amul Ghee 1L", hindi_name: "घी", category: "Oil & Ghee", unit: "pcs", gst: 12, hsn_code: "0405" },
  { name: "Patanjali Ghee 1L", hindi_name: "घी", category: "Oil & Ghee", unit: "pcs", gst: 12, hsn_code: "0405" },
  { name: "Vanaspati (Dalda) 1kg", category: "Oil & Ghee", unit: "pcs", gst: 5, hsn_code: "1517" },

  // ---------- Grocery & Spices ----------
  { name: "Tata Salt 1kg", hindi_name: "नमक", category: "Grocery & Spices", unit: "pcs", gst: 0, hsn_code: "2501" },
  { name: "Sugar", hindi_name: "चीनी", category: "Grocery & Spices", unit: "kg", gst: 5, hsn_code: "1701" },
  { name: "Jaggery (Gur)", hindi_name: "गुड़", category: "Grocery & Spices", unit: "kg", gst: 0, hsn_code: "1701" },
  { name: "Turmeric Powder", hindi_name: "हल्दी", category: "Grocery & Spices", unit: "kg", gst: 5, hsn_code: "0910" },
  { name: "Red Chilli Powder", hindi_name: "लाल मिर्च", category: "Grocery & Spices", unit: "kg", gst: 5, hsn_code: "0904" },
  { name: "Coriander Powder", hindi_name: "धनिया पाउडर", category: "Grocery & Spices", unit: "kg", gst: 5, hsn_code: "0909" },
  { name: "Garam Masala", hindi_name: "गरम मसाला", category: "Grocery & Spices", unit: "pcs", gst: 5, hsn_code: "0910" },
  { name: "MDH/Everest Masala (mixed pack)", category: "Grocery & Spices", unit: "pcs", gst: 5, hsn_code: "0910" },
  { name: "Cumin Seeds (Jeera)", hindi_name: "जीरा", category: "Grocery & Spices", unit: "kg", gst: 5, hsn_code: "0909" },
  { name: "Mustard Seeds", hindi_name: "राई", category: "Grocery & Spices", unit: "kg", gst: 5, hsn_code: "1207" },
  { name: "Whole Black Pepper", hindi_name: "काली मिर्च", category: "Grocery & Spices", unit: "kg", gst: 5, hsn_code: "0904" },
  { name: "Tamarind (Imli)", hindi_name: "इमली", category: "Grocery & Spices", unit: "kg", gst: 5, hsn_code: "0813" },
  { name: "Papad", hindi_name: "पापड़", category: "Grocery & Spices", unit: "pcs", gst: 5, hsn_code: "1905" },
  { name: "Pickle (Achar)", hindi_name: "अचार", category: "Grocery & Spices", unit: "pcs", gst: 12, hsn_code: "2001" },
  { name: "Tomato Ketchup", category: "Grocery & Spices", unit: "pcs", gst: 12, hsn_code: "2103" },
  { name: "Vinegar", category: "Grocery & Spices", unit: "pcs", gst: 5, hsn_code: "2209" },
  { name: "Baking Soda", category: "Grocery & Spices", unit: "pcs", gst: 18, hsn_code: "2836" },
  { name: "Corn Flour", category: "Grocery & Spices", unit: "kg", gst: 5, hsn_code: "1108" },
  { name: "Dry Coconut (Copra)", hindi_name: "सूखा नारियल", category: "Grocery & Spices", unit: "pcs", gst: 5, hsn_code: "1203" },

  // ---------- Dairy ----------
  { name: "Amul Toned Milk (500ml)", hindi_name: "दूध", category: "Dairy", unit: "pcs", gst: 0, hsn_code: "0401" },
  { name: "Amul Gold Milk (500ml)", category: "Dairy", unit: "pcs", gst: 0, hsn_code: "0401" },
  { name: "Amul Butter 100g", hindi_name: "मक्खन", category: "Dairy", unit: "pcs", gst: 12, hsn_code: "0405" },
  { name: "Amul Cheese Slices", category: "Dairy", unit: "pcs", gst: 12, hsn_code: "0406" },
  { name: "Curd / Dahi 400g", hindi_name: "दही", category: "Dairy", unit: "pcs", gst: 0, hsn_code: "0403" },
  { name: "Paneer 200g", hindi_name: "पनीर", category: "Dairy", unit: "pcs", gst: 5, hsn_code: "0406" },
  { name: "Amul Milk Powder", category: "Dairy", unit: "pcs", gst: 5, hsn_code: "0402" },
  { name: "Eggs (tray of 6)", hindi_name: "अंडे", category: "Dairy", unit: "pcs", gst: 0, hsn_code: "0407" },
  { name: "Condensed Milk (Milkmaid)", category: "Dairy", unit: "pcs", gst: 5, hsn_code: "0402" },

  // ---------- Tea & Coffee ----------
  { name: "Red Label Tea 250g", hindi_name: "चाय", category: "Tea & Coffee", unit: "pcs", gst: 5, hsn_code: "0902" },
  { name: "Tata Tea Gold 250g", hindi_name: "चाय", category: "Tea & Coffee", unit: "pcs", gst: 5, hsn_code: "0902" },
  { name: "Nescafe Classic Coffee 50g", category: "Tea & Coffee", unit: "pcs", gst: 18, hsn_code: "2101" },
  { name: "Bru Instant Coffee 50g", category: "Tea & Coffee", unit: "pcs", gst: 18, hsn_code: "2101" },
  { name: "Bournvita / Health Drink 500g", category: "Tea & Coffee", unit: "pcs", gst: 18, hsn_code: "1901" },
  { name: "Horlicks 500g", category: "Tea & Coffee", unit: "pcs", gst: 18, hsn_code: "1901" },

  // ---------- Snacks ----------
  { name: "Parle-G Biscuit", hindi_name: "बिस्कुट", category: "Snacks", unit: "pcs", gst: 5, hsn_code: "1905" },
  { name: "Maggi Noodles", hindi_name: "मैगी", category: "Snacks", unit: "pcs", gst: 5, hsn_code: "1902" },
  { name: "Lay's Chips 52g", category: "Snacks", unit: "pcs", gst: 18, hsn_code: "2005" },
  { name: "Kurkure 55g", category: "Snacks", unit: "pcs", gst: 18, hsn_code: "1904" },
  { name: "Haldiram's Namkeen (mixed pack)", hindi_name: "नमकीन", category: "Snacks", unit: "pcs", gst: 12, hsn_code: "2106" },
  { name: "Bhujia (loose)", hindi_name: "भुजिया", category: "Snacks", unit: "kg", gst: 12, hsn_code: "2106" },
  { name: "Peanuts (roasted)", hindi_name: "मूंगफली", category: "Snacks", unit: "kg", gst: 5, hsn_code: "2008" },
  { name: "Popcorn (packaged)", category: "Snacks", unit: "pcs", gst: 5, hsn_code: "1904" },
  { name: "Dairy Milk Chocolate", category: "Snacks", unit: "pcs", gst: 18, hsn_code: "1806" },
  { name: "Kaju (Cashew) 200g", hindi_name: "काजू", category: "Snacks", unit: "pcs", gst: 5, hsn_code: "0801" },
  { name: "Badam (Almonds) 200g", hindi_name: "बादाम", category: "Snacks", unit: "pcs", gst: 5, hsn_code: "0802" },

  // ---------- Biscuits & Bakery ----------
  { name: "Britannia Bread", hindi_name: "ब्रेड", category: "Biscuits & Bakery", unit: "pcs", gst: 0, hsn_code: "1905" },
  { name: "Britannia Good Day Biscuit", category: "Biscuits & Bakery", unit: "pcs", gst: 18, hsn_code: "1905" },
  { name: "Oreo Biscuit", category: "Biscuits & Bakery", unit: "pcs", gst: 18, hsn_code: "1905" },
  { name: "Rusk (Toast)", hindi_name: "टोस्ट", category: "Biscuits & Bakery", unit: "pcs", gst: 18, hsn_code: "1905" },
  { name: "Marie Gold Biscuit", category: "Biscuits & Bakery", unit: "pcs", gst: 5, hsn_code: "1905" },
  { name: "Cream Rolls / Pastry", category: "Biscuits & Bakery", unit: "pcs", gst: 18, hsn_code: "1905" },

  // ---------- Beverages ----------
  { name: "Coca-Cola 750ml", category: "Beverages", unit: "pcs", gst: 28, hsn_code: "2202" },
  { name: "Sprite 750ml", category: "Beverages", unit: "pcs", gst: 28, hsn_code: "2202" },
  { name: "Frooti 200ml", category: "Beverages", unit: "pcs", gst: 12, hsn_code: "2202" },
  { name: "Real Fruit Juice 1L", category: "Beverages", unit: "pcs", gst: 12, hsn_code: "2009" },
  { name: "Bisleri Mineral Water 1L", category: "Beverages", unit: "pcs", gst: 18, hsn_code: "2201" },
  { name: "Electral / ORS", category: "Beverages", unit: "pcs", gst: 5, hsn_code: "3004" },

  // ---------- Personal Care ----------
  { name: "Colgate Toothpaste 150g", category: "Personal Care", unit: "pcs", gst: 18, hsn_code: "3306" },
  { name: "Dettol Soap (pack of 4)", category: "Personal Care", unit: "pcs", gst: 18, hsn_code: "3401" },
  { name: "Lifebuoy Soap", category: "Personal Care", unit: "pcs", gst: 18, hsn_code: "3401" },
  { name: "Head & Shoulders Shampoo 340ml", category: "Personal Care", unit: "pcs", gst: 18, hsn_code: "3305" },
  { name: "Parachute Coconut Hair Oil 200ml", category: "Personal Care", unit: "pcs", gst: 18, hsn_code: "3305" },
  { name: "Nivea Cream", category: "Personal Care", unit: "pcs", gst: 18, hsn_code: "3304" },
  { name: "Gillette Razor", category: "Personal Care", unit: "pcs", gst: 18, hsn_code: "8212" },
  { name: "Sanitary Pads (pack)", category: "Personal Care", unit: "pcs", gst: 0, hsn_code: "9619" },
  { name: "Talcum Powder", category: "Personal Care", unit: "pcs", gst: 18, hsn_code: "3304" },
  { name: "Hand Sanitizer 100ml", category: "Personal Care", unit: "pcs", gst: 18, hsn_code: "3808" },

  // ---------- Household ----------
  { name: "Surf Excel 1kg", category: "Household", unit: "pcs", gst: 18, hsn_code: "3402" },
  { name: "Vim Dishwash Bar", category: "Household", unit: "pcs", gst: 18, hsn_code: "3401" },
  { name: "Harpic Toilet Cleaner", category: "Household", unit: "pcs", gst: 18, hsn_code: "3808" },
  { name: "Lizol Floor Cleaner", category: "Household", unit: "pcs", gst: 18, hsn_code: "3402" },
  { name: "Odonil Air Freshener", category: "Household", unit: "pcs", gst: 18, hsn_code: "3307" },
  { name: "Agarbatti (Incense Sticks)", hindi_name: "अगरबत्ती", category: "Household", unit: "pcs", gst: 5, hsn_code: "3307" },
  { name: "Matchbox (pack)", hindi_name: "माचिस", category: "Household", unit: "pcs", gst: 5, hsn_code: "3605" },
  { name: "Candles", category: "Household", unit: "pcs", gst: 12, hsn_code: "3406" },
  { name: "Garbage Bags (roll)", category: "Household", unit: "pcs", gst: 18, hsn_code: "3923" },
  { name: "Aluminium Foil", category: "Household", unit: "pcs", gst: 18, hsn_code: "7607" },
  { name: "AA Batteries (pack of 2)", category: "Household", unit: "pcs", gst: 18, hsn_code: "8506" },
  { name: "LED Bulb 9W", category: "Household", unit: "pcs", gst: 18, hsn_code: "8539" },
  { name: "Steel Scrubber", category: "Household", unit: "pcs", gst: 18, hsn_code: "7323" },
];
