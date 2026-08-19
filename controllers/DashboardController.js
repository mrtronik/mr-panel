const DashboardService = require('../services/DashboardService');

exports.index = async (req, res) => {
    try {
        const dashboard = await DashboardService.get(req.session.user);
        res.render('dashboard', {
            title: 'Dashboard',
            user: req.session.user,
            dashboard
        });
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
};