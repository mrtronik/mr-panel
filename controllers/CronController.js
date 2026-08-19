const CronService = require('../services/CronService');
const ActivityLogService = require('../services/ActivityLogService');

exports.index = async (req, res) => {
    try {
        const user = req.session.user;
        const username = user.username || user.name;
        const jobs = await CronService.listJobs(username);
        const schedules = CronService.getCommonSchedules();

        res.render('cron/index', { title: 'Cron Jobs', jobs, schedules, username });
    } catch (err) {
        res.status(500).send(err.message);
    }
};

exports.add = async (req, res) => {
    try {
        const user = req.session.user;
        const username = user.username || user.name;
        const { schedule, command } = req.body;

        if (!schedule || !command) {
            return res.status(400).json({ error: 'Schedule and command are required' });
        }

        await CronService.addJob(username, schedule, command);
        await ActivityLogService.log(user.id, 'cron-add', 'cron', null, { schedule, command: command.substring(0, 100) }, req.ip);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.remove = async (req, res) => {
    try {
        const user = req.session.user;
        const username = user.username || user.name;
        const { index } = req.body;

        await CronService.removeJob(username, parseInt(index));
        await ActivityLogService.log(user.id, 'cron-remove', 'cron', null, { index }, req.ip);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
