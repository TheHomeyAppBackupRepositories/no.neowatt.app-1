'use strict';

const Homey = require('homey');
//const { HomeyAPI } = require('homey-api');
const { HomeyAPI, AthomCloudAPI } = require('./homey-api');
const { initWebhooks } = require('./lib/webhooks');
const { pushData } = require('./lib/pushData');
const { Log } = require('homey-log');

/**
 * 
 * 1. https://community.homey.app/t/tool-package-bundler-potentially-shrink-your-app-size-drastically-with-this-tool/72460
 * 
 * 2. https://homey.solweb.no/advanced-api-usage/bearertoken
 * 
 * 3. Important note:
 * https://apps.developer.homey.app/guides/homey-cloud#avoiding-app-review-rejections-for-homey-cloud
 * Homey Cloud does not support the homey:manager:api permission
 * 
 * But here it says otherwise: https://apps.developer.homey.app/the-basics/app/permissions#which-apps-may-use-the-api-permission
 * 
 * Must be tested personally...
 * 
 * 4. Inspect code live
 * https://community.homey.app/t/question-regarding-setinterval/61138/11
 * 
 * 
 */

class NeoWatt extends Homey.App {

  async onUninit() {
    this.log('Neowatt has been uninit');
  }

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('Neowatt has been initialized');

    // Might modify the Log class ourselves like this:
    // https://github.com/glennsp/com.mill/blob/b807eb9b8fd825b74d4384beb180b08fb24dc44c/lib/log.js#L34
    //this.homeyLog = new Log({ homey: this.homey });

    // Import ESM modules
    // https://community.homey.app/t/can-i-use-es-modules/75540/2
    //this.fetch = await import('node-fetch');

    // Note this is only meant to be used in the method createLocalApi().
    //this.sessionToken = await this.homey.api.getOwnerApiToken();

    // Init local Homey API and store it in the app instance to
    // https://athombv.github.io/node-homey-api/HomeyAPIV3Local.html
    /* this.localHomeyApi = await HomeyAPI.createLocalAPI({
      address: await this.homey.api.getLocalUrl(),
      token: await this.homey.api.getOwnerApiToken()
    });

    const homeyName = await this.localHomeyApi.system.getSystemName(); */

    // Init cloud Homey API and store it in the app instance to be 
    // accessible from anywhere in the app
    // https://athombv.github.io/node-homey-api/HomeyAPI.html#.createAppAPI
    this.homeyApi = await HomeyAPI.createAppAPI({ homey: this.homey });

    //this.homeyId = this.homeyApi.id;
    // https://apps.developer.homey.app/cloud/webhooks#option-1-dynamic-webhooks-using-query-parameters
    //this.homeyId = await this.homey.cloud.getHomeyId();

    //const jaha = await AthomCloudAPI.getAuthenticatedUser()
    //this.homeyApi = await this.getHomeyAPI();

    // Connect to Homey API
    //await this.homeyApi.devices.connect();

    //this.homey.settings.set('refresh_token', "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE2OTgzMjc5NjksImV4cCI6MTcwMzUxMTk2OSwiYXVkIjoiaHR0cHM6Ly9uZW93YXR0Lm5vL2FwaSIsImlzcyI6Imh0dHBzOi8vbmVvd2F0dC5uby9hcGkiLCJzdWIiOiI2NTNhMmM1ZTFlZTMxNDRjODNiZTc5MjIiLCJqdGkiOiIxMjM0NTY3ODkwIn0.m1tmhW6cAuCqT_V4TWlkuUQzEc9yEV8Kl0ckORENxV4")

    this.log('Homey API connected', this.homeyId);

    //const refreshToken = this.homey.settings.get("refresh_token");

    //console.log(await this.homeyApi.users.getUserMe())

    // Get user full name
    /* const user = await this.homeyApi.users.getUserMe();
    const fullName = user.name;
    const role = user.role; */

    // Homey OS software version
    /* const softwareversion = this.homey.version; */

