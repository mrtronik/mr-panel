const db = require('../config/db');

class ForwardingRuleService {
  static async list(user, options = {}) {
    const { page = 1, limit = 50, status = null } = options;
    const offset = (page - 1) * limit;
    
    let whereClause = '1=1';
    const params = [];

    if (user.role === 'admin') {
      // Admin sees all
    } else if (user.role === 'reseller') {
      whereClause += ' AND (fr.user_id = ? OR fr.user_id IN (SELECT id FROM users WHERE owner_id = ?))';
      params.push(user.id, user.id);
    } else {
      whereClause += ' AND fr.user_id = ?';
      params.push(user.id);
    }

    if (status) {
      whereClause += ' AND fr.status = ?';
      params.push(status);
    }

    const [countResult] = await db.execute(
      `SELECT COUNT(*) as total FROM forwarding_rules fr WHERE ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    const [rows] = await db.execute(
      `SELECT fr.*, ea.email as source_email 
       FROM forwarding_rules fr 
       LEFT JOIN email_accounts ea ON fr.email_account_id = ea.id 
       WHERE ${whereClause}
       ORDER BY fr.priority DESC, fr.created_at DESC 
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    return { rules: rows, total, page, limit };
  }

  static async create(data, user) {
    const { rule_name, rule_type, keyword, domain, destination_email, action, priority, email_account_id } = data;

    if (!rule_name || !destination_email) {
      throw new Error('Rule name dan destination email harus diisi');
    }

    if (!this.isValidEmail(destination_email)) {
      throw new Error('Format destination email tidak valid');
    }

    if (rule_type === 'keyword' && !keyword) {
      throw new Error('Keyword harus diisi untuk rule type keyword');
    }

    if (rule_type === 'domain' && !domain) {
      throw new Error('Domain harus diisi untuk rule type domain');
    }

    const userId = user.role === 'user' ? user.id : (user.id || null);

    const [result] = await db.execute(
      `INSERT INTO forwarding_rules (user_id, email_account_id, rule_name, rule_type, keyword, domain, destination_email, action, priority) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, email_account_id || null, rule_name, rule_type, keyword || null, domain || null, destination_email, action || 'forward', priority || 0]
    );

    return { id: result.insertId, ...data };
  }

  static async update(id, data, user) {
    const existing = await this.findById(id, user);
    if (!existing) throw new Error('Rule tidak ditemukan');

    const { rule_name, rule_type, keyword, domain, destination_email, action, priority, status, email_account_id } = data;

    if (destination_email && !this.isValidEmail(destination_email)) {
      throw new Error('Format destination email tidak valid');
    }

    await db.execute(
      `UPDATE forwarding_rules SET 
        rule_name = COALESCE(?, rule_name),
        rule_type = COALESCE(?, rule_type),
        keyword = COALESCE(?, keyword),
        domain = COALESCE(?, domain),
        destination_email = COALESCE(?, destination_email),
        action = COALESCE(?, action),
        priority = COALESCE(?, priority),
        status = COALESCE(?, status),
        email_account_id = COALESCE(?, email_account_id)
       WHERE id = ?`,
      [rule_name, rule_type, keyword, domain, destination_email, action, priority, status, email_account_id, id]
    );

    return { id, ...data };
  }

  static async remove(id, user) {
    const existing = await this.findById(id, user);
    if (!existing) throw new Error('Rule tidak ditemukan');

    await db.execute('DELETE FROM forwarding_rules WHERE id = ?', [id]);
    return true;
  }

  static async findById(id, user) {
    let whereClause = 'fr.id = ?';
    const params = [id];

    if (user.role !== 'admin') {
      whereClause += ' AND fr.user_id = ?';
      params.push(user.id);
    }

    const [rows] = await db.execute(
      `SELECT fr.*, ea.email as source_email 
       FROM forwarding_rules fr 
       LEFT JOIN email_accounts ea ON fr.email_account_id = ea.id 
       WHERE ${whereClause}`,
      params
    );
    return rows[0] || null;
  }

  static async toggleStatus(id, user) {
    const existing = await this.findById(id, user);
    if (!existing) throw new Error('Rule tidak ditemukan');

    const newStatus = existing.status === 'active' ? 'inactive' : 'active';
    await db.execute('UPDATE forwarding_rules SET status = ? WHERE id = ?', [newStatus, id]);
    return { id, status: newStatus };
  }

  static async applyToPostfix(user) {
    const { rules } = await this.list(user, { status: 'active' });
    
    const aliases = {};
    for (const rule of rules) {
      const source = rule.source_email || '';
      if (source) {
        if (!aliases[source]) aliases[source] = [];
        
        switch (rule.action) {
          case 'forward':
            aliases[source].push(rule.destination_email);
            break;
          case 'forward_copy':
            aliases[source].push(rule.destination_email);
            break;
          case 'redirect':
            aliases[source] = [rule.destination_email];
            break;
        }
      }
    }

    return { aliases, rulesCount: rules.length };
  }

  static async getStats(user) {
    const [totalResult] = await db.execute(
      'SELECT COUNT(*) as total FROM forwarding_rules',
      user.role === 'admin' ? [] : [user.id]
    );

    const [activeResult] = await db.execute(
      "SELECT COUNT(*) as total FROM forwarding_rules WHERE status = 'active'",
      user.role === 'admin' ? [] : [user.id]
    );

    return {
      total: totalResult[0].total,
      active: activeResult[0].total
    };
  }

  static isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}

module.exports = ForwardingRuleService;
