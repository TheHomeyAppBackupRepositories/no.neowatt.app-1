const Homey = require('homey');
const fetch = require('node-fetch');
const { getTokens } = require('./auth');

const host = Homey.env.NEOWATT_URL;

async function pushData(self) {
    // This will run even if the user deletes the "Status" device

    // Move thie interval into the app.js instead, this.homey.setInterval etc.
    // Run once on init
    try {
        await push(self);
    } catch (error) {
        //self.homeyLog.captureException(error);
        console.error("pushData error", error)
    }

    const intervalSeconds = 60;
    self.homey.setInterval(async () => {
        try {
            await push(self);
        } catch (error) {
            // Sentry logging here
            //self.homeyLog.captureException(error);
            console.error("pushData error", error)
        }
    }, 1000 * intervalSeconds)
}

async function push(self) {
    self.log("pushData check");

    // Check if we should push data to the NW API by doing
    // a few checks.

    // Refresh token for the current Homey user in NW API is stored in Homey settings
    const refreshToken = self.homey.settings.get("refresh_token");
    if (!refreshToken) return self.log("Push cancelled because no refresh token is stored in Homey settings");

    const homeyId = await self.homey.cloud.getHomeyId();
    if (!homeyId) return;

    // TODO: 
    // Check if we are rate limited, etc.

    self.log("pushing data to NW API...");

    // Get all devices from Homey
    const devices = await getAllDevices(self);

    self.log("devices qty: ", devices.length)

    //console.log("devices", JSON.stringify(devices, null, 4));

    // Get access token from refresh token
    let tokens;
    try {
        tokens = await getTokens(refreshToken)
    } catch (error) {
        throw error;
    }

    // Notify user in Homey if were unable to get tokens. Only do this once.
    const invalidTokenSettings = self.homey.settings.get("invalid_refresh_token") ?? false;

    if (tokens?.message === "Unauthorized" && invalidTokenSettings === false) {
        self.log("Push cancelled because we were unable to get tokens from NW API");
        self.homey.notifications.createNotification({
            excerpt: "Kunne ikke hente tilgangstoken fra NeoWatt API. Vennligst logg inn på nytt i NeoWatt appen."
        });

        self.homey.settings.set('invalid_refresh_token', true);
    }

    /* self.log("tokens", tokens) */

    if (!tokens.refresh_token) throw new Error("Push cancelled because no refresh_token were returned from NW API");
    if (!tokens.access_token) throw new Error("Push cancelled because no access_token were returned from NW API");

    // Maybe send email notification to user here, to let them know that the sync is broken?

    // It might be that a refresh token is generated, but somehow not stored here. This will cause
    // the integration to break, and a completely new login is required.
    // Maybe allow up to 5 simultaneous refresh tokens to allow for a bit of slack?

    // Store new refresh token in settings
    if (tokens.refresh_token) self.homey.settings.set('refresh_token', tokens.refresh_token);
    self.homey.settings.set('invalid_refresh_token', false);

    try {
        const res = await fetch(`${host}/api/2023-10/integrations/homey/${homeyId}/ingest`, {
          timeout: 10000,
          method: "POST",
          headers: { 
            Authorization: `Bearer ${tokens.access_token}`, 
            "Content-type": "application/json"
          },
          body: JSON.stringify({
            data: devices
          }),
        });

        console.log("res.ok", res.ok)
        console.log("res.status", res.status)

      } catch (error) {
        throw error;
      }

}

async function getAllDevices(self) {
    // Get all devices from Homey
    try {
        const devices = await self.homeyApi.devices.getDevices();

        // Convert to array
        const devicesArray = Object.keys(devices).map(key => devices[key])

        /* self.log("devices", devicesArray.map(device => {
            return {
                name: device.name, class: device.class, id: device.driverId
            }
        })); */

        //self.log("devices", devicesArray.length)

        function hasRequiredCapabilities(device) {
            // A device must have at least these capabilities to be included in NeoWatt
            const requiredCapabilities = ['onoff', 'measure_power'];
            return requiredCapabilities.every(capability => device.capabilities.includes(capability));
        }

        function isValidClass(device) {
            const validClasses = ['socket', 'thermostat', 'other'];
            return validClasses.includes(device.class);
        }
        
        function isValidDriverId(device) {
            // We add exclusive support for devices outside the class and capa checker here
            const validDriverIds = [

                // Virtual devices
                // This don't have the measure energy cap. We don't know the power usage,
                // so we cant use it.
                //"homey:app:no.almli.thermostat:VThermo",

                // Inverters
                "homey:app:com.victronenergy:gx",

                // Easee EV charger
                "homey:app:no.easee:charger",

                // Zaptec EV chargers
                "homey:app:com.zaptec:go",
                "homey:app:com.zaptec:home",
                "homey:app:com.zaptec:pro",

                // Tibber Pulse AMS reader
                "homey:app:com.tibber:pulse", 

                // Aeotec ZW078 Heavy Duty Switch
                "homey:app:com.aeotec:ZW078"
            ];
            return validDriverIds.includes(device.driverId);
        }

        function shouldIncludeDevice(device) {
            //if (device.name === "GX (102c6bc296bb)") console.log(device)
            /*console.log("capi", hasRequiredCapabilities(device)) */
            return (isValidClass(device) && hasRequiredCapabilities(device)) || isValidDriverId(device)
        }

        //const filteredDevices = devicesArray.filter(shouldIncludeDevice) || [];
        const filteredDevices = [...devicesArray]

        //console.log("filteredDevices", filteredDevices.map(device => device.name))

        // Filter devices by type, we'll only want certain devices for now
        /* const filteredDevices = devicesArray.filter((device) => {
            return ['socket', 'thermostat'].includes(device.class)
            return device.driverId === "homey:app:com.tibber:pulse";
        }) || []; */

        //

        //const filteredDevices = devicesArray;

        //const jsonString = JSON.stringify(filteredDevices);

        //const sizeInBytes = Buffer.byteLength(jsonString, 'utf8');

        // Konverter til megabyte (MB)
        //const sizeInMegabytes = sizeInBytes / (1024 * 1024);

        // Logg størrelsen på dataene
        //console.log(`Størrelse på data: ${sizeInMegabytes} MB`);

        // Only pick the 50 first devices for now
        //const data = devicesArray.splice(0, 50);

        return filteredDevices;

    } catch (error) {
        throw error;
    }
}

module.exports = {
    pushData
}