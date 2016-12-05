# node-spark

Cisco Spark API Library for Node JS based on a [Swagger](http://swagger.io/specification/) definition specification.

#### Features:

- [Rate limiting headers](https://developer.ciscospark.com/blog/blog-details-8193.html) inspected to adjust request rates based on Cisco Spark API. These are automatically re-queued and sent after the `retry-after` timer expires.
- [Pagination](https://developer.ciscospark.com/pagination.html) automatically invoked when requesting max results greater than the API max.
- Capable of using either Callbacks or Promises. Promises comply with [A+ standards.](https://promisesaplus.com/)
- Simple FIFO API queueing mechanism with adjustable delay.

#### Install:

```bash
npm install --save node-spark
```

#### Example: (Using Promises)
```js
var Spark = require('node-spark');

var options = {
  token:'OWQwOGEzMDgtZDYyTOKENjQwLWI2MTTOKEN5YmMzYTI1TOKENzVhNGNjTOKENDgx'
};

Spark.init(options)
  .then(spark => {
    spark.rooms.getRooms()
      .then(res => console.log(res))
      .catch(err => console.log(err.message));
  });
```

#### Example: (Using Callbacks)
```js
var Spark = require('node-spark');

var options = {
  token:'OWQwOGEzMDgtZDYyTOKENjQwLWI2MTTOKEN5YmMzYTI1TOKENzVhNGNjTOKENDgx'
};

Spark.init(options, function(err, spark) {
  if(err) {
    console.log('error initializing spark api');
  } else {
    spark.rooms.getRooms({}, function(res) {
      console.log(res);
    }, function(err) {
      console.log(err.message);
    });
  }
});
```

### Initialization / Config

The `.init()` method accepts an `options` object. The only required object key property required is the `token`. Below shows the optional properties to override defaults for non-required options.

```js
var options = {
  token: 'OWQwOGEzMDgtZDYyTOKENjQwLWI2MTTOKEN5YmMzYTI1TOKENzVhNGNjTOKENDgx',
  swagger: 'https://raw.githubusercontent.com/CumberlandGroup/swagger-cisco-spark/master/cisco_spark_v1.json',
  delay: 600
};
```

#### Options Object

- `token` : Spark API Token
- `swagger` : File path or URL to over-ride the internal swagger file definition
- `delay` : Delay in ms between requests

### Calling the Spark API

The `init` method returns a the spark object that includes the following methods and events.

`spark.<resource>.<method>(<query>)`

The resource and method are defined in the Swagger definition. If not specified, an internal swagger definition file is used. For more information on the resource/method/query, reference this github [repository.](https://github.com/CumberlandGroup/swagger-cisco-spark)

### Events

`spark.api.on('<event>', function(<event params>) { // process event });`

Events Types:

- `request` - Emitted with each API request. The callback executed with the arguments:
  - `url` : requested URL
  - `headersObj` : object containing the headers of request
  - `bodyObj` :  object containing the contents body of the request
- `rate-limited` - Emitted when a response is returned that rate limit is hit. The callback executed with the arguments:
  - `retryAfter` : seconds that Spark API is requesting to wait before resending this request
  - `url` : requested URL
  - `headerObj` :  object containing the headers of request
  - `bodyObj` : object containing the contents body of the request
- `queued` - callback executed with the arguments:
  - `queueDepth` : size of queue
  - `url` : requested URL
  - `headersObj` :  object containing the headers of request
  - `bodyObj` : object containing the contents body of the request

### License

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
