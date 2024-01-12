const fetch = require('node-fetch');
const Homey = require('homey');

const host = Homey.env.NEOWATT_URL;

async function getTokens(refreshToken) {
    try {
        const res = await fetch(`${host}/api/2023-10/auth/token`, {
            timeout: 10000,
            method: "POST",
            headers: { 
              "Content-type": "application/json"
            },
            body: JSON.stringify({
                "grant_type": "refresh_token",
                "refresh_token": refreshToken
            }),
        });

        const data = await res?.json();

        return data;
    } catch (error) {
        throw error;
    }
}

module.exports = {
    getTokens
}