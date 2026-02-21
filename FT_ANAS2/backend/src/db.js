const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

const query = async (text, params) => pool.query(text, params);

module.exports = { query, pool };

// // work good 
// const { Pool } = require('pg');

// const pool = new Pool({
//   connectionString: 'postgres://username:password@localhost:5432/multichat',
//   ssl: false,
// });

// const query = async (text, params) => pool.query(text, params);

// module.exports = { query, pool };



// const { Pool } = require('pg');
// require('dotenv').config();

// const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

// const query = async (text, params) => pool.query(text, params);

// module.exports = { query, pool };
