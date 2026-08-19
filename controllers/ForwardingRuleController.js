const ForwardingRuleService = require('../services/ForwardingRuleService');
const ActivityLogService = require('../services/ActivityLogService');

class ForwardingRuleController {
  static async getPage(req, res) {
    try {
      const { rules, total, page, limit } = await ForwardingRuleService.list(req.session.user, { page: 1, limit: 50 });
      const stats = await ForwardingRuleService.getStats(req.session.user);
      
      res.render('settings/forwarding', {
        title: 'Email Forwarding Rules',
        rules,
        total,
        page,
        limit,
        stats,
        user: req.session.user
      });
    } catch (error) {
      req.flash('error', `Gagal memuat forwarding rules: ${error.message}`);
      res.redirect('/dashboard');
    }
  }

  static async list(req, res) {
    try {
      const { page = 1, limit = 50, status = null } = req.query;
      const result = await ForwardingRuleService.list(req.session.user, { page: parseInt(page), limit: parseInt(limit), status });
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async create(req, res) {
    try {
      const rule = await ForwardingRuleService.create(req.body, req.session.user);
      
      ActivityLogService.log(
        req.session.user.id,
        'forwarding_rule_create',
        'forwarding',
        rule.id,
        { rule_name: rule.rule_name, rule_type: rule.rule_type, destination: rule.destination_email },
        req.ip
      );

      res.json({ success: true, data: rule });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async update(req, res) {
    try {
      const { id } = req.params;
      const rule = await ForwardingRuleService.update(parseInt(id), req.body, req.session.user);
      
      ActivityLogService.log(
        req.session.user.id,
        'forwarding_rule_update',
        'forwarding',
        rule.id,
        { changes: req.body },
        req.ip
      );

      res.json({ success: true, data: rule });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async remove(req, res) {
    try {
      const { id } = req.params;
      await ForwardingRuleService.remove(parseInt(id), req.session.user);
      
      ActivityLogService.log(
        req.session.user.id,
        'forwarding_rule_delete',
        'forwarding',
        parseInt(id),
        {},
        req.ip
      );

      res.json({ success: true, message: 'Rule berhasil dihapus' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async toggleStatus(req, res) {
    try {
      const { id } = req.params;
      const result = await ForwardingRuleService.toggleStatus(parseInt(id), req.session.user);
      
      ActivityLogService.log(
        req.session.user.id,
        'forwarding_rule_toggle',
        'forwarding',
        result.id,
        { status: result.status },
        req.ip
      );

      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async applyToPostfix(req, res) {
    try {
      const result = await ForwardingRuleService.applyToPostfix(req.session.user);
      
      ActivityLogService.log(
        req.session.user.id,
        'forwarding_apply_postfix',
        'forwarding',
        null,
        { rulesCount: result.rulesCount },
        req.ip
      );

      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getStats(req, res) {
    try {
      const stats = await ForwardingRuleService.getStats(req.session.user);
      res.json({ success: true, data: stats });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

module.exports = ForwardingRuleController;
