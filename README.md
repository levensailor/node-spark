# node-spark

Cisco Spark API Library for Node JS based on a [Swagger](http://swagger.io/specification/) definition specification.

```js
var CiscoSpark = require('node-spark');

CiscoSpark.init({token:'OWQwOGEzMDgtZDYyTOKENjQwLWI2MTTOKEN5YmMzYTI1TOKENzVhNGNjTOKENDgx'})
  .then(spark => {
    spark.rooms.getRooms()
      .then(res => console.log(res))
      .catch(err => console.log(err.message));
  });
```

#### Features:

- [Rate limiting headers](https://developer.ciscospark.com/blog/blog-details-8193.html) inspected to adjust request rates based on Cisco Spark API. These are automatically re-queued and sent after the `retry-after` timer expires.
- [Pagination](https://developer.ciscospark.com/pagination.html) automatically invoked when requesting max results greater than the API max.
- Returns promises that comply with [A+ standards.](https://promisesaplus.com/)
- Simple FIFO API queueing mechanism with adjustable delay.

### Install

```bash
npm install --save node-spark
```

### Initialization / Config

The `.init()` method accepts an `options` object. The only required object key property required is the `token`. Below shows the optional properties to override defaults for non-required options.

```js
var CiscoSpark = require('node-spark');

var options = {
  token: 'OWQwOGEzMDgtZDYyTOKENjQwLWI2MTTOKEN5YmMzYTI1TOKENzVhNGNjTOKENDgx',
  swagger: 'https://raw.githubusercontent.com/CumberlandGroup/swagger-cisco-spark/master/cisco_spark_v1.json',
  delay: 600
};

CiscoSpark.init(options)
  .then(spark => {
    // spark api calls
  })
```

#### Options Object

- `token` : Spark API Token
- `swagger` : File path or URL to over-ride the internal swagger file definition
- `delay` : Delay in ms between requests

### Reference

The `init` method returns a the spark object that includes the following methods and events.

`spark.<resource>.<method>(<query>)`

The resource and method are defined in the swagger file. If not specified, an internal swagger definition file. For more information on the resource/method/query, reference this github [repository.](https://github.com/CumberlandGroup/swagger-cisco-spark)

`spark.api.on('<event>', function(<event params>) { // process event });`

Events:

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
