'use strict';

const Homey = require('homey');
const fetch = require('node-fetch');

const host = Homey.env.NEOWATT_URL;

/**
 * Init the webhooks for this particular Homey, to enable communication from external API's
 * 
 * Example: NeoWatt can use this to get the device list from Homey, start/stop devices etc.
 * 
 * Must respond to a API endpoint in NeoWatt, not the Webhook itself, as it is just a forward
 * from Athom's servers.
 * 
 * @param {object} self 
 */
async function initWebhooks(self) {
    // Self = this from class context

    const webhookId = Homey.env.WEBHOOK_ID;
    const webhookSecret = Homey.env.WEBHOOK_SECRET;

    // Use this URL to do a call directly from a external API to this particular Homey
    // https://webhooks.athom.com/webhook/65365b24cf7cc10b91f2ab42?homey=5ce40f3cd51f490ecf356229

    self.neowattWebhook = await self.homey.cloud.createWebhook(webhookId, webhookSecret, {
        // Provide unique properties for this Homey here
        //deviceId: 'aaabbbccc',
    });

    self.neowattWebhook.on("message", async (args) => {
        self.log("Got a webhook message!");
        self.log("headers:", args.headers);
        self.log("query:", args.query);
        self.log("body:", args.body);

/*         const body = {
            // On/off devices
            onOff: {
                command: cmd,
                devices: filteredDevices.map((device) => device.references.externalId)
            },
            // Inverter devices, more complex logic
            inverter: {
                command: inverterCmd,
                devices: filteredInverterDevices.map((device) => device.references.externalId)
            }
        }; */

        // TODO: Validate against user refresh token?
        // Validate if the request is coming from NeoWatt servers, specifically that particular user.
        if (args.headers.authorization !== `Bearer 123lol`) return self.log("Invalid authorization header");

        const { onOff, inverter } = args.body;

        // 
        // INVERTER DEVICES
        //

        const { command: inverterCommand, devices: inverterDevices = [], batteryLevel = 0 } = inverter;

        const adjustBatteryLevel = (level) => {
            // Hardcoded min/max soc, so we'll never dischage/charge the battery 
            // below/above this value
            const min = 25;
            const max = 95;

            const newLevel = Math.max(min, Math.min(level, max));

            return Math.round(newLevel)
        };

        const minSoc = adjustBatteryLevel(batteryLevel);

        const triggerDischargeFlow = async () => {
            if (inverterDevices.length > 0) {

                // Trigger discharge flows
                try {

                    const dischargeTrigger = self.homey.flow.getTriggerCard("discharge");

                    // Check if minSoc is a valid number between 0-100
                    if (isNaN(minSoc) || minSoc < 0 || minSoc > 100) {
                        throw new Error("Invalid minSoc value");
                    }

                    const tokens = {
                        min_soc: minSoc,
                    };

                    await dischargeTrigger.trigger(tokens);

                    self.log("Discharge flow triggered");

                } catch (error) {
                    self.log(`Error when triggering discharge event: ${error}`);
                }
            }
        };

        const triggerChargeFlow = async () => {
            if (inverterDevices.length > 0) {
                try {

                    const chargeTrigger = self.homey.flow.getTriggerCard("charge");

                    // Check if minSoc is a valid number between 0-100
                    if (isNaN(minSoc) || minSoc < 0 || minSoc > 100) {
                        throw new Error("Invalid minSoc value");
                    }

                    const tokens = {
                        max_soc: minSoc,
                    };

                    await chargeTrigger.trigger(tokens);

                    self.log("Charge flow triggered");

                } catch (error) {
                    self.log(`Error when triggering charge event: ${error}`);
                }
            }
        };

        const triggerStandbyFlow = async () => {
            if (inverterDevices.length > 0) {
                try {

                    const standbyTrigger = self.homey.flow.getTriggerCard("standby");

                    // Check if minSoc is a valid number between 0-100
                    if (isNaN(minSoc) || minSoc < 0 || minSoc > 100) {
                        throw new Error("Invalid minSoc value");
                    }

                    const tokens = {
                        soc: minSoc,
                    };

                    await standbyTrigger.trigger(tokens);

                    self.log("Standby flow triggered");

                } catch (error) {
                    self.log(`Error when triggering standby event: ${error}`);
                }
            }
        };

        switch (inverterCommand) {
            case "discharge":
                await triggerDischargeFlow();
                break;

            case "charge":
                await triggerChargeFlow();
                break;

            case "standby":
                await triggerStandbyFlow();
                break;
        
            default:
                // Do nothing as the default
                break;
        }

        //
        // ON/OFF DEVICES
        //

        const { command, devices = [] } = onOff;

        switch (command) {

            case "turnOffDevices":
                for (const device of devices) {

                    const deviceId = device.id || device;
                    const capabilityId = device.capabilityId || "onoff";

                    try {
                        const deviceApi = await self.homeyApi.devices.getDevice({ id: deviceId });
                        const off = await deviceApi.setCapabilityValue({
                            capabilityId: capabilityId,
                            value: false,
                        });
                        self.log("off", off);
                    } catch (error) {
                        self.log(`Error setting capability value for device ${deviceId}: ${error}`);
                    }
                }

                break;

            case "turnOnDevices":
                for (const device of devices) {

                    const deviceId = device.id || device;
                    const capabilityId = device.capabilityId || "onoff";

                    try {
                        const deviceApi = await self.homeyApi.devices.getDevice({ id: deviceId });
                        const on = await deviceApi.setCapabilityValue({
                            capabilityId: capabilityId,
                            value: true,
                        });
                        self.log("on", on);
                    } catch (error) {
                        self.log(`Error setting capability value for device ${deviceId}: ${error}`);
                    }
                }

                break;

            default:
                // Do nothing as the default
                break;
        }

        self.log("Finished processing webhook message!");
    });
}

async function getAllDevices(self) {
    // Get all devices from Homey

    try {
        const devices = await self.homeyApi.devices.getDevices();

        // Convert to array
        const devicesArray = Object.keys(devices).map(key => devices[key])

        //self.log("devices", devicesArray.length)

        // Only pick the 50 first devices for now
        const data = devicesArray.splice(0, 50);

        const refreshToken = self.homey.settings.get("refresh_token");
        const homeyId = await self.homey.cloud.getHomeyId();

        await postData(refreshToken, homeyId, data);
    } catch (error) {
        self.log("error", error)
    }
}

async function postData(refreshToken, homeyId, data) {

    // First get access token from refresh token
    let accessToken;
    try {
        accessToken = await getAccessToken(refreshToken)
    } catch (error) {
        throw error;
    }

    console.log("accessToken", accessToken)

    try {
        // This will actually be a webhook to NeoWatt
        const res = await fetch(`${host}/api/2023-10/hubs/homey/${homeyId}/data`, {
          timeout: 10000,
          method: "POST",
          headers: { 
            Authorization: `Bearer ${accessToken}`, 
            "Content-type": "application/json"
          },
          body: JSON.stringify({
            data
          }),
        });

        console.log("res.ok", res.ok)
        console.log("res.status", res.status)

      } catch (error) {
        throw error;
      }
}

async function getAccessToken(refreshToken) {
    try {
        const res = await fetch(`${host}/api/2023-10/accounts/tokens`, {
            timeout: 10000,
            method: "POST",
            headers: { 
              "Content-type": "application/json"
            },
            body: JSON.stringify({
                refreshToken,
            }),
        });

        const data = await res?.json();

        const { access_token: accessToken } = data;

        return accessToken;
    } catch (error) {
        throw error;
    }
}

module.exports = {
    initWebhooks
}
