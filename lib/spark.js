'use strict';

const SwaggerClient = require('swagger-client');
const EventEmitter = require('events').EventEmitter;
const request = require('request');
const chalk = require('chalk');
const path = require('path');
const util = require('util');
const when = require('when');
const fs = require('fs');

// constructor for spark class
function Spark() {
  EventEmitter.call(this);

  var spark = this;

  var reqLast = Date.now();
  var debugLast = Date.now();

  // defaults if not specified in options object
  var _maxPageItems = 100;
  var _queueDelay = 600;
  var _swaggerDef = '../swagger/cisco_spark_v1.json';

  // promisfy JSON.parse()
  var jsonParse = when.lift(JSON.parse);

  // internal debug function
  var debug = function(msg) {
    var args = Array.prototype.slice.call(arguments);

    var offset = Date.now() - debugLast;
    debugLast = Date.now();

    if(process.env.hasOwnProperty('DEBUG') && process.env.DEBUG.toLowerCase().includes('spark')) {
      var now = new Date();
      msg = util.format.apply(spark, args);
      console.log(util.format('%s %s %s', chalk.bold('spark'), msg, chalk.cyan('+' + offset + 's')));
    }
  };

  // send request
  var sendRequest = function(opts, callback) {
    // determine if request should be processed immedialy, or queued
    if(Date.now() - reqLast > spark.queue.delay && spark.queue.contents.length === 0) {
      reqLast = Date.now();
      if(callback) {
        processRequest(opts)
          .then(res => callback(null, res))
          .catch(err => callback(err, null));
      } else {
        return processRequest(opts);
      }
    } else {
      reqLast = Date.now();
      if(callback) {
        spark.queue.add(opts)
          .then(res => callback(null, res))
          .catch(err => callback(err, null));
      } else {
        return spark.queue.add(opts);
      }
    }
  };

  // process request
  var processRequest = function(opts) {
    debug('Spark API Request sent to %s',opts.url);
    spark.emit('request', opts.url, opts.headers, opts.body);

    // filter url
    var baseUrl = opts.url.split('?')[0];
    var qs = opts.url.split('?').length > 0 ? opts.url.split('?')[1] : null;
    var qsParams = qs ? qs.split('&') : null;

    // url includes qs params
    if(qsParams) {

      // determine if max is in qsParms and modify opts
      for(var i = 0; i < qsParams.length; i++) {

        // get a qs param
        var qsParam = qsParams[i];

        // if param is "max"
        if(qsParam.split('=')[0].toLowerCase() === 'max') {

          // get max value
          var maxVal = qsParam.split('=')[1];

          // if _maxResults is not set
          if(!opts.hasOwnProperty('_maxResults')) {
            // store max value in request opts
            opts._maxResults = maxVal;

            // replace max with max items to return per request
            qsParams[i] = 'max=' + _maxPageItems;
          }
        }
      }
    }

    // reassemble url if qsParams
    if(qsParams) {
      opts.url = baseUrl + '?' + qsParams.join('&');
    }

    // make request
    return when.promise(function(resolve, reject)  {
      request(opts, function(err, res) {
        if(err) {
          reject(err);
        } else if(res) {
          resolve(processResponse(res, opts));
        } else {
          reject(new Error('response not recieved'));
        }
      });
    });
  };

  // process response
  var processResponse = function(res, opts) {
    var status = null;
    var headers = null;
    var body = null;

    // validate response
    if(!(res && typeof res === 'object')) {
      return when.reject(new Error('')); //TODO
    }

    // get/set status code
    if(res && res.hasOwnProperty('statusCode') && typeof res.statusCode === 'number') {
      status = res.statusCode;
    } else {
      status = 500;
    }

    // get/validate headers
    if(res && res.hasOwnProperty('headers') && typeof res.headers === 'object') {
      headers = res.headers;
    } else {
      return when.reject(new Error('invalid response headers')); //TODO
    }

    // get/validate body
    if(res && res.hasOwnProperty('body') && typeof res.body === 'object') {
      body = res.body;
    } else {
      return when.reject(new Error('invalid response body')); //TODO
    }

    // if 204 delete
    if(status === 204) {
      return when({});
    }

    // if 429
    else if(status === 429) {
      // default retry delay
      var retryAfter = 15;

      // attempt to determine true delay from api headers
      if(headers && headers.hasOwnProperty('retry-after')) {
        retryAfter = headers['retry-after'];
      }

      // emit rate-limited event
      if(retryAfter > 0) {
        debug('Spark API rate limit exceeded and response will be delayed for %ss before being reattempted', retryAfter);
        spark.emit('rate-limited', retryAfter, opts.url, opts.headers, opts.body);
      }

      return when(true).delay(retryAfter * 1000).then(() => sendRequest(opts));
    }

    // if 200
    else if(status === 200) {
      // if response is array
      if(body.hasOwnProperty('items') && Array.isArray(body.items)) {
        // return when(body.items);

        // if pagination...
        if(opts.hasOwnProperty('_maxResults')) {

          // if link header
          if(headers.hasOwnProperty('link')) {

            // parse link from header
            var parsedLink = headers.link.match(/(http.*)>/);
            var url = parsedLink && Array.isArray(parsedLink) && parsedLink.length > 1 ? parsedLink[1] : null;

            // parse maxResults from request opts
            var maxResults = opts.hasOwnProperty('_maxResults') ? opts._maxResults : null;

            // array to hold accumulated items
            var items = [];

            // populate items array
            if(opts.hasOwnProperty('_items')) items = opts._items.concat(body.items);
            else items = body.items;

            // if maxResults retrieved, return accumulated items
            if(maxResults && items.length >= maxResults) return when(items.slice(0, maxResults));

            // if requesting next page...
            if(maxResults && url) {
              // construct request for next page
              var pOpts = JSON.parse(JSON.stringify(opts));
              pOpts.url = url;
              pOpts._items = items;

              // request next page (recursive)
              return sendRequest(pOpts);
            }

            // else, link header does not exist, return current accumulated items
            else {
              return when(items);
            }
          }

          //  else, no pagination link
          else {
            if(opts.hasOwnProperty('_items')) return when(opts._items.concat(body.items));
            else return when(body.items);
          }
        }

        // else, no pagination...
        else {
          return when(body.items);
        }

      }

      // else response is single object
      else {
        return when(body);
      }
    }

    // else other response status
    else {
      var errMessage = util.format('request recieved http error %s', status);
      debug(errMessage);
      return when.reject(new Error(errMessage));
    }
  };

  // define exposed spark properties/methods
  this.spec = {}; // object implementation of swagger json
  this.token = null; // current spark api token
  this.def = null; // file or url reference to swagger json file
  this.request = sendRequest; // method to send request

  // define queue
  this.queue = {
    contents: [],
    interval: null,
    delay: 0,
    add: function(opts) {
      return when.promise((resolve, reject) => {
        var request = { resolve: resolve, reject: reject, opts: opts };
        spark.queue.contents.push(request);
        spark.queue.start();
        spark.emit('queued', spark.queue.contents.length, opts.url, opts.headers, opts.body);
        debug('Queue item **added** and queue depth is now %s', spark.queue.contents.length);
      });
    },
    start: function() {
      if(!this.interval) {
        this.interval = setInterval(() => {
          spark.queue.process();
        }, this.delay);
      }
    },
    stop: function() {
      if(this.interval) {
        clearInterval(this.interval);
        this.interval = null;
      }
    },
    process: function() {
      if(this.contents.length > 0) {
        var q = this.contents.shift();
        processRequest(q.opts)
          .then(res => {
            q.resolve(res);
            debug('Queue item **processed** and queue depth is now %s', spark.queue.contents.length);
          })
          .catch(err => q.reject(err));
      } else {
        this.stop();
      }
    }
  };

  // init swagger client
  this.init = function(options, callback) {

    // validate token
    if(options && options.hasOwnProperty('token') && typeof options.token === 'string') {
      spark.token = options.token;
    } else if(process.env.TOKEN) {
      spark.token = process.env.TOKEN;
    } else {
      var err = new Error('token not defined');
      if(callback) {
        return callback(err, null);
      } else {
        return when.reject(err);
      }
    }

    // if queueDelay interval passed in options
    if(options && options.hasOwnProperty('delay') && typeof options.delay === 'number') {
      spark.queue.delay = options.delay;
    } else {
      spark.queue.delay = _queueDelay;
    }

    // if swagger reference passed in options
    if(options && options.hasOwnProperty('swagger') && typeof options.swagger === 'string') {
      spark.def = options.swagger;
      if(!/^https?:/.test(spark.def) && !path.isAbsolute(spark.def)) {
        // normalize path as relative to folder containing node_modules
        spark.def = path.normalize(path.join(__dirname, '/../../../', spark.def));
      }
    } else {
      spark.def = path.normalize(path.join(__dirname, _swaggerDef));
    }

    var scheme = 'apiKey';
    var auth = new SwaggerClient.ApiKeyAuthorization('Authorization', 'Bearer ' + spark.token, 'header');

    // load spark swagger api spec
    var apiURI = when.promise((resolve, reject) => {
      // if spark.def is url
      if(/^https?:/.test(spark.def)) {
        debug('Loading Spark API spec from %s', spark.def);

        // read swagger file from url
        request.get(spark.def, function(err, res) {
          if(err) {
            reject(new Error('can not access url at ' + spark.def));
          } else {
            resolve(jsonParse(res.body));
          }
        });
      }

      // else, spark.def is file
      else {
        debug('Loading Spark API spec from %s', spark.def);

        // read file
        fs.readFile(spark.def, 'utf8', function(err, data) {
          if(err) {
            reject(new Error('can not read file ' + spark.def));
          } else {
            resolve(jsonParse(data));
          }
        });
      }
    });

    // define http client
    var httpClient = {
      execute: function(req) {
        sendRequest({
          method: req.method,
          headers: req.headers,
          url: req.url,
          body: req.body,
          timeout: 30000,
          json: true
        })
        .then(res => req.on.response(res))
        .catch(err => req.on.error(err));
      }
    };

    if(callback) {
      when(apiURI)
        .then(spec => {
          spark.spec = spec;
          var client = new SwaggerClient({"spec": spec, "client": httpClient, success: function() {
            client.clientAuthorizations.add(scheme, auth);

            // extend client object to expose 'this' as client.api
            client.api = spark;

            // return client
            callback(null, client);
          }});
        })
        .catch(err => {
          callback(err, null);
        });

    } else {
      return when(apiURI)
        .then(spec => {
          spark.spec = spec;
          return new SwaggerClient({"spec": spec, "client": httpClient, "usePromise": true});
        })
        .then(client => {
          client.clientAuthorizations.add(scheme, auth);

          // extend client object to expose 'this' as client.api
          client.api = spark;

          // return client
          return when(client);
        });
    }
  };
}
util.inherits(Spark, EventEmitter);

module.exports = new Spark();
