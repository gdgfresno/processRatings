/*eslint-env node*/

//------------------------------------------------------------------------------
// node.js starter application
//------------------------------------------------------------------------------

// This application uses express as its web server
// for more info, see: http://expressjs.com
var express = require('express');

// For GUID generation
var uuid = require('node-uuid');

// create a new express server
var app = express();

// serve the files out of ./public as our main files
app.use(express.static(__dirname + '/public'));

app.get('/process', function(req, res) {
  var organizerSpeaker = 14;
  var fs = require('fs');
  var ratingsText = fs.readFileSync('ratings.json', 'utf8');
  var ratingsJson = JSON.parse(ratingsText);

  var sessionsText = fs.readFileSync('sessions.json', 'utf8');
  var speakersText = fs.readFileSync('speakers.json', 'utf8');
  var sessionsJson = JSON.parse(sessionsText);
  var speakersJson = JSON.parse(speakersText);
  var categoryNames = ['content', 'presentation', 'venue'];
  var categoryAggregate = {};
  var whole = [];
  var aggregateOutput = {
    categoryNames: categoryNames,
    ratingTitles: ['1', '2', '3', '4', '5']
  };
  categoryNames.forEach(function(cat) {
    categoryAggregate[cat] = {
      values: [],
      avgs: [],
      medians: []
    };
    aggregateOutput[cat] = {
      avg: null,
      median: null,
      distribution: [0, 0, 0, 0, 0]
    };
  });

  var aggregatedSessionData = {};
  Object.keys(ratingsJson).forEach(function(key) {
    var rating = ratingsJson[key];
    if (rating.sessions) {
      Object.keys(rating.sessions).forEach(function(sessionId) {
        var session = rating.sessions[sessionId];
        if (Object.keys(aggregatedSessionData).indexOf(sessionId) < 0) {
          aggregatedSessionData[sessionId] = {
            rating: {
              content: { values: [], distribution: [0, 0, 0, 0, 0] },
              presentation: { values: [], distribution: [0, 0, 0, 0, 0] },
              venue: { values: [], distribution: [0, 0, 0, 0, 0] }
            },
            comments: []
          };
        }
        categoryNames.forEach(function(cat) {
          if (session[cat]) {
            var sessionAggr = aggregatedSessionData[sessionId].rating[cat];
            sessionAggr.values.push(session[cat]);
            sessionAggr.distribution[session[cat] - 1]++;
            var sess = sessionsJson[sessionId];
            if (!sess.speakers || sess.speakers.length <= 0) {
              sess.speakers = [organizerSpeaker];  // Container speaker for generic sessions
            }
            if (sess.speakers.length > 1 || sess.speakers[0] != organizerSpeaker) {
              categoryAggregate[cat].values.push(session[cat]);
              aggregateOutput[cat].distribution[session[cat] - 1]++;
            }
          }
        });
        if (session.comment) {
          aggregatedSessionData[sessionId].comments.push(session.comment);
        }
      });
    }
  });

  var linkStub = 'https://iwdc2017r.firebaseapp.com/?uuid=' 
  var links = {};
  Object.keys(aggregatedSessionData).forEach(function(key) {
    var guid = uuid.v4().replace(/-/g, '');
    var sessionAggregate = aggregatedSessionData[key];
    var session = sessionsJson[key];
    sessionAggregate.title = session.title;
    sessionAggregate.uuid = guid;
    categoryNames.forEach(function(cat) {
      var values = sessionAggregate.rating[cat].values;
      if (values && values.length > 0) {
        values.sort();
        var valLen = values.length;
        var medianIndex = valLen % 2 == 0 ? valLen / 2 - 1 : (valLen - 1) / 2;
        var sum = values.reduce(function(a, b) {return a + b});
        var median = values[medianIndex];
        sessionAggregate.rating[cat]['median'] = median;
        var avg = sum / valLen;
        sessionAggregate.rating[cat]['avg'] = avg;
        sessionAggregate.rating[cat].values = valLen;
        if (session.speakers.length > 1 || session.speakers[0] != 14) {  // Don't count in general sessions
          categoryAggregate[cat].medians.push(median);
          categoryAggregate[cat].avgs.push(avg);
        }
      }
    });
    fs.writeFile('uuid-' + sessionAggregate.uuid + '.jsonp', JSON.stringify(sessionAggregate, null, 2));
    
    // Add to the speaker links
    var speakersStr = '';
    session.speakers.forEach(function(speakerId) {
      var speakerIdStr = speakerId.toString();
      var speaker = speakersJson[speakerIdStr];
      if (Object.keys(links).indexOf(speakerIdStr) < 0) {
        links[speakerIdStr] = {
          name: speaker.name,
          links: []
        };
      }
      links[speakerIdStr].links.push(linkStub + guid);

      if (speakersStr)
        speakersStr += ', ';
      speakersStr += speaker.name;
    });

    var sessionEntry = {
      name: session.title,
      speakers: speakersStr
    };
    categoryNames.forEach(function(cat) {
      var sessionRatingCat = sessionAggregate.rating[cat];
      sessionEntry[cat] = {
        avg: sessionRatingCat['avg'],
        median: sessionRatingCat['median'],
        sampleSize: sessionRatingCat['values']
      };
    });
    whole.push(sessionEntry);
  });

  categoryNames.forEach(function(cat) {
    var avgs = categoryAggregate[cat].avgs;
    if (avgs.length > 0) {
      var sum = avgs.reduce(function(a, b) {return a + b});
      aggregateOutput[cat].navg = avgs.length;
      aggregateOutput[cat].avg = sum / aggregateOutput[cat].navg;
      var medians = categoryAggregate[cat].medians; 
      sum = medians.reduce(function(a, b) {return a + b});
      aggregateOutput[cat].nmedian = medians.length;
      aggregateOutput[cat].median = sum / aggregateOutput[cat].nmedian;
    } else {
      aggregateOutput[cat].navg = null;
      aggregateOutput[cat].avg = null;
      aggregateOutput[cat].nmedian = null;
      aggregateOutput[cat].median = null;
    }
  });
  fs.writeFile('global.jsonp', "aggregateData=" + JSON.stringify(aggregateOutput, null, 2));
  fs.writeFile('whole.jsonp', "whole=" + JSON.stringify(whole, null, 2));

  // Object.keys(aggregatedSessionData).forEach(function(key) {
  //   var sessionAggregate = aggregatedSessionData[key];
  //   categoryNames.forEach(function(cat) {
  //     sessionAggregate.rating[cat]['conferenceMedian'] = medians[cat].value;
  //     sessionAggregate.rating[cat]['conferenceAvg'] = avgs[cat].value;
  //   });
  //   fs.writeFile('uuid-' + sessionAggregate.uuid + '.jsonp', JSON.stringify(sessionAggregate, null, 2));
  // });

  fs.writeFile('links.json', JSON.stringify(links, null, 2), function (err) {
    if (err) {
      res.send(err);
    } else {
      res.send('Processing finished');
    }
  });
});

// Start server on the specified port and binding host
app.listen(5858, '0.0.0.0', function() {
  // Print a message when the server starts listening
  console.log('server starting on 5858');
});
