const { expressjwt } = require('express-jwt')

const protegerRota = expressjwt({
    secret: process.env.JWT_SECRET,
    algorithms: ['HS256']
})

module.exports = protegerRota

