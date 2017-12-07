module.exports = require('./lib/spark');
"use strict";

var CiscoSpark = require('node-spark');
var dotenv = require('dotenv');
var _ = require('lodash');
var jp = require('jsonpath');

const ciscoSupportUrl = 'https://api.cisco.com/bug/v2.0/bugs/bug_ids/'
dotenv.config({path: './bugz.conf'});
dotenv.load();

var options = {
  token: process.env.TOKEN,
  swagger: process.env.SWAGGER,
  delay: 600
};

var spark = new CiscoSpark(options);

spark.connect()
  .then(client => client.rooms.getRooms())
  .catch(err => console.log(err.message));

var Webhook = require('node-spark/webhook');
var express = require('express');
var fs = require('fs');
var bodyParser = require('body-parser');
var path = require('path');
var webhook = new Webhook();
var token = '';

// add events
webhook.on('request', function(hook) {

  //debug JSON data - paste in http://www.jsonquerytool.com/#/Lodash to build query! real time saver
  fs.writeFile('./log.json',JSON.stringify(hook), 'utf-8', function(err){
    if (err) throw err
    })

    const roomId = _.chain(hook)
    .result('data')
    .result('roomId')
    .value();

    const messageId = _.chain(hook)
        .result('data')
        .result('id')
        .value();

//    const messageContentsFromId = spark.client.messages.getMessage(messageId);
//    console.log(messageContentsFromId);

    const roomType = _.chain(hook)
        .result('data')
        .result('roomType')
        .value();


//Until I learn Async programming..
    if (typeof roomId !== 'undefined' && bugId !== 'undefined' && roomType !== 'undefined'){

      //Same command with different levels of output, as appropriate
      switch (roomType){
        case 'direct': getBugForDirect(bugId, roomId);
        break;

        case 'group': getBugForGroup(bugId, roomId);
        break;
      }
    }

function getBugForDirect(bugId, roomId){

  var request = require("request");
  var options = { method: 'POST',
    url: 'https://cloudsso.cisco.com/as/token.oauth2',
    headers:
     { 'postman-token': 'f0c70676-1274-9470-9850-7f3337f4c305',
       'cache-control': 'no-cache',
       'user-agent': 'Jakarta Commons-HttpClient/3.1',
       'content-length': '103',
       host: 'cloudsso.cisco.com',
       'accept-encoding': 'gzip,deflate',
       accept: 'application/json',
       'content-type': 'application/x-www-form-urlencoded' },
    form:
     { client_id: process.env.CLIENT_ID,
       grant_type: process.env.GRANT_TYPE,
       client_secret: process.env.CLIENT_SECRET } };

  request(options, function (error, response, body) {
    if (error) throw new Error(error);

    token = JSON.parse(body).access_token;

    //define token
    if (typeof token !== 'undefined'){
    var options = { method: 'GET',
      url: ciscoSupportUrl + bugId,
      headers:
       { 'postman-token': '3f23673f-b6c1-61c7-4877-9ef229cbc17d',
         'cache-control': 'no-cache',
         accept: 'application/json',
         authorization: 'Bearer ' + token } };

    request(options, function (error, response, body) {
      if (error) throw new Error(error);

      var ifNotFixed = '';
      if (typeof JSON.parse(body) !== 'undefined'){
      //Check to see if the bug has a headline, as all legit bugs should
      if (JSON.parse(body).bugs[0].headline !== ''){

      if (JSON.parse(body).bugs[0].known_fixed_releases == '') {
        ifNotFixed = 'none';
      } else {
        ifNotFixed = JSON.parse(body).bugs[0].known_fixed_releases
      }

      //Send Bug info (detailed) direct to person, if its legit
      spark.client.messages.createMessage(
        {
          "body":{
            "roomId": roomId,
            "markdown":
            '###'+JSON.parse(body).bugs[0].headline+'\n\n'+
            ''+JSON.parse(body).bugs[0].description+'`',
          }
        }
      )
    }
    else {
      //otherwise Send note saying this is not a bug
      spark.client.messages.createMessage(
        {
          "body":{
            "roomId": roomId,
            "markdown": 'Ughh.. I cannot find '+bugId+' Should this be a bug?',
          }
        }
      )
    }
  }
    });//supportRequest
    }//token undefined check
  });//oauth2Request
}//getBugForDirect

function getBugForGroup(bugId, roomId){

  var request = require("request");
  var options = { method: 'POST',
    url: 'https://cloudsso.cisco.com/as/token.oauth2',
    headers:
     { 'postman-token': 'f0c70676-1274-9470-9850-7f3337f4c305',
       'cache-control': 'no-cache',
       'user-agent': 'Jakarta Commons-HttpClient/3.1',
       'content-length': '103',
       host: 'cloudsso.cisco.com',
       'accept-encoding': 'gzip,deflate',
       accept: 'application/json',
       'content-type': 'application/x-www-form-urlencoded' },
    form:
    { client_id: process.env.CLIENT_ID,
      grant_type: process.env.GRANT_TYPE,
      client_secret: process.env.CLIENT_SECRET } };

  request(options, function (error, response, body) {
    if (error) throw new Error(error);

    //define token
    token = JSON.parse(body).access_token;

    if (typeof token !== 'undefined'){
    var options = { method: 'GET',
      url: ciscoSupportUrl + bugId,
      headers:
       { 'postman-token': '3f23673f-b6c1-61c7-4877-9ef229cbc17d',
         'cache-control': 'no-cache',
         accept: 'application/json',
         authorization: 'Bearer ' + token } };

    request(options, function (error, response, body) {
      if (error) throw new Error(error);
      // console.log(JSON.parse(body).bugs[0]);
      // console.log(roomId);
      // console.log(bugId);
      var ifNotFixed = '';
      if (typeof JSON.parse(body) !== 'undefined'){
      //Check to see if the bug has a headline, as all legit bugs should
      if (JSON.parse(body).bugs[0].headline !== ''){

      if (JSON.parse(body).bugs[0].known_fixed_releases == '') {
        ifNotFixed = 'none';
      } else {
        ifNotFixed = JSON.parse(body).bugs[0].known_fixed_releases
      }

      //Send bug info to group as a summary if its legit
      spark.client.messages.createMessage(
        {
          "body":{
            "roomId": roomId,
            "markdown":
            '###'+JSON.parse(body).bugs[0].headline+'\n\n'+
            '**Product**: '+JSON.parse(body).bugs[0].product+
            '  **Severity**: '+JSON.parse(body).bugs[0].severity+
            '  **Case Count**: '+JSON.parse(body).bugs[0].support_case_count+'\n\n'+
            '**Effected Release(s)**: '+JSON.parse(body).bugs[0].known_affected_releases+
            '  **Fixed Release(s)**: '+ifNotFixed,
          }
        }
      )
    }
    else {
      //Or else send a note saying this is not a bug
      spark.client.messages.createMessage(
        {
          "body":{
            "roomId": roomId,
            "markdown": 'Ughh.. I cannot find '+bugId+' Should this be a bug?',
          }
        }
      )
    }
  }
    });//supportRequest
    }//token undefined check
  });//oauth2Request
}//getBugForGroup


});//webhook.on

var app = express();
app.use(bodyParser.json());

// add route for path that which is listening for web hooks
app.post('/spark', webhook.listen());

// start express server
var server = app.listen(process.env.PORT || 3000, function () {
  console.log('Listening on port %s', process.env.PORT);
});

process.on('SIGINT', function() {
  console.log('stopping...');
  server.close();
});
