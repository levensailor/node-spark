'use strict';

const SwaggerClient = require('swagger-client');
const EventEmitter = require('events').EventEmitter;
const request = require('request');
const debug = require('debug')('spark');
const path = require('path');
const util = require('util');
const when = require('when');
const fs = require('fs');

// promisfy JSON.parse()
var jsonParse = when.lift(JSON.parse);

// defaults if not specified in options object
var _maxPageItems = 100;
var _queueDelay = 600;
var _swaggerDef = '../swagger/cisco_spark_v1.json';

// get full path for spark swagger definition file
function getDefPath(defPath) {
  // if path passed...
  if(defPath) {
    // if not url and not absolute...
    if(!/^https?:/.test(defPath) && !path.isAbsolute(defPath)) {
      // normalize path as relative to folder containing node_modules
      return path.normalize(path.join(__dirname, '/../../../', defPath));
    }

    // else, return unchanged...
    else {
      return defPath;
    }
  }

  // else, return defualt path...
  else {
    return path.normalize(path.join(__dirname, _swaggerDef));
  }
};

// constructor for spark class
function Spark(options) {
  EventEmitter.call(this);

  var spark = this;

  this.options = options;
  this.reqLast = Date.now();
  this.client = null;
  this.spec = null;
  this.token = null;
  this.auth = null;
  this.def = null;

  // swagger-client http client object
  this.swaggerHttpClient = {
    execute: function(req) {
      var opts = {
        method: req.method,
        headers: req.headers,
        url: req.url,
        timeout: 30000,
        json: true
      };

      if(req.headers.hasOwnProperty('Content-Type') && req.headers['Content-Type'].includes('www-form')) {
        opts.form = req.body;
      } else {
        opts.body = req.body;
      }

      spark.sendRequest(opts)
        .then(res => req.on.response(res))
        .catch(err => req.on.error(err));
    }
  };

  // define queue
  this.queue = {
    delay: _queueDelay,
    contents: [],
    interval: null,
    add: function(opts) {
      return when.promise((resolve, reject) => {
        var request = { resolve: resolve, reject: reject, opts: opts };
        spark.queue.contents.push(request);
        spark.queue.start();
        spark.emit('queued', spark.queue.contents.length, opts.url, opts.headers, opts.body);
      });
    },
    start: function() {
      if(!spark.queue.interval) {
        spark.queue.interval = setInterval(() => {
          spark.queue.process();
        }, spark.queue.delay);
      }
    },
    stop: function() {
      if(spark.queue.interval) {
        clearInterval(spark.queue.interval);
        spark.queue.interval = null;
      }
    },
    process: function() {
      if(spark.queue.contents.length > 0) {
        var q = spark.queue.contents.shift();
        spark.processRequest(q.opts)
          .then(res => q.resolve(res))
          .catch(err => q.reject(err));
      } else {
        spark.queue.stop();
      }
    }
  };

  // if queue delay is passed in options
  if(this.options && this.options.hasOwnProperty('delay') && typeof this.options.delay === 'number') {
    this.queue.delay = this.options.delay;
  }

  // if swagger reference passed in options
  if(this.options && this.options.hasOwnProperty('swagger') && typeof this.options.swagger === 'string') {
    this.def = getDefPath(this.options.swagger);
  } else {
    this.def = getDefPath();
  }

  // validate token
  if(this.options && this.options.hasOwnProperty('token') && typeof options.token === 'string') {
    spark.token = options.token;
  } else if(process.env.SPARK_ACCESS_TOKEN) {
    spark.token = process.env.SPARK_ACCESS_TOKEN;
  } else {
    throw new Error('required options not set - token');
  }
}
util.inherits(Spark, EventEmitter);

Spark.prototype.connect = function() {
  var spark = this;

  // if client is already initalized
  if(spark.client) {
    return when(spark.client);
  }

  // else, initialize client
  else {
    return spark.getSpec(spark.def)
      .then(spec => spark.spec = spec)
      .then(() => spark.getClient(spark.spec, spark.token))
      .then(client => {
        spark.client = client;
        return when(spark.client);
      });
  }
};

// load spark swagger api spec
Spark.prototype.getSpec = function(defPath) {
  var spark = this;

  if(this.spec) {
    return when(this.spec);
  } else {
    return when.promise((resolve, reject) => {
      // if defPath is url
      if(/^https?:/.test(defPath)) {
        debug('Loading Spark API spec from %s', defPath);

        // read swagger file from url
        request.get(defPath, function(err, res) {
          if(err) {
            reject(new Error('can not access url at ' + defPath));
          } else {
            resolve(jsonParse(res.body));
          }
        });
      }

      // else, defPath is file
      else {
        debug('Loading Spark API spec from %s', defPath);

        // read file
        fs.readFile(defPath, 'utf8', function(err, data) {
          if(err) {
            reject(new Error('can not read file ' + defPath));
          } else {
            resolve(jsonParse(data));
          }
        });
      }
    })
    .then(spec => {
      spark.spec = spec;
      return when(spark.spec);
    });
  }
};

