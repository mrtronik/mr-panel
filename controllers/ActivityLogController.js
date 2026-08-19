const ActivityLogService = require('../services/ActivityLogService');

exports.index = async (req, res) => {
    try {
        const user = req.session.user;
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';

        const filters = {};
        if (user.role === 'reseller') {
            filters.user_id = user.id;
        } else if (user.role === 'user') {
            filters.user_id = user.id;
        }
        if (search) filters.search = search;

        const logs = await ActivityLogService.getLogs({ ...filters, limit, offset });
        const total = await ActivityLogService.countLogs(filters);
        const totalPages = Math.ceil(total / limit);

        res.render('activity/index', {
            title: 'Activity Log',
            logs,
            pagination: { page, totalPages, total },
            search
        });
    } catch (err) {
        res.status(500).send(err.message);
    }
};