    // To determine homey model
    // https://apps-sdk-v3.developer.homey.app/Homey.html
    /* const platform = this.homey.platform;
    const platformVersion = this.homey.platformVersion; */

    // Time, Language and units
    /* const timezone = this.homey.clock.getTimezone();
    const language = this.homey.i18n.getLanguage();
    const units = this.homey.i18n.getUnits(); */

    // Note for future. This is available for local and platformversion 2 = Homey Pro 2023
    // https://athombv.github.io/node-homey-api/HomeyAPIV3Local.ManagerUsers.html#createPersonalAccessToken
    //const jaha = await this.homeyApi.users.createPersonalAccessToken();

    //console.log(this)

    /* this.log("Homey settings -> refresh_token", refreshToken); */

    // Init Webhooks and attach to this instance
    await initWebhooks(this);

    // Init data pusher and attach to this instance
    await pushData(this);

/*     const dischargeTrigger = this.homey.flow.getTriggerCard("discharge");

    const tokens = {
      min_soc: 33,
    };

    try {
      await dischargeTrigger.trigger(tokens);
    } catch (error) {
      this.error(error)
    } */


    // Note, it is not possible to create flows using the Homey APP API, it MUST be done via the cloud
    // API. So we can't do this inside the app.
    // try {
    //   const flow = await this.localHomeyApi.flow.getFlow({ id: "b3841a2e-8042-40fd-b597-8f4a3f9d54c7" });
    //   console.log(JSON.stringify(flow, null, 4));

    //   /* const flows  = await this.homeyApi.flow.getFlows();
    //   console.log(flows) */

    //   await this.localHomeyApi.flow.createFlow({
    //     flow: {
    //       name: "NW - discharge battery and set SOC",
    //       enabled: true,
    //       trigger: {
    //         id: "homey:device:c2ed5aa9-d1b4-4328-bd0c-21a230f300a4:price_at_lowest",
    //         args: {
    //           hours: 2,
    //         },
    //       },
    //       actions: [
    //         {
    //           id: "homey:device:8e49aa3f-9156-4966-bcd6-29b2a4514509:set_batterylife_state",
    //           group: "then",
    //           args: {
    //             mode: {
    //               id: "9",
    //               name: "Keep batteries charged",
    //             },
    //           },
    //         },
    //         {
    //           id: "homey:device:8e49aa3f-9156-4966-bcd6-29b2a4514509:update_minimum_soc",
    //           args: {
    //             soc: 33,
    //           },
    //           group: "then",
    //         },
    //       ],
    //     },
    //   });
    // } catch (error) {
    //   this.log("error", error);
    // }
    


    //this.log("homeyApi users", await this.homeyApi.users.getUserMe())

    //this.log("this.homey", this.homey)



    // Access this instance at HomeyAPIV2.devices
    //const devices = await this.homeyApi.devices.getDevices();


    // Rate limit check
    // Conclusion: We are not rate limited here using the homeyApi, tried down to a call each 0,5 sec
    /* setInterval(async () => {

      try {
        const devices = await this.homeyApi.devices.getDevices();

        // Convert to array
        const devicesArray = Object.keys(devices).map(key => devices[key])

        this.log("devices", devicesArray.length)
      } catch (error) {
        this.log("error", error)
      }
      
    }, 500) */

    //const user = await this.homeyApi.users.getUserMe();

    

    //this.log("user", user)

    //this.log(devices)


    //const homey = this.homey;

    //const username = this.homey.settings.set('username', 'vegard');

    //console.log("homey", homey)
    //this.log("homey", homey)
  }

  async getHomeyAPI() {
    const api = new HomeyAPI({
      localUrl: this.localURL,
      baseUrl: this.localURL,
      token: this.sessionToken,
      apiVersion: 2,
      online: true,
    }, () => {
      // called by HomeyAPI on 401 requests
      api.setToken(this.sessionToken);
    });

    return api;
  }

}

module.exports = NeoWatt;
