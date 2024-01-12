'use strict';

const { Device } = require('homey');
const Homey = require('homey');
const fetch = require('node-fetch');
const { getTokens } = require('../../lib/auth');
const { Log } = require('homey-log');

class LoadBalancingDevice extends Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('LoadBalancingDevice has been initialized');

    //this.homeyLog = new Log({ homey: this.homey });

    // Remove capabilities during dev:
    //await this.removeCapability("effect_tariff_level")

    if (!this.hasCapability('load_balancing_status')) await this.addCapability('load_balancing_status').catch(console.error);

    if (!this.hasCapability('meter_power.daily')) await this.addCapability('meter_power.daily').catch(console.error);

    if (!this.hasCapability('meter_power.hourly')) await this.addCapability('meter_power.hourly').catch(console.error);

    // Setup data polling from NW API

    // Run once on init
    try {
      await this.poll();
    } catch (error) {
        // Sentry logging here
        //this.homeyLog.captureException(error);
        console.error("device polling data error", error)
    }

    // Run every 2 minutes
    const intervalInSeconds = 120;
    this.homey.setInterval(async () => {
      try {
          await this.poll();
      } catch (error) {
          // Sentry logging here
          //this.homeyLog.captureException(error);
          console.error("device polling data error", error)
      }
    }, 1000 * intervalInSeconds)

  }
  async changeTariffLevel(value) {
    this.log("changeTariffLevel", value);

    // Refresh token for the current Homey user in NW API is stored in Homey settings
    const refreshToken = this.homey.settings.get("refresh_token");
    if (!refreshToken) return this.log("Effect tariff change cancelled because no refresh token is stored in Homey settings");

    const homeyId = await this.homey.cloud.getHomeyId();
    if (!homeyId) return;

    // Get access token from refresh token
    let tokens;
    try {
        tokens = await getTokens(refreshToken)
    } catch (error) {
        throw error;
    }

    if (!tokens.refresh_token) throw new Error("Effect tariff change cancelled because no refresh_token were returned from NW API");
    if (!tokens.access_token) throw new Error("Effect tariff change cancelled because no access_token were returned from NW API");

    // Store new refresh token in settings
    if (tokens.refresh_token) this.homey.settings.set('refresh_token', tokens.refresh_token);

    const host = Homey.env.NEOWATT_URL;

    let effectLevel = 0;

    // Parse out kW values
    switch (value) {
      case "0_to_2":
        effectLevel = 2
        break;

      case "2_to_5":
        effectLevel = 5
        break;

      case "5_to_10":
        effectLevel = 10
        break;

      case "10_to_15":
        effectLevel = 15
        break;

      case "15_to_20":
        effectLevel = 20
        break;
    }

    try {
      const res = await fetch(`${host}/api/2023-10/integrations/homey/${homeyId}/effectlevel`, {
        timeout: 10000,
        method: "PUT",
        headers: { 
          Authorization: `Bearer ${tokens.access_token}`, 
          "Content-type": "application/json"
        },
        body: JSON.stringify({
          effectLevel,
        }),
      });

      const data = await res?.json();

      if (!data.success) throw new Error("Effect tariff change failed: " + data?.message);

    } catch (error) {
      throw error;
    }

    this.log("Done setting tariff level");

  }

  async poll() {
    this.log("Begin update");

    // Refresh token for the current Homey user in NW API is stored in Homey settings
    const refreshToken = this.homey.settings.get("refresh_token");
    if (!refreshToken) return this.log("Device polling cancelled because no refresh token is stored in Homey settings");

    const homeyId = await this.homey.cloud.getHomeyId();
    if (!homeyId) return;

    // Get access token from refresh token
    let tokens;
    try {
        tokens = await getTokens(refreshToken)
    } catch (error) {
        throw error;
    }

    if (!tokens.refresh_token) throw new Error("Device polling cancelled because no refresh_token were returned from NW API");
    if (!tokens.access_token) throw new Error("Device polling cancelled because no access_token were returned from NW API");

    // Store new refresh token in settings
    if (tokens.refresh_token) this.homey.settings.set('refresh_token', tokens.refresh_token);

    const host = Homey.env.NEOWATT_URL;

    try {
      const res = await fetch(`${host}/api/2023-10/integrations/homey/${homeyId}/summary`, {
        timeout: 10000,
        method: "GET",
        headers: { 
          Authorization: `Bearer ${tokens.access_token}`, 
          "Content-type": "application/json"
        }
      });

      // Catch non 200 responses, like 400. (not 500, which is catched in the try/catch) 
      // Like if 400 is returned, often the data is not ready from NW yet.
      if (res.status !== 200) return this.log("End update");

      const { summary } = await res?.json();

      const load_balancing_status = summary.loadBalancing.balancingNow ? "active" : "standby";

      await this.setCapabilityValue('load_balancing_status', load_balancing_status)
      await this.setCapabilityValue('meter_power.daily', summary.energy.today)
      await this.setCapabilityValue('meter_power.hourly', summary.energy.thisHour)

    } catch (error) {
      throw error;
    }

    this.log("End update");
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('LoadBalancingDevice has been added');
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('LoadBalancingDevice settings where changed');
    this.log('oldSettings', oldSettings);
    this.log('newSettings', newSettings);
    this.log('changedKeys', changedKeys);

    if (changedKeys.includes("effect_tariff_level")) {
      const value = newSettings.effect_tariff_level;
      await this.changeTariffLevel(value).catch((error) => {
        this.error(error);
        throw new Error('Could not save Effect tariff level. Please try again.')
      });
    }
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log('LoadBalancingDevice was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('LoadBalancingDevice has been deleted');
  }

}

module.exports = LoadBalancingDevice;