// set authorization for swagger client
Spark.prototype.authClient = function(client, token) {
  var spark = this;

  spark.auth = new SwaggerClient.ApiKeyAuthorization('Authorization', 'Bearer ' + token, 'header');
  client.clientAuthorizations.add('Token', spark.auth);
};

// get spark swagger client
Spark.prototype.getClient = function(spec, token) {
  var spark = this;

  var args = Array.prototype.slice.call(arguments);
  spec = args.length > 0 && typeof args[0] === 'object' ? args.shift() : null;
  token = args.length > 0 && typeof args[0] === 'string' ? args.shift() : null;

  // validate required arguments
  if(typeof spec !== 'object') {
    return when.reject(new Error('required options not set'));
  }

  var newClient = new SwaggerClient({
    'spec': spec,
    'client': spark.swaggerHttpClient,
    'usePromise': true
  });

  return when(newClient)
    .then(client => {
      if(token) spark.authClient(client, token);
      return client;
    });
};

// send request
Spark.prototype.sendRequest = function(opts) {
  var spark = this;

  // determine if request should be processed immedialy, or queued
  if(Date.now() - spark.reqLast > spark.options.delay && spark.queue.contents.length === 0) {
    spark.reqLast = Date.now();
    return spark.processRequest(opts);
  } else {
    spark.reqLast = Date.now();
    return spark.queue.add(opts);
  }
};

// process request
Spark.prototype.processRequest = function(opts) {
  var spark = this;

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
        resolve(spark.processResponse(res, opts));
      } else {
        reject(new Error('response not recieved'));
      }
    });
  });
};

// process response
Spark.prototype.processResponse = function(res, opts) {
  var spark = this;

  var status = null;
  var headers = null;
  var body = null;

  // validate response
  if(!(res && typeof res === 'object')) {
    return when.reject(new Error('invalid response'));
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
    return when.reject(new Error('invalid response headers'));
  }

  // get/validate body
  if(res && res.hasOwnProperty('body') && typeof res.body === 'object') {
    body = res.body;
  } else {
    return when.reject(new Error('invalid response body'));
  }

  // if 204 delete
  if(status === 204) {
    return when({});
  }

  // if 429
  if(status === 429) {
    // default retry delay
    var retryAfter = 15;

    // attempt to determine true delay from api headers
    if(headers && headers.hasOwnProperty('retry-after')) {
      retryAfter = headers['retry-after'];
    }

    // emit rate-limited event
    if(retryAfter > 0) {
      debug('Spark API rate limit exceeded and response will be delayed for %ssec before being reattempted', retryAfter);
      spark.emit('rate-limited', retryAfter, opts.url, opts.headers, opts.body);
    }

    return when(true).delay(retryAfter * 1000).then(() => spark.sendRequest(opts));
  }

  // if 200
  else if(status === 200) {
    // if response is array
    if(body.hasOwnProperty('items') && Array.isArray(body.items)) {
      // return when(body.items);

      // if pagination...
      if(opts.hasOwnProperty('_maxResults')) {

        // parse maxResults from request opts
        var maxResults = opts._maxResults;

        // if link header
        if(headers.hasOwnProperty('link')) {

          // parse link from header
          var parsedLink = headers.link.match(/(http.*)>/);
          var url = parsedLink && Array.isArray(parsedLink) && parsedLink.length > 1 ? parsedLink[1] : null;

          // array to hold accumulated items
          var items = [];

          // populate items array
          if(opts.hasOwnProperty('_items')) items = opts._items.concat(body.items);
          else items = body.items;

          // if maxResults retrieved, return accumulated items
          if(maxResults && items.length >= maxResults) {
            return when(items.slice(0, maxResults));
          }

          // if requesting next page...
          if(maxResults && url) {
            // construct request for next page
            var pOpts = JSON.parse(JSON.stringify(opts));
            pOpts.url = url;
            pOpts._items = items;

            // request next page (recursive)
            return spark.sendRequest(pOpts);
          }

          // else, link header does not exist, return current accumulated items
          else {
            return when(items);
          }
        }

        //  else, no pagination link
        else {
          if(opts.hasOwnProperty('_items')) {
            body.items = opts._items.concat(body.items);
          }

          if(body.items.length > maxResults) {
            return when(body.items.slice(0, maxResults));
          } else {
            return when(body.items);
          }
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


module.exports = Spark;
