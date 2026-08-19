const DashboardService = require('../../services/DashboardService');

exports.stats = async (req, res) => {
    try {
        const dashboard = await DashboardService.get(req.session.user);
        res.json(dashboard);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};