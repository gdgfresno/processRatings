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
  var fs = require('fs');
  var ratingsText = fs.readFileSync('ratings.json', 'utf8');
  var ratingsJson = JSON.parse(ratingsText);
  var conferenceStart = new Date('2016-10-22 8:00').getTime();

  var sessionsText = fs.readFileSync('sessions.json', 'utf8');
  var speakersText = fs.readFileSync('speakers.json', 'utf8');
  var sessionsJson = JSON.parse(sessionsText);
  var speakersJson = JSON.parse(speakersText);
  var categoryNames = ['content', 'presentation', 'venue'];
  var categoryAggregate = {};
  var whole = [];
  var aggregateOutput = {
    categoryNames: categoryNames,
    ratingTitles: ['Very dissatisfied', 'Dissatisfied', 'Neutral', 'Satisfied', 'Very satisfied']
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
  Object.keys(ratingsJson.ratings).forEach(function(key) {
    var rating = ratingsJson.ratings[key];
    if (rating.time > conferenceStart) {
      if (Object.keys(aggregatedSessionData).indexOf(rating.session.toString()) < 0) {
        aggregatedSessionData[rating.session] = {
          rating: {
            content: { values: [], distribution: [0, 0, 0, 0, 0] },
            presentation: { values: [], distribution: [0, 0, 0, 0, 0] },
            venue: { values: [], distribution: [0, 0, 0, 0, 0] }
          },
          comments: []
        };
      }
      if (rating.rating) {
        var sessionAggr = aggregatedSessionData[rating.session].rating[rating.category];
        sessionAggr.values.push(rating.rating);
        sessionAggr.distribution[rating.rating - 1]++;
        var session = sessionsJson[rating.session];
        if (!session.speakers || session.speakers.length <= 0) {
          session.speakers = [14];  // Rio is also for Generic Sessions
        }
        if (session.speakers.length > 1 || session.speakers[0] != 14) {
          categoryAggregate[rating.category].values.push(rating.rating);
          aggregateOutput[rating.category].distribution[rating.rating - 1]++;
        }
      } else {
        aggregatedSessionData[rating.session].comments.push(rating.comment);
      }
    }
  });

  var linkStub = 'https://vdf2016r.firebaseapp.com/?uuid=' 
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
    });

    var truncationLength = 40;
    var truncatedSessionTitle = session.title.substr(0, truncationLength - 1) + (session.title.length > truncationLength ? '…' : '');
    var sessionEntry = {
      name: truncatedSessionTitle
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
    var sum = avgs.reduce(function(a, b) {return a + b});
    aggregateOutput[cat].navg = avgs.length;
    aggregateOutput[cat].avg = sum / aggregateOutput[cat].navg;
    var medians = categoryAggregate[cat].medians; 
    sum = medians.reduce(function(a, b) {return a + b});
    aggregateOutput[cat].nmedian = medians.length;
    aggregateOutput[cat].median = sum / aggregateOutput[cat].nmedian;
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
