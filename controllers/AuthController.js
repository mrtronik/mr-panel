const UserModel = require('../models/UserModel');
const bcrypt = require('bcrypt');

exports.loginForm = (req, res) => {
    res.render('login', {
    layout: 'layouts/auth'
});
};

exports.login = async (req, res) => {

    const { username, password } = req.body;

    try {
        const user = await UserModel.findByUsername(username);

        if (!user)
            return res.send("Username tidak ditemukan");

        if (user.status === 'suspended')
            return res.send("Akun anda telah di-suspend. Hubungi admin.");

        const hash = user.password.replace('$2y$', '$2b$');

        const cocok = await bcrypt.compare(password, hash);

        if (!cocok) {
            return res.send("Password salah");
        }

        req.session.user = user;

        res.redirect('/dashboard');

    } catch (err) {
        return res.send(err.message);
    }

};

exports.logout = (req, res) => {

    req.session.destroy(() => {
        res.redirect('/login');
    });

};
