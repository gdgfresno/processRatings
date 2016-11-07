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

  var aggregated = {};
  Object.keys(ratingsJson.ratings).forEach(function(key) {
    var rating = ratingsJson.ratings[key];
    if (rating.time > conferenceStart) {
      if (Object.keys(aggregated).indexOf(rating.session.toString()) < 0) {
        aggregated[rating.session] = {
          rating: {
            content: { values: [] },
            presentation: { values: [] },
            venue: { values: [] }
          },
          comments: []
        };
      }
      if (rating.rating) {
        aggregated[rating.session].rating[rating.category].values.push(rating.rating);
      } else {
        aggregated[rating.session].comments.push(rating.comment);
      }
    }
  });

  var sessionsText = fs.readFileSync('sessions.json', 'utf8');
  var speakersText = fs.readFileSync('speakers.json', 'utf8');
  var sessionsJson = JSON.parse(sessionsText);
  var speakersJson = JSON.parse(speakersText);

  var linkStub = 'http://atoth.sote.hu/~tocsa/vdf2016r/?uuid=' 
  var links = {};
  var categories = ['content', 'presentation', 'venue'];
  var avgs = {};
  var medians = {};
  categories.forEach(function(cat) {
    avgs[cat] = {};
    avgs[cat].values = [];
    medians[cat] = {};
    medians[cat].values = [];
  });
  Object.keys(aggregated).forEach(function(agg) {
    var guid = uuid.v4().replace(/-/g, '');
    var aggr = aggregated[agg];
    var session = sessionsJson[agg]; 
    if (!session.speakers || session.speakers.length <= 0) {
      session.speakers = [14];  // Rio is also for Generic Sessions
    }
    aggr.title = session.title;
    aggr.uuid = guid;
    categories.forEach(function(cat) {
      var values = aggr.rating[cat].values;
      if (values && values.length > 0) {
        values.sort();
        var valLen = values.length;
        var medianIndex = valLen % 2 == 0 ? valLen / 2 - 1 : (valLen - 1) / 2;
        var sum = values.reduce(function(a, b) {return a + b});
        var median = values[medianIndex];
        aggr.rating[cat]['median'] = median;
        var avg = sum / valLen;
        aggr.rating[cat]['avg'] = avg;
        if (session.speakers.length > 1 || session.speakers[0] != 14) { // Don't count in general sessions
          medians[cat].values.push(median);
          avgs[cat].values.push(avg);
        }
      }
    });
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
  });

  categories.forEach(function(cat) {
    var sum = avgs[cat].values.reduce(function(a, b) {return a + b});
    avgs[cat].value = sum / avgs[cat].values.length;
    sum = medians[cat].values.reduce(function(a, b) {return a + b});
    medians[cat].value = sum / medians[cat].values.length;
  });
  Object.keys(aggregated).forEach(function(agg) {
    var aggr = aggregated[agg];
    categories.forEach(function(cat) {
      aggr.rating[cat]['conferenceMedian'] = medians[cat].value;
      aggr.rating[cat]['conferenceAvg'] = avgs[cat].value;
    });
    fs.writeFile('uuid-' + aggr.uuid + '.jsonp', JSON.stringify(aggr, null, 2));
  });

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
