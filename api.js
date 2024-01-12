/**
 * This is this Homey App installations own internal API, can be used in settings, pairing screens etc.
 * 
 * Not available from outside the Homey App, use Webhooks for that.
 */

module.exports = {
    async getSomething({ homey, query }) {
      // you can access query parameters like "/?foo=bar" through `query.foo`

      return;
  
      // you can access the App instance through homey.app
      const result = await homey.app.getSomething();
  
      // perform other logic like mapping result data
  
      return result;
    },
  
    async addSomething({ homey, body }) {
      // access the post body and perform some action on it.
      //return homey.app.addSomething(body);

      console.log("addSomething", body)
    },
  
    async updateSomething({ homey, params, body }) {
      //return homey.app.updateSomething(params.id, body);
    },
  
    async deleteSomething({ homey, params }) {
      //return homey.app.deleteSomething(params.id);
    },
  };