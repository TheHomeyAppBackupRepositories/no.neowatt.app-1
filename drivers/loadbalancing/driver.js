'use strict';

const Homey = require('homey');
const fetch = require('node-fetch');
const { HomeyAPI } = require('../../homey-api');
const { Log } = require('homey-log');
/* import PairSession from 'homey/lib/PairSession'; */

// Remember, everything outside the class is shared between multiple Homey instances when using Homey Cloud
const host = Homey.env.NEOWATT_URL;

// Long lived app specific refresh token. Only used to create new user accounts and check if a user already exist.
// Not to be confused with the user access/refresh tokens.
const token = Homey.env.NEOWATT_REFRESH_TOKEN;

// Maybe call this class Load balancing, peak shaving etc instead of Status, which is very generic?
class LoadBalancingDriver extends Homey.Driver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('NeoWatt Load Balancing Driver has been initialized');
    
    this.homeyApi = await HomeyAPI.createAppAPI({ homey: this.homey });

    this.localHomeyApi = await HomeyAPI.createLocalAPI({
      address: await this.homey.api.getLocalUrl(),
      token: await this.homey.api.getOwnerApiToken()
    });

    //this.homeyLog = new Log({ homey: this.homey });
  }

  /**
   * This method is called when a pair session starts.
   * 
   */
  async onPair(session) {

    // Gotcha: Code like session.showView("register") MUST be inside a setHandler function
    // to work. It can be added into a setTimeout, but will be unstable.

    // Works:
    /* session.setHandler("create", async (data) => {
      // data is { 'foo': 'bar' }
      console.log(data)
      return "Hello!";
    }); */

    // Fetch Homey ID from app instance
    //const { homeyId } = this.homey.app;
    const homeyId = await this.homey.cloud.getHomeyId();

    // Check whether the user already have a NeoWatt account
    const response = await fetch(`${host}/api/2023-10/integrations/homey/${homeyId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    this.log("response.ok", response.ok)
    this.log("response.status", response.status)

    session.setHandler('showView', async (viewId) => {
      // We'll only want this to run when the viewId is "loading"
      if (viewId !== 'loading') return;

      // Homey already exist in NeoWatt
      if (response.ok && response.status === 200) {
        // Show login view
        this.log("Homey already exist in NeoWatt, show login")

        // @todo: Check if refresh token is valid, and if it is, then show the device list view
        // and if not, then show the login view
        //await session.showView("register");
        await session.showView("login_credentials");
      }

      // Homey does not exist in NeoWatt
      if (!response.ok && response.status === 404) {
        // Show register now view
        this.log("Homey does not exist in NeoWatt, show register now")

        //await session.showView("login_credentials");
        await session.showView("register");
      }

    });

    // Received when a view has changed
    /* session.setHandler("showView", async function (viewId) {
      console.log("View: " + viewId);
    }); */

    session.setHandler("create", async (data) => {
      //console.log(data)

      const { email, password } = data;

      // Basic validation for email and password
      const emailRegex = /^\S+@\S+\.\S+$/;
      if (emailRegex.test(email) === false) {
        //return { success: false, reason: "Invalid email" };
      }

      // Password must contain at least one lowercase letter, one uppercase letter, one numeric digit, and min length 8
      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{8,}$/;
      if (passwordRegex.test(password) === false) {
        //return { success: false, reason: "Invalid password. Include at least one lowercase letter, one uppercase letter, one number and min length 8"};
      }

      // Get Homey location
      const long = this.homey.geolocation.getLongitude();
      const lat = this.homey.geolocation.getLatitude();
      const accuracy = this.homey.geolocation.getAccuracy();

      // Homey OS software version
      const softwareversion = this.homey.version;

      // Time, Language and units
      const timezone = this.homey.clock.getTimezone();
      const language = this.homey.i18n.getLanguage();
      const units = this.homey.i18n.getUnits();

      // To determine homey model
      const platform = this.homey.platform;
      const platformVersion = this.homey.platformVersion;

      // Get the actual Homey name (Per's Homey Pro)
      const homeyName = await this.localHomeyApi.system.getSystemName();

      // Get user full name
      const user = await this.homeyApi.users.getUserMe();
      const fullName = user.name;
      const role = user.role;

      let res;
      let body = { message: "" }

      try {

        res = await fetch(`${host}/api/2023-10/integrations/homey/${homeyId}/users`, {
          timeout: 10000,
          method: "POST",
          headers: { 
            Authorization: `Bearer ${token}`, 
            "Content-type": "application/json"
          },
          body: JSON.stringify({
            email: email.toLowerCase(),
            password: password,
            fullname: fullName,
            language: language,
            timezone: timezone,
            units: units,
            role: role,
            gateway: {
              name: homeyName,
              software: softwareversion,
              lat: lat,
              lng: long,
              accuracy: accuracy,
              platform: platform,
              platformVersion: platformVersion
            }
          }),
        });

        this.log("res.ok", res.ok)
        this.log("res.status", res.status)

        body = await res?.json();
        this.log("res.body", body)

      } catch (error) {
        // Add Sentry logging here e.g.
        // We dont throw error here, since it will be "handled" by the fallback error return at the bottom
        //this.homeyLog.captureException(error);
        console.log(error)
      }

      // User created
      if (res.status === 200) {
        // We can switch view here or inside the register.html frontend file
        //await session.showView("login_credentials");
        return { success: true };
      }

      // User already exist
      if (res.status === 409 && body.message === "User already exists") {
          return { success: false, reason: "User already exists. Try logging in instead" };
      }

      // Fallback error
      return { 
        success: false, 
        reason: `Unknown error. Please retry pairing process. Statuscode: ${res.status} Detailed error message: ${body.message}` 
      };

    })

    session.setHandler("addHomeyToExistingUser", async (data) => {
      //console.log(data)

      const { email, password } = data;

      // Basic validation for email and password
      const emailRegex = /^\S+@\S+\.\S+$/;
      if (emailRegex.test(email) === false) {
        return { success: false, reason: "Invalid email" };
      }

      // Password must contain at least one lowercase letter, one uppercase letter, one numeric digit, and min length 8
      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{8,}$/;
      if (passwordRegex.test(password) === false) {
        //return { success: false, reason: "Invalid password. Include at least one lowercase letter, one uppercase letter, one number and min length 8"};
      }

      // Get Homey location
      const long = this.homey.geolocation.getLongitude();
      const lat = this.homey.geolocation.getLatitude();
      const accuracy = this.homey.geolocation.getAccuracy();

      // Homey OS software version
      const softwareversion = this.homey.version;

      // Time, Language and units
      const timezone = this.homey.clock.getTimezone();
      const language = this.homey.i18n.getLanguage();
      const units = this.homey.i18n.getUnits();

      // To determine homey model
      const platform = this.homey.platform;
      const platformVersion = this.homey.platformVersion;

      // Get the actual Homey name (Per's Homey Pro)
      const homeyName = await this.localHomeyApi.system.getSystemName();

      // Get user full name
      const user = await this.homeyApi.users.getUserMe();
      const fullName = user.name;
      const role = user.role;

      let res;
      let body = { message: "" }

      try {

        res = await fetch(`${host}/api/2023-10/integrations/homey/${homeyId}/users`, {
          timeout: 10000,
          method: "PUT",
          headers: { 
            Authorization: `Bearer ${token}`, 
            "Content-type": "application/json"
          },
          body: JSON.stringify({
            email: email.toLowerCase(),
            password: password,
            fullname: fullName,
            language: language,
            timezone: timezone,
            units: units,
            role: role,
            gateway: {
              name: homeyName,
              software: softwareversion,
              lat: lat,
              lng: long,
              accuracy: accuracy,
              platform: platform,
              platformVersion: platformVersion
            }
          }),
        });

        this.log("res.ok", res.ok)
        this.log("res.status", res.status)

        body = await res?.json();
        this.log("res.body", body)

      } catch (error) {
        // Add Sentry logging here e.g.
        // We dont throw error here, since it will be "handled" by the fallback error return at the bottom
        //this.homeyLog.captureException(error);
        console.log(error)
      }

      // User updated
      if (res.status === 200) {
        // We can switch view here or inside the register.html frontend file
        //await session.showView("login_credentials");
        return { success: true };
      }

      // Password or username not correct
      if (res.status === 401 && body.message === "Unauthorized") {
        return { success: false, reason: "Username or password not correct." };
      }

      // Homey already exists. User needs to login instead
      if (res.status === 409 && body.message === "Homey already exists") {
        return { success: false, reason: "Homey already exists in your NeoWatt account. Please login instead." };
    }

      // Fallback error
      return { success: false, reason: "Unknown error. Please retry pairing process." };

    })

    session.setHandler("login", async (data) => {
      const { username: email, password } = data;

      this.log("email", email)
      //this.log("password", password)

      // Basic validation for email and password
      if (email === "" || password === "") {
        throw new Error('You need to enter both email and password. Please try again.');
      }

      let res;
      let body = { refresh_token: undefined, access_token: undefined };

      try {
        res = await fetch(`${host}/api/2023-10/auth/token`, {
          timeout: 10000,
          method: "POST",
          headers: { 
            "Content-type": "application/json"
          },
          body: JSON.stringify({
            client_id: email.toLowerCase(),
            client_secret: password,
            grant_type: "client_credentials"
          }),
        });

        this.log("res.ok", res.ok)
        this.log("res.status", res.status)

        body = await res?.json();
        this.log("res.body", body)

      } catch (error) {
        // Add Sentry logging here e.g.
        // We dont throw error here, since it will be "handled" by the fallback error return at the bottom
        //this.homeyLog.captureException(error);
        console.log(error)
      }

      // User logged in
      if (res.status === 200 && body.refresh_token && body.access_token) {
        
        // Store the refresh token in the Homey settings, will be used to refresh the access token
        // in each request to the NeoWatt API
        this.homey.settings.set('refresh_token', body.refresh_token);

        // return true to continue adding the device if the login succeeded
        // return false to indicate to the user the login attempt failed
        // thrown errors will also be shown to the user
        return true
      }

      // Credentials are wrong
      if (res.status === 401) {
        throw new Error('Wrong username/mail or password. Please try again.');
      }

      // Fallback error
      throw new Error('Unknown error. Please retry pairing process.');
      
    });

    session.setHandler("list_devices", async function () {
      
      // you can emit when devices are still being searched
      // session.emit("list_devices", devices);

      // return devices when searching is done
      return [{
        // The name of the device that will be shown to the user
        name: "Load balancing",

        // The data object is required and should contain only unique properties for the device.
        // So a MAC address is good, but an IP address is bad (can change over time)
        data: {
          id: "neowatt.loadbalancing",
        },

        // Optional: Initial device settings that can be changed by the user afterwards
        settings: {

        },
         // Optional: The store is dynamic and persistent storage for your device
        store: {

        }
      }];

      // when no devices are found, return an empty array
      // return [];

      // or throw an Error to show that instead
      // throw new Error('Something bad has occured!');
    });

    session.setHandler("quickInfo", async (data) => {
      //console.log(data)

      

    })

  }

  /**
   * onPairListDevices is called when a user is adding a device
   * and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  /*   async onPairListDevices() {

    return [
      // Example device data, note that `store` is optional
      // {
      //   name: 'My Device',
      //   data: {
      //     id: 'my-device',
      //   },
      //   store: {
      //     address: '127.0.0.1',
      //   },
      // },
    ];
  } */

}

module.exports = LoadBalancingDriver;
