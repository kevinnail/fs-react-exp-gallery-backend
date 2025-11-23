const pool = require('../utils/pool');

module.exports = class Address {
  id;
  userId;
  addressLine1;
  addressLine2;
  city;
  state;
  postalCode;
  countryCode;
  createdAt;
  updatedAt;

  constructor(row) {
    this.id = row.id;
    this.userId = row.user_id;
    this.addressLine1 = row.address_line1;
    this.addressLine2 = row.address_line2;
    this.city = row.city;
    this.state = row.state;
    this.postalCode = row.postal_code;
    this.countryCode = row.country_code;
    this.createdAt = row.created_at;
    this.updatedAt = row.updated_at;
  }

  static async insert({
    userId,
    addressLine1,
    addressLine2,
    city,
    state,
    postalCode,
    countryCode = 'US',
  }) {
    const { rows } = await pool.query(
      `
      INSERT INTO addresses (user_id, address_line1, address_line2, city, state, postal_code, country_code)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
      `,
      [userId, addressLine1, addressLine2, city, state, postalCode, countryCode],
    );

    return new Address(rows[0]);
  }

  static async getById(id) {
    const { rows } = await pool.query('SELECT * FROM addresses WHERE id = $1', [id]);

    if (!rows[0]) {
      return null;
    }

    return new Address(rows[0]);
  }

  static async getByUserId(userId) {
    const { rows } = await pool.query(
      'SELECT * FROM addresses WHERE user_id = $1 ORDER BY created_at DESC',
      [userId],
    );

    return rows.map((row) => new Address(row));
  }

  static async updateById(
    id,
    { addressLine1, addressLine2, city, state, postalCode, countryCode },
  ) {
    const { rows } = await pool.query(
      `
      UPDATE addresses
      SET address_line1 = $2, 
          address_line2 = $3, 
          city = $4, 
          state = $5, 
          postal_code = $6, 
          country_code = $7,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
      `,
      [id, addressLine1, addressLine2, city, state, postalCode, countryCode],
    );

    if (!rows[0]) {
      throw new Error('Address not found');
    }

    return new Address(rows[0]);
  }

  static async upsertByUserId(
    userId,
    { addressLine1, addressLine2, city, state, postalCode, countryCode = 'US' },
  ) {
    const existingAddress = await Address.getByUserId(userId);

    if (existingAddress && existingAddress.length > 0) {
      return await Address.updateById(existingAddress[0].id, {
        addressLine1,
        addressLine2,
        city,
        state,
        postalCode,
        countryCode,
      });
    } else {
      return await Address.insert({
        userId,
        addressLine1,
        addressLine2,
        city,
        state,
        postalCode,
        countryCode,
      });
    }
  }
};
